# Velocity ERP mobile app (Android and iOS)

The apps are a [Capacitor](https://capacitorjs.com) shell around the hosted Velocity ERP web app. Velocity is
server-rendered (server actions, cookie sessions, per-workspace tenants), so the shell loads the live deployment
instead of a static export. Every user type (CRM staff, dealers, procurement, platform console) uses the same
sign-in pages, and web releases reach the apps instantly without a store update.

- App id: `com.velocityerp.app` (change in `capacitor.config.ts` before the first store upload if you want another id)
- Shell config: `capacitor.config.ts`; native projects: `android/`, `ios/`; icons and splash source: `assets/`
- Production origin: set `VELOCITY_APP_URL` (e.g. `https://app.yourdomain.com`) before `npx cap sync`. CI reads the repo variable of the same name.

## Run locally

```bash
npm install
# Android: debug APK (needs JDK 17+ and the Android SDK; android/local.properties must point at it)
VELOCITY_APP_URL=https://your-deployment npx cap sync android
cd android && ./gradlew assembleDebug      # android/app/build/outputs/apk/debug/app-debug.apk
# against a local dev server from the emulator:
VELOCITY_APP_URL=http://10.0.2.2:3000 npx cap sync android
```

`npm run mobile:android` / `mobile:ios` sync and open Android Studio / Xcode. Regenerate icons with `npm run mobile:assets`.

## iOS (needs a Mac or CI)

Xcode only runs on macOS. `.github/workflows/mobile.yml` builds the Android debug APK on Ubuntu and an unsigned iOS simulator build on a macOS runner to prove both projects compile.

## What you must do to publish

1. **Apple**: enrol in the Apple Developer Program (USD 99/year), create the App ID `com.velocityerp.app`, an App Store Connect app record, a distribution certificate and provisioning profile. Archive from Xcode on a Mac (or add signing secrets to a macOS CI job / use Codemagic or EAS Build) and upload to TestFlight, then submit for review.
2. **Google**: create a Play Console account (USD 25 one-off), create the app, generate an upload keystore (`keytool -genkey -v -keystore velocity-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`), keep it out of git, and build a signed bundle with `./gradlew bundleRelease`. Enrol in Play App Signing.
3. **Listings**: name, description, screenshots (phone, plus tablet for iPad), privacy policy URL (`/legal/privacy` already exists), support URL, data-safety / privacy-nutrition answers, age rating.
4. **Review risks**: Apple guideline 4.2 rejects apps that are a thin website wrapper. Plan native value before submitting (push notifications, camera upload of documents, biometric unlock). Account deletion must be possible in-app (guideline 5.1.1). Reviewers need a demo workspace login.
5. Bump `versionCode`/`versionName` (android/app/build.gradle) and the iOS build number for every upload.
