// In-portal vendor detail view, rendered in a full-screen overlay so the user
// never leaves the portal.
import {
  isLoggedIn, isFavorite, toggleFavorite,
  usesAccounts, getAccessToken, refreshWallet,
} from './auth.js';

const ICON_HEART = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;

const fmtPrice = (p, ccy = 'EUR', locale = 'nl-NL') =>
  typeof p === 'number'
    ? new Intl.NumberFormat(locale, { style: 'currency', currency: ccy }).format(p)
    : '';

const menuCache = new Map();

import { supabase, hasSupabase } from './supabase.js';
import { foodEmoji } from './food-emoji.js';

// Live tenants serve the same menu the vendor edits in tenant admin.
async function loadMenuFromDb(shop) {
  if (!hasSupabase) return null;
  const { data: t, error } = await supabase
    .from('tenants')
    .select(`id, status, name, slug, menu_verified,
      menu_categories ( id, name, sort ),
      menu_items ( id, category_id, name, description, price_cents, tags, image_url, available, sort,
                   menu_item_variants ( name, price_cents, sort ) )`)
    .eq('slug', shop.id)
    .maybeSingle();
  // Show the menu for live venues AND for unclaimed/pending listings that we've
  // already given a menu — every consumer can view it before it's claimed.
  if (error || !t || !['active', 'unclaimed', 'pending'].includes(t.status)) return null;
  const items = (t.menu_items || []).filter((i) => i.available !== false);
  if (items.length === 0) return null;
  items.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const cats = (t.menu_categories || []).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return {
    vendor: { name: t.name, slug: t.slug, currency: 'EUR', locale: 'nl-NL' },
    // Kaarten die wij van internet hebben geplukt zijn niet door de zaak
    // bevestigd; die krijgen dezelfde "prijzen indicatief"-banner als de
    // statische voorbeeldmenu's. Pas als de ondernemer zijn kaart zelf invoert
    // of goedkeurt gaat menu_verified op true.
    prices_verified: t.menu_verified === true,
    _payEnabled: false,
    _discountPct: 0,
    _walletEnabled: false,
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
    items: items.map((i) => {
      // Items met maatvarianten (koffie klein/middel/groot) hebben zelf geen
      // prijs; die staat per variant. Zonder dit toonde de kaart "€ 0,00".
      const varianten = (i.menu_item_variants || [])
        .slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      const vanaf = varianten.length
        ? Math.min(...varianten.map((v) => v.price_cents)) / 100
        : null;
      return {
        id: i.id,
        name: i.name,
        category: i.category_id,
        // A source can publish its assortment without prices. Preserve null so
        // the portal leaves the price blank instead of inventing "€ 0,00".
        price: i.price_cents == null ? vanaf : i.price_cents / 100,
        description: i.description || '',
        tags: i.tags || [],
        _image_url: i.image_url || null,
        // Bestellen kan pas als de gast een maat kan kiezen; die keuze bestaat
        // hier nog niet, dus zo'n item is voorlopig alleen te lezen.
        _variants: varianten.map((v) => ({ name: v.name, price: v.price_cents / 100 })),
      };
    }),
    _db: true,
  };
}

// Betaal- en kortinginstellingen van de zaak. BEWUST buiten menuCache: die cache
// heeft geen TTL, dus stond dit erin dan werd de korting één keer per zaak per
// paginabezoek opgehaald en daarna nooit meer. Een gast die de kaart heropent zou
// dan een korting kunnen zien die de zaak intussen heeft uitgezet. Eén klein
// verzoek per keer openen is die zekerheid waard.
async function loadPaySettings(slug) {
  try {
    const r = await fetch(`https://fairmenu.app/api/pay/settings?slug=${encodeURIComponent(slug)}`);
    const j = await r.json();
    return {
      payEnabled: j?.payPickupEnabled === true,
      discountPct: [10, 20].includes(j?.discountPct) ? j.discountPct : 0,
      // De STAFFEL hoort hier bewust niet bij: die hangt aan de gast (welke
      // opwaarderingen heeft hij nog openstaan), niet aan de zaak.
      walletEnabled: j?.walletEnabled === true,
    };
  } catch {
    return { payEnabled: false, discountPct: 0, walletEnabled: false };
  }
}

