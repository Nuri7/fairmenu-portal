// Locatiebepaling. Bewust los van Leaflet: annuleren, een dode callback en
// herhaald tikken zijn hier eenvoudiger correct te krijgen dan via map.locate().
// De positie leeft alleen in het geheugen van deze sessie — niet in localStorage,
// niet naar Supabase, nooit in een URL.

const GEO_TIMEOUT_MS = 20_000;   // iOS klokt door tijdens de toestemmingsdialoog
const GEO_MAX_AGE_MS = 60_000;   // gecachete fix mag max 1 min oud zijn
const GEO_STALE_MS = 5 * 60_000; // eigen fix daarna als verlopen zien
export const GEO_ACCURACY_MAX = 2_000;  // > 2 km: filteren is verzonnen precisie

export const geoSupported = () =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator;

// NL-copy per faalroute. err.message van de browser is Engels en geprefixt met
// "Geolocation error:" — die wordt nooit getoond.
const GEO_MSG = {
  unsupported: 'Locatie werkt niet in deze browser.',
  offline: 'Je bent offline — je locatie bepalen lukt nu niet.',
  1: "Locatie is geblokkeerd. Zet 'm aan via Instellingen › Privacy en beveiliging › Locatievoorzieningen.",
  2: 'Locatie niet beschikbaar. Staan locatievoorzieningen aan?',
  3: 'Locatie duurt te lang. Tik nog een keer om het opnieuw te proberen.',
  0: 'Locatie bepalen lukte niet.',
};

let inFlight = null;
let abortCurrent = null;

export function cancelPosition() { if (abortCurrent) abortCurrent(); }

// GPS heeft géén netwerk nodig, dus offline blokkeren we niets vooraf. Pas als de
// browser zelf faalt (code 2/3) is "je bent offline" de waarschijnlijke uitleg —
// dat is precies het geval waarin alleen wifi-positionering had kunnen helpen.
const msgFor = (code) => (navigator.onLine === false && (code === 2 || code === 3)
  ? GEO_MSG.offline
  : (GEO_MSG[code] || GEO_MSG[0]));

/**
 * @param {{fresh?: boolean}} [opts] fresh: negeer de OS-cache en meet opnieuw
 *   (na een afgekeurde, te onnauwkeurige fix — anders krijg je 60 s lang exact
 *   dezelfde meting terug).
 * @returns {Promise<{lat,lng,accuracy,timestamp}>} rejects met {code, message}
 */
export function requestPosition({ fresh = false } = {}) {
  if (inFlight) return inFlight;                 // herhaald tikken start geen 2e request
  if (!geoSupported()) return Promise.reject({ code: 'unsupported', message: GEO_MSG.unsupported });

  inFlight = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;                       // late native callback: negeren
      settled = true;
      clearTimeout(watchdog);
      inFlight = null; abortCurrent = null;
      fn(arg);
    };
    // In sommige WebKit-versies vuurt er NOOIT een callback als
    // Locatievoorzieningen systeembreed uit staan.
    const watchdog = setTimeout(
      () => finish(reject, { code: 3, message: msgFor(3) }), GEO_TIMEOUT_MS + 3_000);

    abortCurrent = () => finish(reject, { code: 'aborted', message: '' });

    navigator.geolocation.getCurrentPosition(
      (p) => finish(resolve, {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy || 0,
        timestamp: p.timestamp,
      }),
      (e) => finish(reject, { code: e.code, message: msgFor(e.code) }),
      // enableHighAccuracy is op een wifi-only iPad een no-op maar gratis;
      // op de telefoon het verschil tussen ~1000 m cell en ~10 m GPS.
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: fresh ? 0 : GEO_MAX_AGE_MS },
    );
  });
  return inFlight;
}

export const isStale = (fix) => !fix || (Date.now() - fix.timestamp) > GEO_STALE_MS;

export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "340 m" / "1,2 km". Ondergrens 10 m: "op 0 m" bestaat niet, ook niet als je
// in de zaak staat.
export const fmtDist = (m) => (m < 1000
  ? `${Math.max(10, Math.round(m / 10) * 10)} m`
  : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

// Nauwkeurigheid afgerond — nooit een preciezer getal tonen dan de fix waard is.
// Ondergrens 5 m: geen enkele fix is beter, en accuracy 0 (de fallback in
// requestPosition) mag nooit als "± 0 m" perfecte precisie suggereren.
export const fmtAccuracy = (m) => `± ${Math.max(5, m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10)} m`;
