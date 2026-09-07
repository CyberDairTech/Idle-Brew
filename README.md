# Idle Brew

An idle/incremental brewery game. Play it at **https://cyberdairtech.github.io/Idle-Brew/**.

- `index.html` — the game (single-file, also mirrored to the `gh-pages` branch for GitHub Pages)
- `feedback.html` — in-game feedback form
- `www/` — the same game, used as the web asset bundle for the Android app
- `android/` — the Capacitor-generated native Android project
- `.github/workflows/android-build.yml` — builds the Android app in CI on every push

## Updating the game

Edit `index.html` **and** copy it to `www/index.html` (the Android app bundles whatever is in `www/`), then commit both. If you only touch `index.html`, the website updates but the Android app won't pick up the change until `www/index.html` is updated too.

Also push the same `index.html` to the `gh-pages` branch to update the live site at cyberdairtech.github.io — `main` doesn't drive Pages here, `gh-pages` does.

## Android app

This project uses [Capacitor](https://capacitorjs.com/) to wrap the game in a native Android WebView shell, with app id `com.cyberdairtech.idlebrew`.

### Automatic builds (no local setup needed)

Every push to `main` triggers `.github/workflows/android-build.yml`, which builds a debug APK and uploads it as a workflow artifact:

1. Go to the repo's **Actions** tab → the latest **Android Build** run.
2. Download the `idle-brew-debug-apk` artifact, unzip it, and install `app-debug.apk` on an Android phone (enable "install unknown apps" for your browser/file manager first) to test.

### Building locally (optional)

Requires Node 22+, JDK 21, and Android Studio (for the SDK):

```bash
npm install
npx cap sync android
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
