import './style.css';
import { loadShops } from './data.js';
import { openVendor } from './detail.js';
import { ensureMap, filterMap, shopsWithin, showUserLocation, clearUserLocation,
         focusUser, nearestShop, mapReady } from './map.js';
import { requestPosition, cancelPosition, isStale, fmtDist, fmtAccuracy,
         geoSupported, GEO_ACCURACY_MAX } from './geo.js';
import placesData from './public/places-data.json';
import { getFavorites, isLoggedIn, initAuth, onAuthChange } from './auth.js';
import { openProfile, finishTopUp } from './profile.js';
import { initInstallHint } from './install.js';
import { registerSW } from 'virtual:pwa-register';

// autoUpdate (see vite.config) applies a new deploy automatically and reloads.
// Also poll hourly so an installed PWA that stays open for a long time picks up
// new builds without waiting for a manual reload.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, reg) {
    if (reg) setInterval(() => { reg.update(); }, 60 * 60 * 1000);
  },
  onOfflineReady() { console.log('PWA is ready to work offline'); },
});

// Open a café from a map pin: menu/info overlay for our own listings, external
// link for the (rare) externally-hosted ones.
function openShop(shop) {
  if (shop.comingSoon || shop.inPortal || shop.pendingClaim) openVendor(shop);
  else if (shop.links?.menu) window.open(shop.links.menu, '_blank', 'noopener');
  else openVendor(shop);
}

// The map is the whole app now — init it once on load.
// Shops come from the FairMenu database (baked list as offline fallback).
const shops = await loadShops();
const mapView = document.getElementById('mapView');
ensureMap(mapView, shops, openShop);

// Header count — reflects what's currently on the map.
const placeCountEl = document.getElementById('placeCount');
function setPlaceCount(n, suffix) {
  if (placeCountEl) placeCountEl.textContent =
    `${n} ${n === 1 ? 'zaak' : 'zaken'}${suffix ? ` · ${suffix}` : ''}`;
}
setPlaceCount(shops.length);

// Hydrate the session (Supabase) or local profile, then keep the Favorieten
// view in sync if favorites change while it's open.
const authReady = initAuth();
onAuthChange(() => {
  if (document.querySelector('.nav-item[data-view="favorites"]')?.classList.contains('active')) showFavorites();
});

// Terug van iDEAL na een opwaardering. Wacht op de sessie, want de statuscall
// heeft het toegangstoken nodig; ?topup= gaat meteen uit de URL zodat een
// refresh niet opnieuw "wordt verwerkt…" toont.
const topupId = new URLSearchParams(location.search).get('topup');
if (topupId) {
  history.replaceState({}, '', location.pathname);
  authReady.then(() => finishTopUp(topupId));
}

// Search over the map — filters the pins by name, neighborhood, or address.
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('searchClear');
const verifiedBtn = document.getElementById('verifiedFilter');
const discountBtn = document.getElementById('discountFilter');
const locateBtn = document.getElementById('locateBtn');
const geoStatus = document.getElementById('geoStatus');
const RADIUS_LADDER = [1000, 2000, 5000];
let searchTimer = null;
let verifiedOnly = false;
let discountOnly = false;
let userFix = null;        // {lat,lng,accuracy,timestamp} of null — alleen bruikbare fixes
let fixRejected = false;   // laatste meting was te onnauwkeurig → volgende tik meet vers
let nearbyOn = false;
let nearbyRadiusM = 1000;
let statusTimer = null;

// Strip diacritics so "kyo" matches "Kyō", "cafe" matches "café", etc.
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Op een wifi-only iPad is accuracy 50-150 m. Hard op 1000 m knippen zou zaken
// wegfilteren die er waarschijnlijk wél in vallen — dus verruimen we de straal
// met de eigen foutmarge. Eén zaak te veel is goedkoper dan een zaak missen.
function effectiveRadius() {
  return nearbyRadiusM + Math.min(userFix?.accuracy ?? 0, 500);
}

// radius: false geeft dezelfde lijst zónder het afstandsfilter — dat is de lijst
// waar "dichtstbijzijnde zaak" uit moet komen, anders noemt die melding een zaak
// die de verified-pil of de zoekterm juist van de kaart heeft gehaald.
function applyFilters(base, term, { radius = true } = {}) {
  const q = norm((term || '').trim());
  // verified eerst: de haversine over ~850 items draait zo op de kleinste lijst.
  let list = verifiedOnly ? base.filter((s) => s.verified) : base;
  // Direct na verified en vóór de radius: beide snijden goedkoop, de haversine niet.
  if (discountOnly) list = list.filter((s) => s.discountPct > 0);
  if (radius && nearbyOn && userFix) list = shopsWithin(list, userFix, effectiveRadius());
  if (q) {
    list = list.filter((s) =>
      norm(s.name).includes(q) ||
      norm(s.location).includes(q) ||
      norm(placesData[s.id]?.address).includes(q)
    );
  }
  return list;
}

