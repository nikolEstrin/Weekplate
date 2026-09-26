# iOS build and App Store release

## Project facts

| Item | Value |
|---|---|
| Capacitor | 8.5 (`@capacitor/ios`), Swift Package Manager (no CocoaPods) |
| Xcode project / scheme | `ios/App/App.xcodeproj` / `App` |
| Bundle ID | `com.nikolestrin.weekplate` (**placeholder**: confirm or change in Apple Developer) |
| Display name | Weekplate |
| Version / build | `MARKETING_VERSION = 1.0.0`, `CURRENT_PROJECT_VERSION = 1` |
| Deployment target | iOS 15.0 |
| Devices | iPhone only (`TARGETED_DEVICE_FAMILY = 1`), portrait |
| URL scheme | `weekplate` (auth callback `weekplate://auth/callback`) |
| Web assets | packaged from `dist/` (no remote `server.url`) |
| Encryption export | `ITSAppUsesNonExemptEncryption = false` (see note below) |
| Privacy manifest | `ios/App/App/PrivacyInfo.xcprivacy` |

Native plugins: app, keyboard, status-bar, splash-screen, haptics, network, share,
filesystem, `@capacitor-community/sqlite`, `@aparajita/capacitor-secure-storage`.

## Build locally (macOS)

```bash
cp .env.example .env         # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm ci
npm run cap:sync             # vite build && cap sync ios
npm run ios:open             # opens Xcode
```

In Xcode: select the `App` target → Signing & Capabilities → choose your Team.
Run on a simulator or device.

The Supabase URL, publishable key and `VITE_PRIVACY_POLICY_URL` are embedded at
build time. Build with the production values for TestFlight and App Store builds; the
Settings privacy-policy link is hidden when `VITE_PRIVACY_POLICY_URL` is empty.

**Encryption export note (owner decision):** the app's own encryption is HTTPS/TLS
through the system, which is exempt. `@capacitor-community/sqlite` links the
SQLCipher library, but database encryption is disabled (`iosIsEncryption: false`,
no passphrase is ever set; data is protected by iOS data protection). On that
basis the plist declares `false`. Confirm this answer yourself in App Store Connect's
export-compliance questions before the first submission.

## CI

- `.github/workflows/ci.yml` (Ubuntu): `npm ci`, lint, tests (incl. RLS tests on PGlite), build.
- `.github/workflows/ios-build.yml` (macOS 15): `npm ci`, build, `cap sync ios`,
  resolve Swift packages, `xcodebuild -project ios/App/App.xcodeproj -scheme App
  -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build`. This proves the native project
  compiles. It does not sign or upload.

This project was prepared on Windows. The Xcode build has **not** been run locally;
the first macOS CI run or a local Xcode build is the first real compile check.

## Release steps (manual, needs Apple account)

1. Apple Developer: register the App ID (bundle ID above, or your final one; if it
   changes, update `capacitor.config.json` `appId` and `PRODUCT_BUNDLE_IDENTIFIER`).
2. App Store Connect: create the app (name, primary language Hebrew, bundle ID, SKU).
3. Xcode: set the Team, keep automatic signing, Product → Archive, then Distribute →
   App Store Connect. Signing assets are never committed.
4. TestFlight: install on a physical iPhone and run the acceptance test in
   [APP_STORE_CHECKLIST.md](APP_STORE_CHECKLIST.md).
5. Fill in metadata ([APP_STORE_METADATA.md](APP_STORE_METADATA.md)), the privacy
   questionnaire ([APPLE_PRIVACY_AUDIT.md](APPLE_PRIVACY_AUDIT.md)), privacy policy
   URL, support URL and screenshots (6.7"/6.9" iPhone), then submit for review.
6. App Review needs a demo account: create one in Supabase (confirmed email) with
   sample data and put its credentials in the App Review notes, not in the repo.

## Future versions

- Bump `MARKETING_VERSION` (user-visible, e.g. 1.0.1 / 1.1.0) in the Xcode target and
  `CURRENT_PROJECT_VERSION` (must increase for every upload) before archiving.
- Local schema changes: add a migration in `src/db/migrations.js` (never delete data).
- Cloud schema changes: add a new file in `supabase/migrations/` and apply it before
  shipping a client that needs it. Keep changes backward compatible with installed
  app versions.

## App icon and launch screen

`AppIcon.appiconset` contains one 1024×1024 opaque PNG generated from
`public/favicon.svg`. The launch screen uses the app background color `#FAF6F0`.
**FINAL APP ICON REQUIRED:** replace the generated icon with final artwork before
submission (1024×1024 PNG, no transparency).
