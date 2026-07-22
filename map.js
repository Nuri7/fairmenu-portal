// Map view: Amsterdam map with a pin for every café. Leaflet is bundled (not a
// CDN) so it ships with the app; OSM tiles load over the network when online.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { haversineM, fmtDist, GEO_ACCURACY_MAX } from './geo.js';

// Brand-green cluster bubble showing the count.
function clusterIcon(cluster) {
  const n = cluster.getChildCount();
  const size = n < 10 ? 34 : n < 25 ? 40 : 46;
  return L.divIcon({
    html: `<div class="fm-cluster"><span>${n}</span></div>`,
    className: 'fm-cluster-wrap',
    iconSize: [size, size],
  });
}

// Amsterdam bounding box — used to auto-fit on the city and ignore the few
// out-of-town vendors (Leiderdorp, Alphen, Langenburg) when framing.
const AMS = { latMin: 52.30, latMax: 52.43, lngMin: 4.80, lngMax: 4.99 };
const inAmsterdam = ([lat, lng]) => lat >= AMS.latMin && lat <= AMS.latMax && lng >= AMS.lngMin && lng <= AMS.lngMax;

const shopCoords = (shop) =>
  shop.lat == null || shop.lng == null ? null : [shop.lat, shop.lng];

function distanceTo(shop, pos) {
  const c = shopCoords(shop);
  return c ? haversineM(pos.lat, pos.lng, c[0], c[1]) : null;
}

// Zaken binnen `meters`, dichtstbijzijnde eerst. Zaken zonder coördinaat vallen
// af — net als in renderMarkers, zodat telling en pins synchroon blijven.
export function shopsWithin(shops, pos, meters) {
  return shops
    .map((s) => ({ s, d: distanceTo(s, pos) }))
    .filter((x) => x.d !== null && x.d <= meters)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.s);
}

// Dichtstbijzijnde zaak — voor de "niets in de buurt"-melding. `list` is de al
// gefilterde basislijst (verified-pil + zoekterm): zonder die parameter noemt de
// melding een zaak die door de actieve filters juist van de kaart is gehaald.
export function nearestShop(pos, list = allShopsRef) {
  let best = null;
  for (const s of list) {
    const d = distanceTo(s, pos);
    if (d !== null && (!best || d < best.d)) best = { name: s.name, d };
  }
  return best;
}

// Brand-coloured teardrop pin as an inline SVG (no external icon file).
function pinIcon(shop) {
  // Verified = a real, complete menu → a larger red pin with a white check that
  // stands out from the crowd (map-familiar red marker).
  if (shop.verified) {
    const html =
      `<svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg">
         <path d="M17 0C7.6 0 0 7.6 0 17c0 11.3 17 29 17 29s17-17.7 17-29C34 7.6 26.4 0 17 0z" fill="#d33a2c"/>
         <circle cx="17" cy="17" r="8.5" fill="#FAFAED"/>
         <path d="M12.6 17.3l3 3 5.8-6" fill="none" stroke="#d33a2c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
       </svg>`;
    return L.divIcon({ html, className: 'fm-pin fm-pin--verified', iconSize: [34, 46], iconAnchor: [17, 46], popupAnchor: [0, -44] });
  }
  const fill = shop.pendingClaim ? '#e0a83b' : (shop.comingSoon ? '#a8a48f' : '#4A5D23');
  const html =
    `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
       <path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${fill}"/>
       <circle cx="15" cy="15" r="6" fill="#FAFAED"/>
     </svg>`;
  return L.divIcon({ html, className: 'fm-pin', iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -38] });
}

let map = null;
let cluster = null;
let onOpenRef = null;
let allShopsRef = [];
let locateLayer = null;          // NIET in cluster: cluster.clearLayers() mag hem niet raken
let locMarker = null, locCircle = null;
let userPos = null;              // {lat,lng,accuracy} — voedt de afstandsregel in popups

export function ensureMap(container, shops, onOpen) {
  if (map) { map.invalidateSize(); return map; }
  try {
    map = L.map(container, { zoomControl: false, attributionControl: true })
      .setView([52.370, 4.895], 13);
    // Zoom control bottom-right so it never sits under the floating search bar.
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    onOpenRef = onOpen;
    cluster = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      maxClusterRadius: 45,        // tighter clusters so nearby cafés stay distinct
      spiderfyOnMaxZoom: true,
    });
    map.addLayer(cluster);

    allShopsRef = shops;
    // Eigen pane boven de pins (markerPane 600) maar onder tooltip (650) en
    // popup (700). pointerEvents none: de stip mag nooit een tik opvangen die
    // voor een pin eronder bedoeld is.
    map.createPane('fm-locate');
    const lp = map.getPane('fm-locate');
    lp.style.zIndex = 640;
    lp.style.pointerEvents = 'none';
    locateLayer = L.layerGroup().addTo(map);   // op de map, NIET in cluster

    renderMarkers(shops, 'results');
    return map;
  } catch (err) {
    console.error('[map] init failed:', err);
    map = null;
    throw err;
  }
}

