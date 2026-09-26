# Apple privacy audit

Based on the code in this repository (September 2026). Re-check after adding any SDK.

## What the app collects

| Data | Where it comes from | Purpose | Stored | Linked to identity | Tracking |
|---|---|---|---|---|---|
| Email address | Sign-up / login form | Account, sign-in, password reset | Supabase Auth | Yes | No |
| Password | Sign-up / login form | Authentication | Supabase Auth, as a hash only; never stored or logged by the app | Yes | No |
| Auth user ID (UUID) | Supabase Auth | Ownership of the user's rows | Supabase, device | Yes | No |
| Products, units, meals, day plans, goals, shopping checks | User input | App functionality (meal planning, sync across devices) | Device SQLite + Supabase Postgres | Yes | No |
| Sync metadata (`updated_at`, `server_updated_at`, tombstones) | Generated | Sync correctness | Device + Supabase | Yes | No |
| Session tokens | Supabase Auth | Stay signed in | iOS Keychain (device only) | Yes | No |
| IP address, user agent in request logs | Automatic (HTTPS requests) | Supabase service operation and security | Supabase logs (per Supabase retention) | Processor side | No |

Not collected: location, contacts, photos, health data from HealthKit, device IDs,
advertising ID, analytics, crash reporting, purchases. There are no ads, no
tracking SDKs, and no third-party analytics. Nutrition values and goals are typed in
by the user as meal-planning content; nothing is read from Apple Health.

## Third-party processors

- **Supabase** (authentication, database, Edge Function). Hosting region is chosen
  when the Supabase project is created. Transactional auth emails are sent through
  Supabase's email service or the SMTP provider configured by the owner.
- **Apple** (App Store distribution; iOS share sheet when the user exports a file).

## App Store Connect privacy questionnaire (suggested answers)

- Data used to track you: **None**.
- Data linked to you:
  - Contact Info → **Email Address**: App Functionality.
  - User Content → **Other User Content** (meal plans, recipes, products, goals): App Functionality.
  - Identifiers → **User ID**: App Functionality.
- Data not linked to you: none declared. Server logs are operated by the processor
  for security and are not used by the developer for analytics.

Decision to review: the calorie and macro goals and meal plans are user-entered
planning content, not physiological measurements, so they are declared as "Other
User Content" rather than "Health & Fitness". If you disagree, also declare
Health & Fitness → Fitness with purpose App Functionality.

## Privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`)

- `NSPrivacyTracking = false`, no tracking domains.
- Collected data types: Email Address, User ID and Other User Content, all linked, not tracking, App Functionality.
- Required-reason APIs: UserDefaults `CA92.1` (Capacitor core / plugins store app-only
  preferences) and File Timestamp `C617.1` (files inside the app container, e.g. SQLite
  and export files). Plugins that ship their own privacy manifests are merged by Xcode.

## Deletion and retention

- **In-app deletion:** Settings → Account → "מחיקת חשבון" (confirmation required). The
  `delete-account` Edge Function deletes the auth user; the database FK cascade
  deletes all private rows (products, meals, plans, settings, shopping checks). The
  app then deletes the local SQLite file and signs out.
- **Logout:** does not delete cloud data. The user's local database stays on the device
  (encrypted at rest by iOS data protection) and is only opened after signing in as that user.
- **Retention:** account data is kept until the user deletes the account. Tombstones
  for deleted items are kept with the account and removed on account deletion.
  Backups and log retention follow the Supabase plan settings.
- **Export:** Settings → "הנתונים שלי" → "ייצוא כל הנתונים שלי" creates a JSON file
  containing all of the user's data.