async function loadMenu(shop) {
  const shopId = shop.id;
  if (menuCache.has(shopId)) return menuCache.get(shopId);
  const menu = await loadMenuFromDb(shop);
  if (!menu) throw new Error(`Geen menu voor ${shopId}`);
  menuCache.set(shopId, menu);
  return menu;
}

const photoSrc = (menu, itemId) =>
  menu?.items.find((item) => item.id === itemId)?._image_url || null;

// Fill a photo container: real photo when we have one, else the same
// emoji placeholder the tenant sites use.
function fillPhoto(container, menu, item) {
  const src = photoSrc(menu, item.id);
  if (src) {
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy';
    img.onerror = () => { img.remove(); fillEmoji(container, item); };
    container.appendChild(img);
  } else {
    fillEmoji(container, item);
  }
}
function fillEmoji(container, item) {
  container.classList.add('is-emoji');
  const span = document.createElement('span');
  span.className = 'd-emoji';
  span.textContent = foodEmoji(item.name, item.tags);
  container.appendChild(span);
}

// ---- Order state (per open vendor) ----
// A "show to the waiter" selection, matching the deck's "Bestel bij ober" flow.
// No payment, no backend — just a running list + total.
let order = new Map();      // itemId -> { item, qty }
let orderMenu = null;       // the menu the current order belongs to
const onOrderChange = new Set();
// Idempotentiesleutel per KARSAMENSTELLING. Zonder deze sleutel staat de hele
// idempotentiemachine van pay-order.ts op dit kanaal uit: bij Mollie is dat een
// dubbele payment, bij tegoed een dubbele AFSCHRIJVING. Vervalt bij elke mutatie
// van de kar, zodat een gewijzigde bestelling ook echt een nieuwe order is.
let clientRef = null;
// Gekozen betaalwijze: null = de gast heeft nog niets gekozen, dan mag de
// tegoed-offerte hem instellen. Staat hier en niet in showOrder(): die functie
// tekent bij elke verwijderde regel opnieuw, en een lokale variabele zette een
// bewuste keuze voor iDEAL ~300 ms later stilzwijgend terug op tegoed — met een
// afschrijving van e-geld als gevolg. Zelfde reden als clientRef hierboven.
let payMethod = null;      // null | 'ideal' | 'balance'

function newRef() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}
function ensureClientRef() { if (!clientRef) clientRef = newRef(); return clientRef; }

function resetOrder(menu) { order = new Map(); orderMenu = menu; clientRef = null; payMethod = null; }
function orderQty(id) { return order.get(id)?.qty || 0; }
function orderCount() { let n = 0; for (const { qty } of order.values()) n += qty; return n; }
function orderTotal() { let t = 0; for (const { item, qty } of order.values()) t += (item.price || 0) * qty; return t; }
function addToOrder(item, delta) {
  const cur = order.get(item.id)?.qty || 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) order.delete(item.id);
  else order.set(item.id, { item, qty: next });
  clientRef = null;
  onOrderChange.forEach(fn => fn());
}