// (Re)draw the pins for a set of shops.
// mode: 'results' (zoeken) | 'user' (nabij-filter, focusUser stuurt de view) | 'none'
function renderMarkers(shops, mode) {
  if (!cluster) return;
  cluster.clearLayers();
  const amsBounds = [];
  const markers = [];
  for (const shop of shops) {
    const c = shopCoords(shop);
    if (!c) continue;
    const marker = L.marker(c, { icon: pinIcon(shop), zIndexOffset: shop.verified ? 1000 : 0 });

    const addr = shop.address ? shop.address.split(',')[0] : shop.location;
    // Bij een fix die te grof is om op te filteren, is "op 340 m" verzonnen
    // precisie — dan alleen de stip + cirkel, geen afstand in de popup.
    const usable = userPos && userPos.accuracy <= GEO_ACCURACY_MAX;
    const dist = usable ? distanceTo(shop, userPos) : null;
    const meta = [addr, dist !== null ? `op ${fmtDist(dist)}` : null]
      .filter(Boolean).join(' · ');

    // A menu is visible independently of claim status. For an unclaimed venue,
    // "Open menu" sits directly above the claim action.
    const btns = [];
    if (shop.hasMenu) {
      const menuLabel = shop.claimed ? 'Bekijk menu' : 'Open menu';
      btns.push(`<button class="fm-popup__btn" data-act="menu">${menuLabel}</button>`);
    }
    if (!shop.claimed) {
      const ghost = shop.hasMenu ? ' fm-popup__btn--ghost' : '';
      if (shop.pendingClaim) btns.push(`<button class="fm-popup__btn${ghost}" data-act="pending">Pending claim</button>`);
      else btns.push(`<button class="fm-popup__btn${ghost}" data-act="claim">Claim deze zaak</button>`);
    }

    const popup = document.createElement('div');
    popup.className = 'fm-popup';
    popup.innerHTML = `
      <div class="fm-popup__head"><strong>${shop.name}</strong></div>
      ${shop.verified
        ? '<span class="fm-popup__verified">✓ Echt menu</span>'
        : shop.pendingClaim
          ? '<span class="fm-popup__pending">⏳ Claim in behandeling</span>'
          : (shop.comingSoon ? '<span class="fm-popup__soon">Nog te claimen</span>' : '')}
      ${shop.discountPct > 0 ? `<span class="fm-popup__discount">−${shop.discountPct}% via FairMenu</span>` : ''}
      <span class="fm-popup__area">${meta}</span>
      <div class="fm-popup__btns">${btns.join('')}</div>`;
    popup.querySelector('[data-act="menu"]')?.addEventListener('click', () => onOpenRef?.(shop));
    popup.querySelector('[data-act="claim"]')?.addEventListener('click', () => { window.location.href = `https://fairmenu.app/claim?claim=${shop.id}`; });
    popup.querySelector('[data-act="pending"]')?.addEventListener('click', () => { window.location.href = `https://${shop.id}.fairmenu.app`; });
    marker.bindPopup(popup);
    cluster.addLayer(marker);
    markers.push([c, marker]);
    if (inAmsterdam(c)) amsBounds.push(c);
  }
  if (mode === 'results' || mode === 'verified') {
    if (markers.length === 1) {
      map.setView(markers[0][0], 16);
      markers[0][1].openPopup();
    } else if (mode === 'verified' && markers.length) {
      // The verified set is intentionally small. Show all of it, including
      // reliable menus outside Amsterdam, rather than silently cropping them.
      map.fitBounds(markers.map((m) => m[0]), { padding: [40, 40], maxZoom: 15 });
    } else if (amsBounds.length) {
      map.fitBounds(amsBounds, { padding: [40, 40], maxZoom: 15 });
    } else if (markers.length) {
      // Buiten Amsterdam: amsBounds is leeg. Zonder deze tak blijft de kaart op
      // de Amsterdam-startview staan terwijl de header "3 zaken" meldt.
      map.fitBounds(markers.map((m) => m[0]), { padding: [40, 40], maxZoom: 15 });
    }
  }
}

// Search hook: redraw the map with only the matching shops.
export function filterMap(shops, mode = 'results') {
  renderMarkers(shops, mode);
}

// Blauwe stip + nauwkeurigheidscirkel. Blauw is de universele "u bent hier"-
// conventie en botst niet met groen/rood/geel/grijs van de pins.
export function showUserLocation(fix) {
  if (!map || !locateLayer) return;
  userPos = fix;
  const ll = [fix.lat, fix.lng];
  const r = Math.max(fix.accuracy, 15);   // teken nooit een te kleine zekerheid
  if (!locMarker) {
    // Cirkel in de default overlayPane (z 400) → onder de pins, nooit erbovenop.
    locCircle = L.circle(ll, {
      radius: r, interactive: false,
      color: '#1a73e8', weight: 1, opacity: 0.45,
      fillColor: '#1a73e8', fillOpacity: 0.10,
    });
    locMarker = L.marker(ll, {
      pane: 'fm-locate', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'fm-loc-dot', iconSize: [18, 18], iconAnchor: [9, 9] }),
    });
    locateLayer.addLayer(locCircle).addLayer(locMarker);
  } else {
    locCircle.setLatLng(ll).setRadius(r);
    locMarker.setLatLng(ll);
  }
}

export function clearUserLocation() {
  userPos = null;
  if (locateLayer) locateLayer.clearLayers();
  locMarker = null; locCircle = null;
}

// Kader de straal rond de gebruiker — niet rond de resultaten. Wordt synchroon
// ná filterMap() aangeroepen, dus er is geen race met de results-fit.
export function focusUser(fix, radiusM) {
  if (!map) return;
  map.fitBounds(L.latLng(fix.lat, fix.lng).toBounds(radiusM * 2), // toBounds(x) = ±x meter
    { maxZoom: 16, padding: [24, 24] });
}

export const mapReady = () => !!map;
