// PWA-installatiehint. Twee werelden: Chrome (Android én desktop) vuurt
// `beforeinstallprompt` en kan een echte installdialoog openen; iOS Safari heeft
// dat event nooit geïmplementeerd en zal dat ook niet doen — daar kan alleen de
// gebruiker zelf via Deel › Zet op beginscherm. Vandaar: één knop die installeert
// waar dat kan, en uitleg toont waar het moet.

const DISMISS_KEY = 'fm:install-dismissed';

// Draait de app al als geïnstalleerde PWA? Dan is elke hint ruis.
// matchMedia dekt Android/desktop, navigator.standalone is de iOS-variant.
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

// iPadOS 13+ meldt zich als "MacIntel"; het aantal touchpunten verraadt de iPad.
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Op iOS kan alleen Safari naar het beginscherm. Chrome/Firefox/Edge dragen daar
// hun eigen merk in de UA (CriOS/FxiOS/EdgiOS) terwijl ze verder Safari nabootsen.
const isIosSafari = () => isIos() && !/crios|fxios|edgios|opr\//i.test(navigator.userAgent);

export function initInstallHint({ delayMs = 5000 } = {}) {
  const box = document.getElementById('installHint');
  if (!box) return;
  if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

  const text = box.querySelector('.install-hint__text');
  const action = box.querySelector('.install-hint__btn');
  const close = box.querySelector('.install-hint__close');

  let deferred = null;   // opgevangen beforeinstallprompt-event
  let shown = false;

  function dismiss(remember) {
    box.hidden = true;
    if (remember) { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ } }
  }

  function show() {
    if (shown || isStandalone()) return;
    shown = true;
    box.hidden = false;
  }

  close.addEventListener('click', () => dismiss(true));

  action.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      // Bij 'dismissed' mag het event niet hergebruikt worden; de browser vuurt
      // hem later opnieuw. Hint weg, maar niet permanent wegzetten.
      dismiss(outcome === 'accepted');
      return;
    }
    // iOS: geen dialoog mogelijk, dus de twee stappen tonen. De knop wordt de
    // sluitknop, want er valt daarna niets meer te doen.
    text.innerHTML = 'Tik op <strong>Deel</strong> onderin Safari en kies ' +
      '<strong>“Zet op beginscherm”</strong>.';
    action.textContent = 'Duidelijk';
    action.onclick = () => dismiss(true);
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();            // onderdruk Chrome's eigen infobalk
    deferred = e;
    setTimeout(show, delayMs);
  });

  window.addEventListener('appinstalled', () => dismiss(true));

  // iOS Safari krijgt nooit een event, dus daar is de timer de enige trigger.
  if (isIosSafari()) setTimeout(show, delayMs);
}