function itemCard(menu, item, ccy, locale) {
  const el = document.createElement('article');
  el.className = 'd-item';
  el.innerHTML = `
    <div class="d-item__photo"></div>
    <div class="d-item__body">
      <div class="d-item__row">
        <h4></h4><span class="d-item__price"></span>
      </div>
      <p class="d-item__desc"></p>
      <div class="d-item__tags"></div>
      <div class="d-item__add"></div>
    </div>`;
  fillPhoto(el.querySelector('.d-item__photo'), menu, item);
  el.querySelector('h4').textContent = item.name;
  el.querySelector('.d-item__price').textContent = item._variants?.length
    ? `vanaf ${fmtPrice(item.price, ccy, locale)}`
    : fmtPrice(item.price, ccy, locale);
  el.querySelector('.d-item__desc').textContent = item.description || '';
  const tags = el.querySelector('.d-item__tags');
  for (const t of item.tags || []) {
    const chip = document.createElement('span');
    chip.className = 'd-tag';
    chip.textContent = t;
    tags.appendChild(chip);
  }

  // Add / stepper control — alleen als er ook echt besteld kan worden. Staat
  // "Betalen & afhalen" uit, dan liep een mandje dood op een scherm zonder
  // vervolgstap; dan is de kaart puur om te lezen.
  const addWrap = el.querySelector('.d-item__add');
  if (!menu._payEnabled || item._variants?.length) { addWrap.remove(); return el; }
  const renderControl = () => {
    const qty = orderQty(item.id);
    if (qty === 0) {
      addWrap.innerHTML = `<button class="d-add" type="button">+ Toevoegen</button>`;
      addWrap.querySelector('.d-add').onclick = () => addToOrder(item, +1);
    } else {
      addWrap.innerHTML = `
        <div class="d-step">
          <button class="d-step__btn" type="button" data-d="-1" aria-label="Minder">−</button>
          <span class="d-step__n">${qty}</span>
          <button class="d-step__btn" type="button" data-d="1" aria-label="Meer">+</button>
        </div>`;
      addWrap.querySelectorAll('.d-step__btn').forEach(b =>
        b.onclick = () => addToOrder(item, parseInt(b.dataset.d, 10)));
    }
  };
  renderControl();
  onOrderChange.add(renderControl);
  return el;
}

// Eén stem per gast per zaak. De id blijft lokaal: hij is er alleen om te
// ontdubbelen, niet om iemand te volgen.
function anonId() {
  let id = null;
  try { id = localStorage.getItem('fm:anon'); } catch { /* private mode */ }
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID()
      : [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('fm:anon', id); } catch { /* dan telt hij per bezoek */ }
  }
  return id;
}

function interestBox(slug) {
  const box = document.createElement('div');
  box.className = 'd-interest';
  box.innerHTML = `
    <p class="d-interest__txt">Hier kun je nog niet bestellen via FairMenu.</p>
    <button class="btn btn-primary d-interest__go" type="button">Laat weten dat je dat wilt</button>
    <p class="d-interest__count" hidden></p>`;
  const btn = box.querySelector('.d-interest__go');
  const txt = box.querySelector('.d-interest__txt');
  const cnt = box.querySelector('.d-interest__count');

  fetch(`https://fairmenu.app/api/interest?slug=${encodeURIComponent(slug)}`)
    .then(r => r.json())
    .then(j => { if (j?.count > 0) { cnt.hidden = false; cnt.textContent = `${j.count} ${j.count === 1 ? 'gast wil' : 'gasten willen'} hier bestellen`; } })
    .catch(() => { /* teller is bijzaak */ });

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Bezig…';
    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = usesAccounts && isLoggedIn() ? await getAccessToken() : null;
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch('https://fairmenu.app/api/interest', {
        method: 'POST', headers,
        body: JSON.stringify({ slug, anonId: anonId() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Er ging iets mis');
      txt.textContent = j.alreadyCounted
        ? 'Je stem telde al mee — we laten het ze weten.'
        : 'Genoteerd, bedankt! We laten deze zaak weten dat je hier wilt bestellen.';
      btn.remove();
      if (j.count > 0) { cnt.hidden = false; cnt.textContent = `${j.count} ${j.count === 1 ? 'gast wil' : 'gasten willen'} hier bestellen`; }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Laat weten dat je dat wilt';
      txt.textContent = e.message;
    }
  };
  return box;
}

function renderMenu(root, menu) {
  const ccy = menu.vendor?.currency || 'EUR';
  const locale = menu.vendor?.locale || 'nl-NL';
  const body = root.querySelector('.d-body');
  body.innerHTML = '';

  // Zaak doet (nog) niet mee: geen bestelknoppen, dus zou de kaart doodlopen.
  // In plaats van de gast te vragen de ondernemer te overtuigen, vangen we zijn
  // intentie op als signaal — dat levert een verkoopargument met bewijs op
  // ("37 van uw gasten vroegen erom") en rangschikt de listings op echte vraag.
  if (menu._db && !menu._payEnabled) {
    body.appendChild(interestBox(menu.vendor.slug));
  }

  // Honesty banner for auto-seeded vendors whose prices aren't confirmed yet.
  if (menu.prices_verified === false) {
    const note = document.createElement('div');
    note.className = 'd-pricenote';
    note.textContent = 'ⓘ Prijzen indicatief — controleer ter plaatse';
    body.appendChild(note);
  }

  // Category chips
  const nav = document.createElement('nav');
  nav.className = 'd-cats';
  const cats = [{ id: '__all', name: 'Alles' }, ...menu.categories];
  nav.innerHTML = cats.map((c, i) =>
    `<button class="d-cat${i === 0 ? ' active' : ''}" data-cat="${c.id}">${c.name}</button>`
  ).join('');
  body.appendChild(nav);

  const grid = document.createElement('div');
  grid.className = 'd-grid';
  body.appendChild(grid);

  const paint = (catId) => {
    // Per-card control listeners are transient; drop them before repainting so
    // they don't accumulate across category switches.
    onOrderChange.clear();
    onOrderChange.add(updateCartBar);
    grid.innerHTML = '';
    const items = menu.items
      .filter(i => i.available !== false)
      .filter(i => catId === '__all' || i.category === catId);
    if (!items.length) { grid.innerHTML = '<p class="d-empty">Niets in deze categorie.</p>'; return; }
    for (const it of items) grid.appendChild(itemCard(menu, it, ccy, locale));
  };

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.d-cat');
    if (!btn) return;
    nav.querySelectorAll('.d-cat').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    paint(btn.dataset.cat);
  });
  paint('__all');
  updateCartBar();
}

