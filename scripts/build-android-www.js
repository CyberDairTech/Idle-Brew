// Generates www/index.html (the file the Android app actually bundles) from
// the canonical index.html at the repo root. index.html stays a clean,
// single-file, CDN-loading web page - this script produces an Android-only
// variant that:
//   1. Inlines React/ReactDOM and the game's fonts, so the app launches
//      instantly and works with no network connection.
//   2. Adds native touches that only make sense inside the Capacitor shell
//      (Android back button navigation, status bar theming, tap haptics),
//      guarded so they're no-ops when the same markup runs as a web page.
//
// Edit game logic/content in index.html only - this file regenerates
// www/index.html from it. Run via `npm run build:android`.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const reactSrc = fs.readFileSync(path.join(root, 'vendor', 'react', 'react.production.min.js'), 'utf8');
const reactDomSrc = fs.readFileSync(path.join(root, 'vendor', 'react', 'react-dom.production.min.js'), 'utf8');
const fontsCss = fs.readFileSync(path.join(root, 'vendor', 'fonts', 'fonts.css'), 'utf8');

function replaceOnce(str, oldStr, newStr, label) {
  const i = str.indexOf(oldStr);
  if (i === -1) throw new Error(`build-android-www: anchor not found - ${label}`);
  return str.slice(0, i) + newStr + str.slice(i + oldStr.length);
}

let out = src;

// 1. Swap the Google Fonts CDN <link> for the inlined @font-face CSS.
const fontsLinkAnchor =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Pacifico&display=swap" />';
out = replaceOnce(out, fontsLinkAnchor, `<style>\n${fontsCss}</style>`, 'google fonts link');

// 2. Swap the multi-CDN React loader for the vendored source, run inline.
const cdnLoaderAnchor = `<script>
// Try several CDNs in turn, since some networks (school/work/public wifi)
// block one but not another. Whichever loads first wins.
function loadScript(url) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = url;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('failed: ' + url)); };
    document.head.appendChild(s);
  });
}
function loadFirstThatWorks(urls) {
  var attempt = function (i) {
    if (i >= urls.length) return Promise.reject(new Error('all sources failed'));
    return loadScript(urls[i]).catch(function () { return attempt(i + 1); });
  };
  return attempt(0);
}

var REACT_SOURCES = [
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
];
var REACTDOM_SOURCES = [
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
];

loadFirstThatWorks(REACT_SOURCES)
  .then(function () { return loadFirstThatWorks(REACTDOM_SOURCES); })
  .then(function () {
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') throw new Error('libs missing after load');
    runIdleBrew();
  })
  .catch(function () {
    document.getElementById('root').innerHTML =
      '<div class="idlebrew-msg"><h2>Couldn\\'t load</h2>' +
      '<p>This game loads two small files from the internet the first time it opens, and none of the ' +
      'usual sources (jsDelivr, cdnjs, unpkg) got through. You may be fully offline, or on a network that ' +
      'blocks JavaScript CDNs entirely. Try a different network, such as a personal hotspot.</p></div>';
  });</script>`;
// Just inline the libraries here - runIdleBrew() itself is defined further
// down the document (in its own <script> block), so it can only be *called*
// after that block has run. See the end-of-body anchor below.
const vendoredReactBlock = `<script>${reactSrc}</script>
<script>${reactDomSrc}</script>`;
out = replaceOnce(out, cdnLoaderAnchor, vendoredReactBlock, 'CDN react loader');

// 3. Haptic-feedback helper, defined once near the top of runIdleBrew().
const helperAnchor = 'const h = React.createElement;';
const helperBlock = `${helperAnchor}

// Native-only touches (Android app shell). No-ops on the plain web page,
// where window.Capacitor is never defined.
function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
function nativeHaptic(style) {
  try {
    if (isNativeApp() && window.Capacitor.Plugins.Haptics) {
      window.Capacitor.Plugins.Haptics.impact({ style: style || 'LIGHT' });
    }
  } catch (e) {}
}`;
out = replaceOnce(out, helperAnchor, helperBlock, 'React.createElement helper (for native helpers)');

// 4. Haptic tap on the beverage "tap for bonus" interaction.
const tapAnchor = 'function handleTap() {\n    if (!tapReady) return;';
const tapBlock = `function handleTap() {\n    if (!tapReady) return;\n    nativeHaptic('LIGHT');`;
out = replaceOnce(out, tapAnchor, tapBlock, 'handleTap');

