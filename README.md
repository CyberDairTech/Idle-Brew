# Idle Brew

An idle/incremental brewery game. Play it at **https://cyberdairtech.github.io/Idle-Brew/**.

- `index.html` — the game (single-file, also mirrored to the `gh-pages` branch for GitHub Pages) — **edit game logic/content here only**
- `feedback.html` — in-game feedback form
- `www/index.html` — **generated, not committed.** The Android-only build of the game: `index.html` plus vendored React/fonts (so the app works offline) and native-shell hooks (back button, status bar, haptics). Produced by `npm run build:android` (see `scripts/build-android-www.js`)
- `vendor/` — React/ReactDOM and the Google Fonts used by the game, downloaded once and committed so Android builds don't depend on CDN availability. Only needs regenerating if you change which fonts the game uses (`node scripts/vendor-fonts.js`, after re-fetching `vendor/fonts/google-fonts.css`)
- `android/` — the Capacitor-generated native Android project
- `.github/workflows/android-build.yml` — builds the Android app in CI on every push

## Updating the game

Edit `index.html` only, then commit it. `www/index.html` is a build artifact (gitignored) — CI regenerates it automatically before every Android build, so you never hand-edit or commit it.

Also push the same `index.html` to the `gh-pages` branch to update the live site at cyberdairtech.github.io — `main` doesn't drive Pages here, `gh-pages` does.

## Android app

This project uses [Capacitor](https://capacitorjs.com/) to wrap the game in a native Android WebView shell, with app id `com.cyberdairtech.idlebrew`. A few things make it feel like more than "a website in a box":

- **Works offline** — React and the game's fonts are vendored and inlined into `www/index.html` at build time, instead of loading from a CDN on first launch.
- **Back button** navigates the game's own panels (Store, Recipe Book, etc.) before exiting the app, instead of the default WebView behavior.
- **Status bar** is themed to match the game's dark brew palette.
- **Haptic tap** feedback on the "tap for bonus" interaction.
- **One real-money purchase** — "Double Production," via Google Play Billing. See below.

All of this native-only behavior lives in `scripts/build-android-www.js`, which patches it into a copy of `index.html` — the game file itself stays a clean, dependency-free single page.

### Real-money purchase (Double Production)

Every other store item is bought with in-game prestige points. "Double Production" (`boost_double` in `STORE_ITEMS`) is the one exception — it's a real-money purchase via [Google Play Billing](https://developer.android.com/google/play/billing), wired up through [`cordova-plugin-purchase`](https://github.com/j3k0/cordova-plugin-purchase) (installed as a Cordova plugin — no extra native code to maintain, and no build step needed since it's picked up automatically by `cap sync`).

- **`index.html`** just knows the item is `premium: true` and calls `window.IdleBrewIAP.purchase(itemId)` when tapped — it has no idea Play Billing exists. On the web version that global is never defined, so it shows a "only available in the Android app" toast instead.
- **The actual Play Billing wiring** (product registration, purchase/verify/finish flow, granting ownership on success) is injected into `www/index.html` by `scripts/build-android-www.js`, same pattern as the other native-only touches.
- **`iapProductId: 'double_production'`** on the STORE_ITEMS entry must exactly match the product ID you create in Play Console.

**What you still need to do before this actually works:**

1. Once you have a Play Developer account and have uploaded a signed build to at least an internal testing track (see below), go to **Play Console → your app → Monetize → Products → In-app products**, and create a product with ID **`double_production`** (must match exactly), a name, description, and price.
2. **Real purchases can't be tested with the sideloaded debug APK.** Play Billing validates that the app was installed through Google Play, so you need to: upload a signed build to an internal testing track, add your own Google account as a license tester (Play Console → Setup → License testing), and install the app via the testing track's opt-in link. Test purchases made this way show a "test card, not charged" banner.
3. This ships **without server-side receipt validation** (the plugin calls `.verify()` locally, which trusts the on-device receipt) — a reasonable trade-off for a single low-stakes cosmetic-ish upgrade, but it means a modified APK could in theory spoof ownership. If that becomes a concern later, the plugin supports plugging in a validation server (their own [Iaptic](https://www.iaptic.com) service, or a custom one) via `store.validator` — see the [cordova-plugin-purchase docs](https://github.com/j3k0/cordova-plugin-purchase).

### Automatic builds (no local setup needed)

Every push to `main` triggers `.github/workflows/android-build.yml`, which builds a debug APK and uploads it as a workflow artifact:

1. Go to the repo's **Actions** tab → the latest **Android Build** run.
2. Download the `idle-brew-debug-apk` artifact, unzip it, and install `app-debug.apk` on an Android phone (enable "install unknown apps" for your browser/file manager first) to test.

### Building locally (optional)

Requires Node 22+, JDK 21, and Android Studio (for the SDK):

```bash
npm install
npm run sync:android   # builds www/index.html, then runs `cap sync android`
npx cap open android   # opens the project in Android Studio
```

From Android Studio you can run it on an emulator/device, or `Build > Generate Signed Bundle/APK`.

### Play Store release

The Play Store requires a **signed `.aab`** (Android App Bundle), and Google requires every update to be signed with the *same* key forever — so back up your keystore somewhere safe (password manager, not just this repo).

1. **Create a Google Play Developer account** (one-time $25) at [play.google.com/console](https://play.google.com/console) if you haven't already.
2. **Generate a signing keystore** (do this once, keep the file forever):
   ```bash
   keytool -genkeypair -v -keystore release.keystore -alias idlebrew -keyalg RSA -keysize 2048 -validity 10000
   ```
   This needs a JDK installed locally (`keytool` ships with it) — it doesn't need Android Studio.
3. **Add these as GitHub repo secrets** (repo → Settings → Secrets and variables → Actions → New repository secret):
   - `KEYSTORE_BASE64` — output of `certutil -encode release.keystore keystore.b64` (Windows) or `base64 -w0 release.keystore` (Mac/Linux), contents of the resulting file
   - `KEYSTORE_PASSWORD` — the keystore password you set above
   - `KEY_ALIAS` — `idlebrew` (or whatever alias you used)
   - `KEY_PASSWORD` — the key password you set above (often same as keystore password)
4. Push to `main` (or re-run the workflow manually from the Actions tab). With those secrets present, the workflow also builds a signed `idle-brew-release-aab` artifact.
5. Download the `.aab` from the workflow run, and in Play Console: **Create app → Production (or Internal testing first) → Create new release → upload the .aab**.
6. Fill in the Play Console store listing (screenshots, description, content rating questionnaire, privacy policy URL, data safety form) — these are one-time setup steps Google requires per app and have to be done in the Play Console itself.

Internal testing (not full production) is the fastest way to get it on a real device from the Play Store while you finish the store listing.