// ---- Order (cart) bar + summary ----
function updateCartBar() {
  if (!overlay) return;
  let bar = overlay.querySelector('.d-cartbar');
  const count = orderCount();
  if (count === 0) { if (bar) bar.remove(); return; }
  const ccy = orderMenu?.vendor?.currency || 'EUR';
  const locale = orderMenu?.vendor?.locale || 'nl-NL';
  if (!bar) {
    bar = document.createElement('button');
    bar.className = 'd-cartbar';
    bar.type = 'button';
    bar.onclick = showOrder;
    overlay.querySelector('.d-panel').appendChild(bar);
  }
  bar.innerHTML =
    `<span class="d-cartbar__n">${count}</span>
     <span class="d-cartbar__label">Mijn bestelling</span>
     <span class="d-cartbar__total">${fmtPrice(orderTotal(), ccy, locale)}</span>`;
}

function showOrder() {
  const menu = orderMenu;
  const ccy = menu?.vendor?.currency || 'EUR';
  const locale = menu?.vendor?.locale || 'nl-NL';
  const body = overlay.querySelector('.d-body');
  const existing = overlay.querySelector('.d-cartbar');
  if (existing) existing.remove();

  const rows = [...order.values()].map(({ item, qty }) => `
    <div class="d-orow" data-id="${item.id}">
      <span class="d-orow__q">${qty}×</span>
      <span class="d-orow__name">${item.name}</span>
      <span class="d-orow__price">${fmtPrice((item.price || 0) * qty, ccy, locale)}</span>
      <button class="d-orow__rm" type="button" aria-label="Verwijder">×</button>
    </div>`).join('');

  const canPay = !!(menu?._db && menu?._payEnabled);
  // Zelfde regel als de server (platform/lib/pay-order.ts): één keer afronden op
  // het totaal, nooit per regel — anders tellen de zichtbare regels niet op tot
  // het betaalde bedrag en weigert de checkout met 409.
  const pct = canPay ? (menu?._discountPct ?? 0) : 0;
  const grossCents = Math.round(orderTotal() * 100);
  const discountCents = Math.round(grossCents * pct / 100);
  // netCents = menuprijs − korting van de ZAAK. Dit blijft expectedAmountCents,
  // ook als er met tegoed betaald wordt: de FairMenu-korting is een andere
  // grootheid en heeft zijn eigen veld (expectedDebitCents).
  const netCents = grossCents - discountCents;
  const net = netCents / 100;
  // Tegoed vraagt om een écht account (de localStorage-fallback heeft geen
  // wachtwoord en dus geen token); de server blijft hoe dan ook de autoriteit.
  const walletPossible = canPay && !!menu?._walletEnabled && usesAccounts && isLoggedIn();

  body.innerHTML = `
    <div class="d-order">
      <h3 class="d-order__title">Mijn bestelling</h3>
      <p class="d-order__hint">${canPay
        ? 'Betaal online en haal op aan de bar — of toon dit scherm aan de bediening.'
        : 'Toon dit scherm aan de bediening om te bestellen.'}</p>
      <div class="d-order__list">${rows}</div>
      <div class="d-order__sums"></div>
      ${canPay ? `
      <div class="d-pay">
        <label class="d-pay__label">Je naam (voor het afhalen)
          <input class="d-pay__name" type="text" maxlength="50" placeholder="bijv. Nuri" autocomplete="given-name">
        </label>
        <div class="d-pay__choice" hidden></div>
        <button class="btn btn-primary d-pay__go" type="button">Betalen &amp; afhalen · ${fmtPrice(net, ccy, locale)}</button>
        <p class="d-pay__err" role="alert"></p>
      </div>` : ''}
      <div class="d-order__actions">
        <button class="btn btn-secondary" data-act="back-menu">Verder kiezen</button>
        <button class="btn ${canPay ? 'btn-secondary' : 'btn-primary'}" data-act="clear">Wis bestelling</button>
      </div>
    </div>`;

  const sums = body.querySelector('.d-order__sums');
  let quote = null;          // uitkomst van /api/wallet/quote
  // payMethod leeft buiten deze functie (zie boven); hier alleen de afgeleide.
  const useBalance = () => payMethod === 'balance' && !!quote?.sufficient;

  // De bedragen komen van de server, nooit uit een JS-berekening: de FIFO-som
  // over de opwaardeer-emmers bestaat maar één keer, in wallet_quote().
  function paintSums() {
    const bal = useBalance();
    const fmCents = bal ? quote.fmDiscountCents : 0;
    const payCents = bal ? quote.debitCents : netCents;
    sums.innerHTML = `
      ${pct > 0 || fmCents > 0 ? `
      <div class="d-order__total d-order__sub"><span>Subtotaal</span><span>${fmtPrice(orderTotal(), ccy, locale)}</span></div>` : ''}
      ${pct > 0 ? `
      <div class="d-order__total d-order__discount"><span>Korting van de zaak ${pct}%</span><span>−${fmtPrice(discountCents / 100, ccy, locale)}</span></div>` : ''}
      ${fmCents > 0 ? `
      <div class="d-order__total d-order__discount"><span>Korting van FairMenu</span><span>−${fmtPrice(fmCents / 100, ccy, locale)}</span></div>` : ''}
      <div class="d-order__total"><span>${bal ? 'Je betaalt met tegoed' : 'Totaal'}</span><span>${fmtPrice(payCents / 100, ccy, locale)}</span></div>
      ${bal ? `
      <p class="d-order__hint">Tegoed hierna: ${fmtPrice(quote.balanceAfterCents / 100, ccy, locale)}.
        De korting van FairMenu betalen wij, niet de zaak — die ontvangt gewoon
        ${fmtPrice(netCents / 100, ccy, locale)}.</p>` : ''}`;
    if (goBtn) {
      goBtn.textContent = bal
        ? `Betalen met tegoed · ${fmtPrice(payCents / 100, ccy, locale)}`
        : `Betalen & afhalen · ${fmtPrice(payCents / 100, ccy, locale)}`;
    }
  }

  const goBtn = body.querySelector('.d-pay__go');
  const nameEl = body.querySelector('.d-pay__name');
  const errEl = body.querySelector('.d-pay__err');
  const choiceEl = body.querySelector('.d-pay__choice');
  paintSums();

  function paintChoice() {
    if (!choiceEl || !quote?.sufficient) return;
    choiceEl.hidden = false;
    // Bewust het BEDRAG en nooit een percentage: bij een bon die twee
    // opwaardeer-emmers raakt bestaat dat percentage niet.
    choiceEl.innerHTML = `
      <label class="d-paychoice"><input type="radio" name="d-paymethod" value="balance"
        ${payMethod === 'balance' ? 'checked' : ''}> Betalen met mijn tegoed (${fmtPrice(quote.balanceCents / 100, ccy, locale)})</label>
      <label class="d-paychoice"><input type="radio" name="d-paymethod" value="ideal"
        ${payMethod === 'ideal' ? 'checked' : ''}> Betalen met iDEAL</label>`;
    choiceEl.querySelectorAll('input[name="d-paymethod"]').forEach((r) =>
      r.addEventListener('change', () => { payMethod = r.value; paintSums(); }));
  }

  if (walletPossible) {
    // Gedebouncet: showOrder wordt bij elke verwijderde regel opnieuw getekend.
    clearTimeout(showOrder._quoteTimer);
    showOrder._quoteTimer = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('https://fairmenu.app/api/wallet/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            slug: menu.vendor.slug,
            lines: [...order.values()].map(({ item, qty }) => ({ itemId: item.id, qty })),
          }),
        });
        const data = await res.json();
        // Het scherm kan intussen vervangen zijn (andere zaak, ander mandje).
        if (!res.ok || !data.walletEnabled || !body.contains(sums)) return;
        quote = data;
        // Alleen als DEFAULT, nooit als correctie: heeft de gast iDEAL gekozen,
        // dan blijft dat staan — ook nadat de bestellade opnieuw is getekend.
        if (quote.sufficient && payMethod === null) payMethod = 'balance';
        paintChoice();
        paintSums();
      } catch { /* stil: iDEAL blijft gewoon werken */ }
    }, 300);
  }

  if (canPay) {
    goBtn.onclick = async () => {
      const customerName = nameEl.value.trim();
      if (!customerName) { errEl.textContent = 'Vul je naam in voor het afhalen.'; nameEl.focus(); return; }
      const bal = useBalance();
      goBtn.disabled = true;
      goBtn.textContent = bal ? 'Bezig met afrekenen…' : 'Doorsturen naar betaling…';
      errEl.textContent = '';
      const lines = [...order.values()].map(({ item, qty }) => ({ itemId: item.id, qty }));
      try {
        if (bal) {
          const token = await getAccessToken();
          const res = await fetch('https://fairmenu.app/api/wallet/spend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              slug: menu.vendor.slug, customerName, lines, clientRef: ensureClientRef(),
              expectedAmountCents: netCents,
              expectedDebitCents: quote.debitCents,
            }),
          });
          const data = await res.json();
          if (res.status === 401) {
            window.dispatchEvent(new CustomEvent('fm:need-login',
              { detail: { hint: 'Log in met je FairMenu-profiel om je tegoed te gebruiken.' } }));
            throw new Error('Log in om je tegoed te gebruiken.');
          }
          if (!res.ok) throw new Error(data.error || 'Er ging iets mis');
          refreshWallet();
          window.location.href = data.redirect;
          return;
        }
        const res = await fetch('https://fairmenu.app/api/pay/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: menu.vendor.slug,
            customerName,
            lines,
            clientRef: ensureClientRef(),
            // Het bedrag dat op de knop stond. Is de korting intussen omgezet,
            // dan weigert de server met 409 in plaats van meer af te schrijven.
            expectedAmountCents: netCents,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Er ging iets mis');
        window.location.href = data.checkoutUrl;
      } catch (e) {
        errEl.textContent = e.message || 'Er ging iets mis — probeer opnieuw.';
        goBtn.disabled = false;
        paintSums();
      }
    };
  }

  body.querySelectorAll('.d-orow__rm').forEach(btn =>
    btn.onclick = () => {
      const id = btn.closest('.d-orow').dataset.id;
      const entry = order.get(id);
      if (entry) addToOrder(entry.item, -entry.qty);
      if (orderCount() === 0) renderMenu(overlay, menu);
      else showOrder();
    });
  body.querySelector('[data-act="back-menu"]').onclick = () => renderMenu(overlay, menu);
  body.querySelector('[data-act="clear"]').onclick = () => { resetOrder(menu); renderMenu(overlay, menu); };
}

