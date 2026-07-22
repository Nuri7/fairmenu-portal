// profile.js — the Profiel modal (sign up / log in / view profile).
// With Supabase (usesAccounts) it's real email+password auth; otherwise a
// device-local name-only profile.

import {
  usesAccounts, getProfile, isLoggedIn, getFavorites, getWallet,
  getAccessToken, refreshWallet,
  createProfile, signUp, signIn, logout,
} from './auth.js';

let modal;
let mode = 'signup'; // 'signup' | 'login' — only used when usesAccounts

// Spiegelt wallet_cap_cents() in de database (009_wallet_cap_160.sql). Opwaarderen
// blijft gemaximeerd op €150; dit is wat er mag STAAN.
const MAX_BALANCE_CENTS = 16000;
const euro = (c) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format((c || 0) / 100);

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'pf-overlay';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="pf-card" role="dialog" aria-modal="true">
      <button class="pf-close" type="button" aria-label="Sluiten">&times;</button>
      <div class="pf-body"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeProfile(); });
  modal.querySelector('.pf-close').addEventListener('click', closeProfile);
  return modal;
}

export function closeProfile() {
  if (modal) { modal.hidden = true; document.body.style.overflow = ''; }
}

function renderLoggedIn(body) {
  const p = getProfile();
  const favCount = getFavorites().length;
  // Tegoed hangt aan een écht account: de localStorage-fallback is een
  // apparaat-lokaal profiel zonder wachtwoord, en zonder identiteit bestaat er
  // geen terugvorderbare schuld. Server-side is het sowieso dicht (geen token).
  const w = usesAccounts ? getWallet() : null;
  const bal = w?.balanceCents ?? 0;
  body.innerHTML = `
    <div class="pf-avatar">${(p.name?.[0] || '🙂').toUpperCase()}</div>
    <h2>${p.name || 'Mijn profiel'}</h2>
    ${p.email ? `<p class="pf-sub">${p.email}</p>` : ''}
    <p class="pf-sub">${favCount} favoriet${favCount === 1 ? '' : 'en'} opgeslagen</p>
    ${w ? `
    <div class="pf-wallet">
      <p class="pf-wallet__label">💳 Mijn tegoed</p>
      <p class="pf-wallet__amount">${euro(bal)}</p>
      <p class="pf-sub">${bal > 0
        ? 'Je krijgt korting van FairMenu op alles wat je hiermee bestelt.'
        : 'Waardeer op en krijg tot 10% korting bij elke zaak — betaald door ons.'}</p>
      <button class="btn btn-primary pf-topup" type="button">Tegoed opwaarderen</button>
    </div>` : ''}
    <button class="btn btn-secondary pf-logout" type="button">Uitloggen</button>`;
  body.querySelector('.pf-topup')?.addEventListener('click', () => renderTopUp(body));
  body.querySelector('.pf-logout').addEventListener('click', async () => { await logout(); openProfile(); });
}

// Vierde rendermodus. BEWUST geen extra waarde in de module-globale `mode`: die
// blijft plakken tussen openingen, en dan opent Profiel de volgende keer op het
// opwaardeerscherm.
function renderTopUp(body) {
  const w = getWallet() || { balanceCents: 0, headroomCents: MAX_BALANCE_CENTS };
  const ladder = w.ladder || [
    { cents: 2500, label: '2,5%' }, { cents: 5000, label: '5%' },
    { cents: 10000, label: '7,5%' }, { cents: 15000, label: '10%' },
  ];
  const room = w.headroomCents ?? MAX_BALANCE_CENTS;
  const tiles = ladder.map((l) => {
    const off = l.cents > room;
    return `<button class="pf-tile${off ? ' is-off' : ''}" type="button" data-cents="${l.cents}"
      ${off ? `disabled title="Dit past niet binnen je maximum van ${euro(MAX_BALANCE_CENTS)}."` : ''}>
      <span class="pf-tile__amt">${euro(l.cents)}</span>
      <span class="pf-tile__pct">${l.label} korting</span></button>`;
  }).join('');

  body.innerHTML = `
    <div class="pf-avatar">💳</div>
    <h2>Tegoed opwaarderen</h2>
    <p class="pf-sub">Je tegoed is altijd €1 = €1. De korting krijg je bij het bestellen — en
      die betalen wij, niet de zaak.</p>
    <div class="pf-tiles">${tiles}</div>
    <p class="pf-sub">${room <= 0
      ? `Je zit op het maximum van ${euro(MAX_BALANCE_CENTS)}. Besteed eerst wat tegoed.`
      : `Je kunt maximaal ${euro(MAX_BALANCE_CENTS)} tegoed hebben. Je hebt nu
         ${euro(w.balanceCents)} — er kan nog ${euro(room)} bij.`}</p>
    <p class="pf-error" hidden></p>
    <button class="btn btn-primary pf-go" type="button" disabled>Opwaarderen met iDEAL</button>
    <p class="pf-fineprint">Alleen met iDEAL. Je tegoed vervalt niet en je kunt het altijd terugvragen.</p>
    <button class="btn btn-secondary pf-back" type="button">Terug</button>`;

  const goBtn = body.querySelector('.pf-go');
  const errEl = body.querySelector('.pf-error');
  let chosen = 0;
  body.querySelectorAll('.pf-tile').forEach((t) => t.addEventListener('click', () => {
    body.querySelectorAll('.pf-tile').forEach((o) => o.classList.remove('is-on'));
    t.classList.add('is-on');
    chosen = parseInt(t.dataset.cents, 10);
    goBtn.disabled = false;
  }));
  body.querySelector('.pf-back').addEventListener('click', () => renderLoggedIn(body));

  goBtn.addEventListener('click', async () => {
    if (!chosen) return;
    goBtn.disabled = true; goBtn.textContent = 'Doorsturen naar iDEAL…';
    errEl.hidden = true;
    try {
      const token = await getAccessToken();
      const res = await fetch('https://fairmenu.app/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountCents: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Er ging iets mis');
      window.location.href = data.checkoutUrl;
    } catch (e) {
      errEl.textContent = e.message || 'Er ging iets mis — probeer opnieuw.';
      errEl.hidden = false;
      goBtn.disabled = false; goBtn.textContent = 'Opwaarderen met iDEAL';
    }
  });
}