// 5. Android back button -> in-app navigation, and status bar theming.
const navAnchor = '  stateRef.current = state;';
const navBlock = `${navAnchor}
  const navStateRef = useRef(null);
  navStateRef.current = { view, tutorialOpen, confirmingPrestige, confirmingReset, setView, setTutorialOpen, setConfirmingPrestige, setConfirmingReset };

  useEffect(() => {
    if (!isNativeApp()) return;
    const Plugins = window.Capacitor.Plugins;
    if (Plugins.StatusBar) {
      Plugins.StatusBar.setBackgroundColor({ color: '#241A12' }).catch(() => {});
      Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
    }
    const AppPlugin = Plugins.App;
    if (!AppPlugin) return undefined;
    const listenerPromise = AppPlugin.addListener('backButton', () => {
      const s = navStateRef.current;
      if (!s) return;
      if (s.tutorialOpen) { s.setTutorialOpen(false); return; }
      if (s.confirmingPrestige) { s.setConfirmingPrestige(false); return; }
      if (s.confirmingReset) { s.setConfirmingReset(false); return; }
      if (s.view !== 'game') { s.setView('game'); return; }
      AppPlugin.exitApp();
    });
    return () => { listenerPromise.then((h) => h.remove()).catch(() => {}); };
  }, []);

  // Real-money purchase (Google Play Billing, via cordova-plugin-purchase -
  // exposed as window.CdvPurchase by the native Cordova/Capacitor bridge).
  // IAP_PRODUCTS maps this game's STORE_ITEMS ids to Play Console product
  // ids - keep in sync with STORE_ITEMS' iapProductId fields in index.html.
  useEffect(() => {
    if (!isNativeApp() || !window.CdvPurchase) return undefined;
    try {
      const { store, ProductType, Platform } = window.CdvPurchase;
      const IAP_PRODUCTS = { boost_double: 'double_production' };
      const itemIdForProduct = (productId) => Object.keys(IAP_PRODUCTS).find((k) => IAP_PRODUCTS[k] === productId);

      store.register(Object.keys(IAP_PRODUCTS).map((itemId) => ({
        id: IAP_PRODUCTS[itemId],
        type: ProductType.NON_CONSUMABLE,
        platform: Platform.GOOGLE_PLAY,
      })));

      store.when()
        .productUpdated((p) => {
          const itemId = itemIdForProduct(p.id);
          if (itemId && p.pricing && p.pricing.price) {
            setIapPrices((prev) => Object.assign({}, prev, { [itemId]: p.pricing.price }));
          }
        })
        .approved((transaction) => transaction.verify())
        .verified((receipt) => receipt.finish())
        .finished((transaction) => {
          (transaction.products || []).forEach((p) => {
            const itemId = itemIdForProduct(p.id);
            if (!itemId) return;
            setState((prev) => prev && Object.assign({}, prev, {
              store: Object.assign({}, prev.store, { owned: Object.assign({}, prev.store.owned, { [itemId]: true }) }),
            }));
          });
        });

      window.IdleBrewIAP = {
        purchase(itemId) {
          const productId = IAP_PRODUCTS[itemId];
          const product = productId && store.get(productId);
          const offer = product && product.getOffer && product.getOffer();
          if (offer) {
            offer.order().then((error) => { if (error) console.error('IAP order failed:', error); });
          } else {
            showToast("Couldn't start purchase - try again in a moment.", 'warn');
          }
        },
      };

      store.initialize([{ platform: Platform.GOOGLE_PLAY }]);
    } catch (e) {
      console.error('IAP init failed:', e);
    }
    return undefined;
  }, []);`;
out = replaceOnce(out, navAnchor, navBlock, 'stateRef.current = state; (for back button handling)');

// 6. Now that runIdleBrew() is fully defined (React/ReactDOM were inlined
// synchronously above, so they're ready immediately - no need to wait on a
// network load like the CDN version did), actually call it.
const endAnchor = '} // end runIdleBrew\n</script>\n</body>';
out = replaceOnce(out, endAnchor, `${endAnchor.replace('</body>', '')}<script>runIdleBrew();</script>\n</body>`, 'end of runIdleBrew script (for the call site)');

fs.mkdirSync(path.join(root, 'www'), { recursive: true });
fs.writeFileSync(path.join(root, 'www', 'index.html'), out);
console.log(`wrote www/index.html (${(out.length / 1024).toFixed(0)} KB)`);