// ---- Overlay shell ----
// Inline SVGs so the critical controls never depend on the lucide CDN loading.
const ICON_BACK = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`;

let overlay;
let isOpen = false;
let historyPushed = false;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'd-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="d-panel" role="dialog" aria-modal="true">
      <header class="d-head">
        <button class="d-back" type="button" aria-label="Terug">${ICON_BACK}</button>
        <div class="d-head__title"><h2></h2><span class="d-head__loc"></span></div>
        <button class="d-fav" type="button" data-act="fav" aria-label="Favoriet">${ICON_HEART}</button>
      </header>
      <div class="d-body"></div>
    </div>`;
  document.body.appendChild(overlay);

  // Robust close: listen on the whole header for a click that lands on/in the
  // back button, so a tap on the SVG or its path still counts.
  overlay.querySelector('.d-head').addEventListener('click', (e) => {
    if (e.target.closest('.d-back')) { e.preventDefault(); requestClose(); }
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) requestClose(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) requestClose(); });

  // Phone hardware/gesture back button closes the overlay instead of leaving
  // the PWA. We push a history entry on open; back triggers popstate → close.
  window.addEventListener('popstate', () => { historyPushed = false; if (isOpen) doClose(); });

  return overlay;
}

// User asked to close (in-app button, backdrop, Esc): unwind the history entry
// we pushed, which fires popstate → doClose.
function requestClose() {
  if (historyPushed) { historyPushed = false; history.back(); }
  else doClose(false);
}

