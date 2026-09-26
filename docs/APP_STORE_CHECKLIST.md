# App Store checklist (owner actions only)

Everything else is implemented in the repository. These steps need your accounts,
credentials, legal details, final branding or a physical iPhone.

## Supabase account

- [ ] Create a Supabase project (choose region). Note the Project URL and the publishable (anon) key.
- [ ] Apply the migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`
      (or paste both files from `supabase/migrations/` in order into the SQL editor).
- [ ] Auth → URL configuration: Site URL `weekplate://auth/callback`; Redirect URLs:
      `weekplate://auth/callback` (and `http://localhost:5173/` for development).
- [ ] Auth → Email: keep email confirmation on; set up custom SMTP for production sending limits;
      optionally translate the confirmation and reset email templates to Hebrew.
- [ ] Deploy the Edge Function: `npx supabase functions deploy delete-account`.
- [ ] Create `.env` from `.env.example` with the URL and publishable key (never the service-role key).
- [ ] Create an App Review demo account (confirm its email) and add sample data.

## Apple Developer / App Store Connect

- [ ] Confirm the bundle ID (`com.nikolestrin.weekplate` placeholder) and register the App ID.
- [ ] Create the app in App Store Connect.
- [ ] In Xcode set your Team for signing; archive and upload (see IOS_APP_STORE_RELEASE.md).
- [ ] Enter metadata, keywords, screenshots, privacy questionnaire, age rating, App Review notes with demo credentials.

## Legal and contact

- [ ] Fill placeholders in `docs/PRIVACY_POLICY.md` (legal name, region, contact email) and publish it at a public URL.
- [ ] Set `VITE_PRIVACY_POLICY_URL` to that URL for the release build (the Settings link is hidden while it's empty).
- [ ] Confirm the export-compliance answer (see the encryption note in `IOS_APP_STORE_RELEASE.md`).
- [ ] Publish a support page / contact email and enter the Support URL.

## Branding

- [ ] **FINAL APP ICON REQUIRED:** replace `ios/App/App/Assets.xcassets/AppIcon.appiconset` image (1024×1024, no transparency).
- [ ] Optional: final launch-screen artwork.

## Physical iPhone validation (TestFlight)

- [ ] First macOS/Xcode build (CI workflow `iOS Simulator Build` or local Xcode) compiles.
- [ ] Register → confirm email link opens the app → signed in.
- [ ] Starter products visible; create a private product; create a meal from starter + private products; plan it.
- [ ] Close and reopen: data appears immediately.
- [ ] Airplane mode: edit something; banner shows unsynced changes; turn network on: syncs.
- [ ] Sign in on a second device or simulator: same data.
- [ ] Sign in as another account: none of the first account's data.
- [ ] Log out, then log back in: data present.
- [ ] Forgot password: email link opens the app on the reset screen; new password works.
- [ ] Keyboard never hides inputs (login, product form, meal form, quantities); safe areas look right on a Dynamic Island device.
- [ ] Export my data opens the share sheet; restore from that file works.
- [ ] Delete account: cloud rows gone (check in Supabase), app back at login, local data gone.
- [ ] If you have data on the old website: move it with the steps in LEGACY_DATA_MIGRATION.md.