// Terugkomst van iDEAL: de status ophalen (pull-reconciliatie, voor het geval de
// webhook niet aankwam) en het profiel op het tegoed openen.
export async function finishTopUp(topupId) {
  const m = ensureModal();
  const body = m.querySelector('.pf-body');
  body.innerHTML = `<div class="pf-avatar">💳</div><h2>Tegoed</h2>
    <p class="pf-sub">Je betaling wordt verwerkt…</p>`;
  m.hidden = false;
  document.body.style.overflow = 'hidden';
  let msg = 'Je betaling is nog niet binnen. Zodra dat zo is, staat je tegoed er automatisch op.';
  try {
    const token = await getAccessToken();
    const res = await fetch(`https://fairmenu.app/api/wallet/topup/status?id=${encodeURIComponent(topupId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.status === 'paid') msg = `Gelukt — er staat nu ${euro(data.balanceCents)} op je tegoed.`;
  } catch { /* melding hieronder dekt dit */ }
  await refreshWallet();
  const body2 = m.querySelector('.pf-body');
  // De sessie kan intussen weg zijn (nieuw tabblad na de bankapp): dan is er
  // geen profiel om te tekenen en hoort de gast eerst in te loggen.
  if (!isLoggedIn()) { renderAuth(body2, 'Log in om je tegoed te zien.'); return; }
  renderLoggedIn(body2);
  const note = document.createElement('p');
  note.className = 'pf-hint';
  note.textContent = msg;
  body2.prepend(note);
}

// Real accounts: email + password, with a signup/login toggle.
function renderAuth(body, hint) {
  const isSignup = mode === 'signup';
  body.innerHTML = `
    <div class="pf-avatar">🙂</div>
    <h2>${isSignup ? 'Maak je account' : 'Log in'}</h2>
    ${hint ? `<p class="pf-hint">${hint}</p>` : '<p class="pf-sub">Bewaar je favoriete cafés op al je apparaten.</p>'}
    <form class="pf-form">
      ${isSignup ? '<label>Naam<input name="name" type="text" required placeholder="Je naam" autocomplete="name" /></label>' : ''}
      <label>E-mail<input name="email" type="email" required placeholder="je@email.nl" autocomplete="email" /></label>
      <label>Wachtwoord<input name="password" type="password" required minlength="6" placeholder="Min. 6 tekens" autocomplete="${isSignup ? 'new-password' : 'current-password'}" /></label>
      <p class="pf-error" hidden></p>
      <button class="btn btn-primary" type="submit">${isSignup ? 'Account aanmaken' : 'Inloggen'}</button>
    </form>
    <p class="pf-switch">
      ${isSignup ? 'Al een account?' : 'Nog geen account?'}
      <button type="button" class="pf-link">${isSignup ? 'Log in' : 'Maak er een'}</button>
    </p>`;

  body.querySelector('.pf-link').addEventListener('click', () => { mode = isSignup ? 'login' : 'signup'; renderAuth(body, hint); });

  body.querySelector('.pf-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = (fd.get('email') || '').toString().trim();
    const password = (fd.get('password') || '').toString();
    const name = (fd.get('name') || '').toString().trim();
    const errEl = body.querySelector('.pf-error');
    const btn = body.querySelector('button[type="submit"]');
    errEl.hidden = true;
    btn.disabled = true; btn.textContent = '…';

    const { error } = isSignup ? await signUp({ email, password, name }) : await signIn({ email, password });
    if (error) {
      errEl.textContent = error; errEl.hidden = false;
      btn.disabled = false; btn.textContent = isSignup ? 'Account aanmaken' : 'Inloggen';
    } else {
      openProfile(); // auth change → re-render as logged-in
    }
  });
}

// Local fallback: name-only device profile.
function renderLocal(body, hint) {
  body.innerHTML = `
    <div class="pf-avatar">🙂</div>
    <h2>Maak je profiel</h2>
    ${hint ? `<p class="pf-hint">${hint}</p>` : '<p class="pf-sub">Bewaar je favoriete cafés en vind ze zo terug.</p>'}
    <form class="pf-form">
      <label>Naam<input name="name" type="text" required placeholder="Je naam" autocomplete="name" /></label>
      <label>E-mail <span class="pf-opt">(optioneel)</span><input name="email" type="email" placeholder="je@email.nl" autocomplete="email" /></label>
      <button class="btn btn-primary" type="submit">Profiel aanmaken</button>
    </form>
    <p class="pf-fineprint">Wordt lokaal op dit apparaat bewaard.</p>`;
  body.querySelector('.pf-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = (fd.get('name') || '').toString().trim();
    if (!name) return;
    createProfile({ name, email: fd.get('email')?.toString() });
    openProfile();
  });
}

// hint: optional line shown above the form (e.g. why login is needed).
export function openProfile(hint) {
  const m = ensureModal();
  const body = m.querySelector('.pf-body');
  if (isLoggedIn()) renderLoggedIn(body);
  else if (usesAccounts) renderAuth(body, hint);
  else renderLocal(body, hint);
  m.hidden = false;
  document.body.style.overflow = 'hidden';
}