function runSearch(term) {
  clearBtn.hidden = !norm((term || '').trim());
  const nearby = nearbyOn && !!userFix;
  const list = applyFilters(shops, term);
  setPlaceCount(list.length, nearby ? `binnen ${fmtDist(effectiveRadius())}` : '');
  filterMap(list, nearby ? 'user' : 'results');
  if (nearby) focusUser(userFix, effectiveRadius());
}

// "Alleen echte menu's" toggle — isolates the verified cafés (red pins).
verifiedBtn.addEventListener('click', () => {
  verifiedOnly = !verifiedOnly;
  verifiedBtn.classList.toggle('is-on', verifiedOnly);
  verifiedBtn.setAttribute('aria-pressed', String(verifiedOnly));
  runSearch(searchInput.value);
});

discountBtn.addEventListener('click', () => {
  discountOnly = !discountOnly;
  discountBtn.classList.toggle('is-on', discountOnly);
  discountBtn.setAttribute('aria-pressed', String(discountOnly));
  // Via runSearch, niet filterMap: die zet ook de teller en de radius-tekst goed.
  runSearch(searchInput.value);
});

// ---- "In de buurt": locatieknop, statuspil en het afstandsfilter ----
function say(text, { error = false, sticky = false } = {}) {
  clearTimeout(statusTimer);
  if (!text) { geoStatus.hidden = true; return; }
  geoStatus.textContent = text;
  geoStatus.classList.toggle('is-error', error);
  geoStatus.hidden = false;
  if (!sticky) statusTimer = setTimeout(() => { geoStatus.hidden = true; }, 6000);
}

function setBtn(state) {   // 'idle' | 'busy' | 'on' | 'error'
  locateBtn.classList.toggle('is-busy', state === 'busy');
  locateBtn.classList.toggle('is-on', state === 'on');
  locateBtn.classList.toggle('is-error', state === 'error');
  locateBtn.disabled = state === 'busy';
  locateBtn.setAttribute('aria-pressed', String(state === 'on'));
  locateBtn.setAttribute('aria-busy', String(state === 'busy'));
  locateBtn.setAttribute('aria-label', state === 'on'
    ? 'Locatie aan — tik om uit te zetten' : 'Zoek zaken in mijn buurt');
}

// Idempotent (pure assignments): showFavorites/onAuthChange mogen dit vaker aanroepen.
function setNearby(on, { keepFix = false } = {}) {
  nearbyOn = on;
  if (!on) {
    nearbyRadiusM = 1000;
    if (!keepFix) { userFix = null; fixRejected = false; clearUserLocation(); }
    setBtn('idle');
    say('');
  }
}

// Feature-detect defensief: main.js is top-level await zonder try/catch, een
// gooiende helper op moduleniveau breekt de hele app-init.
if (!geoSupported() || !mapReady()) {
  locateBtn.disabled = true;
  locateBtn.setAttribute('aria-disabled', 'true');
  locateBtn.title = 'Locatie werkt niet in deze browser.';
} else {
  locateBtn.addEventListener('click', onLocateTap);
}

// Nabij-modus is een kaartweergave: neem de bottom-nav en de zoek-placeholder
// mee terug, anders blijft "Favorieten" groen terwijl de kaart buurtresultaten
// toont (en trekt een token-refresh via onAuthChange de kaart zelfs terug).
function showMapView() {
  setActiveNav('map');
  searchInput.placeholder = 'Zoek café of buurt in Amsterdam...';
}

async function onLocateTap() {
  if (nearbyOn) { setNearby(false); showMapView(); runSearch(searchInput.value); return; }  // toggle-off
  if (userFix && !isStale(userFix)) { activateNearby(userFix); return; }      // verse fix hergebruiken

  setBtn('busy');
  say('Locatie zoeken…', { sticky: true });
  try {
    // Na een afgekeurde meting de OS-cache omzeilen: anders levert een tik
    // binnen de minuut exact dezelfde te grove fix opnieuw op.
    activateNearby(await requestPosition({ fresh: fixRejected }));
  } catch (err) {
    if (err.code === 'aborted') {
      // iOS annuleert bij het wegschakelen naar Instellingen; zonder melding
      // lijkt het bij terugkomst alsof de tik nooit heeft plaatsgevonden.
      setBtn('idle');
      say('Locatie zoeken gestopt — tik opnieuw.');
      return;
    }
    setBtn('error');                       // knop blijft tikbaar: de gebruiker kan
    say(err.message, { error: true, sticky: true });  // net in Instellingen zijn geweest
  }
}