function doClose() {
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
  overlay.querySelector('.d-cartbar')?.remove();
  isOpen = false;
}

function markOpen() {
  isOpen = true;
  if (!historyPushed) {
    history.pushState({ fmOverlay: true }, '');
    historyPushed = true;
  }
}

export async function openVendor(shop) {
  const ov = ensureOverlay();
  ov.hidden = false;
  document.body.style.overflow = 'hidden';
  markOpen();
  ov.querySelector('.d-head__title h2').textContent = shop.name;
  ov.querySelector('.d-head__loc').textContent = shop.location || '';
  const body = ov.querySelector('.d-body');
  body.innerHTML = '<p class="d-empty">Menu laden…</p>';

  // Favorite heart — reflects state; gated behind a profile.
  const favBtn = ov.querySelector('.d-fav');
  const syncFav = () => favBtn.classList.toggle('is-fav', isLoggedIn() && isFavorite(shop.id));
  syncFav();
  favBtn.onclick = () => {
    if (toggleFavorite(shop.id)) syncFav();
    else window.dispatchEvent(new CustomEvent('fm:need-login',
      { detail: { hint: 'Maak een profiel om cafés als favoriet te bewaren.' } }));
  };

  // Fresh order per vendor open; drop any old card listeners + cart bar.
  onOrderChange.clear();
  ov.querySelector('.d-cartbar')?.remove();

  try {
    const menu = await loadMenu(shop);
    // Vers ophalen bij élke opening — zie loadPaySettings. Het menu mag gecached
    // blijven (een verouderde prijs vangt de server af met een 409), maar de
    // korting staat op het scherm en moet kloppen met wat er wordt afgeschreven.
    if (menu?._db) {
      const st = await loadPaySettings(menu.vendor.slug);
      menu._payEnabled = st.payEnabled;
      menu._discountPct = st.discountPct;
      menu._walletEnabled = st.walletEnabled;
    }
    resetOrder(menu);
    renderMenu(ov, menu);
  } catch (err) {
    renderInfo(ov, shop);
  }
}

// Listings without a menu still expose the address and claim route. OpenStreetMap
// provides navigation without pulling in a commercial map product.
function renderInfo(root, shop) {
  const body = root.querySelector('.d-body');
  const mapsUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(
    `${shop.name || ''} ${shop.address || shop.location || 'Amsterdam'}`
  )}`;

  body.innerHTML = `
    <div class="cs">
      <div class="cs-head">
        <span class="cs-badge">Menu volgt binnenkort</span>
      </div>
      ${shop.address ? `<p class="cs-addr">📍 ${shop.address}</p>` : ''}
      <a class="btn btn-primary cs-maps" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Open op de kaart</a>
      <div class="cs-claim">
        <p>Ben jij de eigenaar? Zet je échte menu online met AI-foto's — gratis.</p>
        <a class="btn btn-secondary" href="https://fairmenu.app/claim" target="_blank" rel="noopener noreferrer">Claim je zaak</a>
      </div>
    </div>`;
}