function activateNearby(fix) {
  showUserLocation(fix);                   // stip + cirkel: ALTIJD, ook als filteren afvalt
  const acc = fmtAccuracy(fix.accuracy);
  if (fix.accuracy > GEO_ACCURACY_MAX) {
    // Bewust NIET in userFix: de shortcut hierboven zou hem 5 min lang hergebruiken
    // en dezelfde melding herhalen zonder ooit opnieuw te meten.
    fixRejected = true;
    setBtn('error');
    say(`Je locatie is te onnauwkeurig (${acc}) om zaken in de buurt te tonen.`,
        { error: true, sticky: true });
    focusUser(fix, fix.accuracy);
    return;
  }
  fixRejected = false;
  userFix = fix;
  showMapView();
  nearbyOn = true;
  setBtn('on');
  // Ladder: verruim tot er iets is — en zeg dát je verruimd hebt.
  let n = 0;
  for (const r of RADIUS_LADDER) {
    nearbyRadiusM = r;
    n = applyFilters(shops, searchInput.value).length;
    if (n > 0) break;
  }
  runSearch(searchInput.value);
  if (n === 0) {
    const near = nearestShop(fix, applyFilters(shops, searchInput.value, { radius: false }));
    say(near
      ? `Geen zaken binnen 5 km. Dichtstbijzijnde: ${near.name} op ${fmtDist(near.d)}.`
      : 'Geen zaken gevonden in de buurt.', { sticky: true });
  } else {
    const extra = nearbyRadiusM > 1000 ? ` (straal verruimd naar ${fmtDist(nearbyRadiusM)})` : '';
    say(`${n} ${n === 1 ? 'zaak' : 'zaken'} binnen ${fmtDist(effectiveRadius())} · nauwkeurigheid ${acc}${extra}`);
  }
}

// Een fix die binnenkomt terwijl de gebruiker weg is, mag de kaart niet wegtrekken.
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelPosition(); });
window.addEventListener('pagehide', cancelPosition);

searchInput.addEventListener('input', (e) => {
  const v = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(v), 150);
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  runSearch('');
  searchInput.focus();
});

// ---- Bottom nav: Kaart / Favorieten / Profiel ----
function setActiveNav(view) {
  document.querySelectorAll('.nav-item[data-view]').forEach((a) =>
    a.classList.toggle('active', a.dataset.view === view));
}

function showFavorites() {
  setActiveNav('favorites');
  if (!isLoggedIn()) {
    openProfile('Maak een profiel om je favoriete cafés te bewaren en terug te vinden.');
    setActiveNav('map');
    return;
  }
  const favs = new Set(getFavorites());
  cancelPosition();
  // De blauwe stip blijft staan (keepFix): "waar ben ik" is nooit misleidend,
  // "N zaken in de buurt" wél als de lijst uit favorieten komt.
  setNearby(false, { keepFix: true });
  const favShops = shops.filter((s) => favs.has(s.id));
  searchInput.value = '';
  clearBtn.hidden = true;
  if (favShops.length === 0) {
    setPlaceCount(0); filterMap([], 'none');
    // brief hint via the search placeholder
    searchInput.placeholder = 'Nog geen favorieten — tik ♥ bij een café';
    return;
  }
  searchInput.placeholder = `${favShops.length} favoriet${favShops.length === 1 ? '' : 'en'}`;
  setPlaceCount(favShops.length); filterMap(favShops, 'results');
}

document.querySelectorAll('.nav-item[data-view]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const view = a.dataset.view;
    if (view === 'profile') { cancelPosition(); setActiveNav('profile'); openProfile(); setActiveNav('map'); }
    else if (view === 'favorites') showFavorites();
    else {
      // "Kaart" = terug naar de volledige kaart, dus ook de blauwe stip weg.
      // Dit is de enige route die een afgekeurde (te grove) fix opruimt.
      cancelPosition();
      setNearby(false);
      showMapView();
      searchInput.value = '';
      runSearch('');   // via runSearch, anders wordt de verified-pil stilzwijgend genegeerd
    }
  });
});

// A login-gated action (favorite heart) asks the app to open the profile modal.
window.addEventListener('cm:need-login', (e) => openProfile(e.detail?.hint));

// Installatiehint. Bewust ná de eerste render en met vertraging: bij het laden
// concurreert hij met de kaart, en een hint die je meteen overvalt wordt
// weggeklikt zonder gelezen te worden.
initInstallHint();
