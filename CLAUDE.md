# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Compact instructions
When compacting, drop exploratory reasoning.

## Project structure

- `src/` — React SPA: components (organized by feature/context), contexts, i18n, static data, and client API wrappers (`lib/`). Styled with **Tailwind CSS**.
- `src/App.tsx` — React Router setup. Kiosk flow at `/` (anonymous); all other routes require `AuthContext` (staff dashboards).
- `api/` — Vercel serverless functions; core logic in `_*Core.ts` files (shared by prod + dev proxy). Each endpoint (`members.ts`, `guest.ts`, `device.ts`, `pairing.ts`, `intake.ts`, `survey.ts`, `checkin.ts`, `translate.ts`) mirrors a dev proxy plugin.
- `vite-plugins/` — dev proxy middlewares. When you add/change an endpoint in `api/`, update or add its corresponding proxy (e.g., `api/survey.ts` ↔ `vite-plugins/survey-proxy.ts`), registered in `vite.config.ts`.
- `supabase/migrations/` — SQL migrations applied via Supabase dashboard/CLI (not automated).
- `dist/` — build output (created by `npm run build`).

## Commands

- `npm run dev` — Vite dev server. The dev server also serves the `/api/*` endpoints via middleware plugins (see "Serverless functions" below), so most backend work is testable locally. ⚠️ **Local `.env` limitation**: server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GUEST_HASH_SECRET`, `DEEPL_API_KEY`) are required for serverless functions to work; without them, `/api/*` endpoints return "missing config" in local dev. The dev proxy middleware can't initialize the core logic. Paired-device flows and admin operations (`/api/members`, `/api/pairing`) are unreachable without these secrets — the kiosk `?demo` route bypasses this by design (no writes, no auth).
- `npm run build` — `tsc -b && vite build`. TypeScript is project-references (`tsc -b`); a type error fails the build. TypeScript enforces `noUnusedLocals` and `noUnusedParameters`, so remove dead code. Do this before committing non-trivial changes.
- `npm run lint` — `oxlint` (not ESLint). Fast; run it after edits.
- `npm run preview` — preview the production bundle (use when `npm run build` succeeds).

### Testing the kiosk without prod secrets

The kiosk (`/`) uses device-token auth and device-derived writes that require `SUPABASE_SERVICE_ROLE_KEY`, `GUEST_HASH_SECRET`, and `DEEPL_API_KEY` in `.env` to work. These are only available in prod; local dev lacks them.

**Workaround for kiosk development:** Use `?demo` query param on localhost (e.g., `http://localhost:5173/?demo`). It:
- Bypasses device token resolution (no pairing needed)
- Skips auth on intake/guest/survey writes
- Uses bundled demo offers + therapist list
- Preserves the full kiosk UI flow for feature testing

`?demo` is hardcoded to read-only in the kiosk entry point — it cannot write intakes or guest profiles. Use it for UI/UX validation, language/i18n tests, and step flow verification. For end-to-end write testing (intake → /queue), deploy to prod or Vercel preview with the secret keys exposed.

There is **no test runner configured**. `src/lib/rls-isolation.test.ts` exists but is not wired to any `test` script — do not assume `npm test` works. Manual test procedures live in `docs/TEST-PLAN.md` and `docs/TEST-SCRIPT.md` (comprehensive, ~50 cases covering RLS isolation as manager+therapist).

## Current production state

**Phases complete and live:** 0 (foundation), 1 (tenancy/RBAC), 2 (device pairing + hardening), 3 (offer CMS + therapist queue), 4a (opt-in guest CRM), 4b (post-treatment survey), 5 (soft-lapse reminders). Full RLS isolation verified (test pass ~50 cases as manager + therapist roles). Room/bed assignment (see below) shipped on top of Phase 3; the guest CRM's base/health consent split (see below) shipped on top of Phase 4a. **Deferred:** Stripe integration (subscription dates set by hand in `/admin`).

## What this is

**BespokeTouch** — a multi-tenant SaaS spa product with two faces:
1. A **guest-intake kiosk** (route `/`) — an anonymous, no-login, multi-step, multi-language state machine a spa guest fills in on a tablet (preferences, body-map pain zones, oil choices) that hands off to a therapist.
2. **Staff dashboards** (all other routes) — login-gated, role-scoped React screens: platform admin, offer CMS, therapist queue, staff management, kiosk/device management. Six of these share `DashboardShell.tsx` for header/nav chrome.

Backend is **Supabase** (Postgres + Auth + REST). There is no custom app server — privileged operations run as **Vercel serverless functions** in `api/`. Everything else is a client-side SPA talking to Supabase REST under Row-Level Security.

`/design-lab` is a third category: a static internal mockup sandbox (no data access, no RLS/RBAC) for exploring dashboard redesigns. Don't treat it as a real dashboard route or wire it to live data.

`/checkin` is a fourth: an anonymous page the *guest's own phone* reaches by scanning a QR the kiosk shows (not the kiosk itself). It has no `DeviceProvider`/`AuthProvider` — its only credential is the short-lived one-time code in the URL. See "QR self-check-in" below.

## Architecture

### Multi-tenancy + RLS is the security boundary
`accounts → locations → (slots, services, intakes, guest_profiles, surveys)`. RLS is enabled on **every** table; access is decided by the `memberships` table (roles: `owner | manager | therapist | frontdesk`) or the `profiles.is_platform_admin` flag — **never** trusted from the client. When adding a table or query, assume RLS denies by default and add policies in a migration. The RBAC logic is mirrored in three places that must stay consistent: SQL `SECURITY DEFINER` helpers (`has_location_access`, `can_manage_location`, `is_account_owner`, etc.), the serverless authorization checks, and `AuthContext.tsx`'s `canManage` / `canManageLocation`.

**RLS-gated UPDATE/DELETE silently no-ops instead of erroring.** A policy's `USING` clause just filters which rows a write touches — a row it blocks isn't an error, it simply isn't updated/deleted, and Supabase returns `error: null` with zero rows affected either way. A client-side write that doesn't check the affected-row count can't tell "succeeded" from "matched nothing" (wrong id, stale UI state, an RLS mismatch). Any direct client `supabase.from(...).update()/.delete()` outside the kiosk's service-role endpoints should append `.select("id")` and throw if the returned array is empty (see `src/lib/rooms.ts`'s `updateRoom`/`deleteRoom`/`updateBed`/`deleteBed` for the pattern) — otherwise a real failure looks identical to success in the UI.

### Serverless functions (`api/*.ts`) — strict conventions
These run on Vercel as **ESM without bundling** (`"type": "module"`). Three rules that WILL break the build/runtime if ignored:
- **Relative imports must use an explicit `.js` extension** (e.g. `import { handleGuest } from "./_guestCore.js"`) even though the source is `.ts`.
- **Underscore-prefixed files (`_guestCore.ts`, `_membersCore.ts`, …) are shared helpers, NOT routes.** Vercel treats every other `api/*.ts` as an HTTP endpoint.
- **No Supabase SDK in serverless functions.** The SDK crashed them with `FUNCTION_INVOCATION_FAILED`. Use dependency-free plain `fetch` against Supabase REST (`/rest/v1`) and Auth (`/auth/v1`). Copy the established pattern in `api/_membersCore.ts` / `api/_guestCore.ts`.

Three authorization styles for serverless endpoints:
- **Authed (manager-facing)** — e.g. `api/members.ts`, `api/pairing.ts`: take the caller's JWT, resolve identity via `GET /auth/v1/user`, then self-authorize with REST queries. Runs with the service-role key (bypasses RLS), so the endpoint must enforce access itself.
- **Anonymous, device-token (kiosk-facing)** — e.g. `api/guest.ts`, `api/device.ts`, `api/intake.ts`: no login. They resolve an active location → account server-side from the paired kiosk's device token and scope by that. Guarded against exposing the service key; `sb_publishable_` guard rejects wrong keys.
- **Anonymous, one-time-code (guest's-own-phone-facing)** — `api/checkin.ts` only so far: the kiosk mints a short-lived code (itself device-token-authed); the guest's phone then authenticates with just that code, no device token and no login. See "QR self-check-in" below for the trust model — reach for this pattern (not a new bespoke scheme) if a future feature needs to hand a guest's own device a capability.

### Dev proxies mirror the serverless functions
The dev server (`npm run dev`) runs middleware plugins that import the same core logic as prod serverless functions, so `/api/*` endpoints behave identically locally. Mapping:
- `/api/members` ← `api/_membersCore.ts` ↔ `vite-plugins/members-proxy.ts`
- `/api/guest` ← `api/_guestCore.ts` ↔ `vite-plugins/guest-proxy.ts`
- `/api/device` ← `api/_deviceAuth.ts` / `_deviceCore.ts` ↔ `vite-plugins/device-proxy.ts`
- `/api/pairing` ← `api/_pairingCore.ts` ↔ `vite-plugins/pairing-proxy.ts`
- `/api/intake` ← `api/_intakeCore.ts` ↔ `vite-plugins/intake-proxy.ts`
- `/api/survey` ← `api/_surveyCore.ts` ↔ `vite-plugins/survey-proxy.ts`
- `/api/checkin` ← `api/_checkinCore.ts` ↔ `vite-plugins/checkin-proxy.ts`
- `/api/translate` ← `api/_translateCore.ts` (DeepL) ↔ `vite-plugins/deepl-proxy.ts`

**When you add or change an endpoint in `api/`, update or add its dev proxy.** Without it, the endpoint works in prod but 404s in dev. Proxies are registered in `vite.config.ts` and receive secrets via `loadEnv`.

### Client → backend patterns
- Authed dashboard calls: `supabase.auth.getSession()` → `Authorization: Bearer <token>` (see `src/lib/members.ts`, `src/lib/pairing.ts`).
- Client reads that RLS permits go directly through the `supabase` JS client (`src/lib/supabase.ts`); privileged writes go through the serverless endpoints via `src/lib/*.ts` wrappers.
- Context providers own cross-cutting state: `AuthContext` (session + roles), `LanguageContext` (persistent staff language, `bt_lang`), `DeviceContext` (kiosk pairing token, `bt_device_token`), `CatalogContext` (active location + services), `GuestContext` (the intake reducer/state machine).

### Device pairing / billing model
A kiosk identifies its location **only** by a paired device token (6-digit activation → `bt_device_token` in localStorage, validated against `slots`/`tokens`/`pair_codes`). `DeviceContext` resolves it and exposes `{status, locationId, token}`; `CatalogContext` consumes `locationId` from there. `?demo` runs the bundled offer with no token (so it can read a demo catalogue but write nothing). The `?location=<uuid>` param was **retired in Phase 2 hardening** — don't reintroduce a client-supplied location. Slots are capped by `accounts.slots_paid` (set manually in `/admin` — Stripe is deferred).

`/admin` (`PlatformAdminDashboard.tsx`) creates/edits/**deletes** accounts and locations via direct client-side RLS calls (no serverless endpoint — `accounts_admin_write` / `locations_write` are `FOR ALL` policies, so platform admin already has DELETE, and every child table FKs `on delete cascade` from `accounts`/`locations`). Account delete requires typing the exact account name to confirm (cascades an entire tenant); location delete is a two-click confirm. This component is hardcoded Polish, not wired to `i18n`.

The enforcement split is deliberate and **must not be flattened**:
- **Adding a new device is a HARD limit** — `/api/pairing` blocks past `accounts.slots_paid`.
- **A payment lapse is SOFT** — paired kiosks keep running and a live guest check-in is *never* blocked. `src/lib/billing.ts` classifies `accounts.subscription_end` into `ok | endingSoon | lapsed` (14-day window), and `SubscriptionBanner` shows a reminder on the **manager dashboards only** (`/manage`, `/kiosks`, `/staff`, `/reports`). It is deliberately absent from the kiosk and `/queue`, where it would sit in front of a guest. Nothing in `billing.ts` gates a control; a failed read renders nothing rather than breaking the dashboard. `/admin` shows the same status as a chip so the operator knows who to chase. Stripe is still deferred — dates are set by hand in `/admin`.

### Kiosk writes are device-token authenticated (do not regress)
The kiosk has no login, but it is **not unauthenticated**. Every kiosk write goes through a serverless endpoint that takes the device token and **derives the location from it** — the client never says which location it is writing to. `api/_deviceAuth.ts` is the single definition of "valid token" (exists, not revoked, slot active); `resolveDevice()` returning null MUST mean 401, never a fallback to a client-supplied location.
- `/api/intake` (`_intakeCore.ts`) — replaces the old anon RLS insert. Pins `status` and `expires_at` server-side.
- `/api/guest` (`_guestCore.ts`) — takes `deviceToken`, not `locationId`.
- Migration `0012` dropped `intakes_insert_anon` + the anon INSERT grant, so `anon` now has **no** access to `intakes` in either direction.

The anon **read** bridge deliberately stays (0003 services, 0009 `kiosk_*` RPCs): an active location's price list is a public menu. Reads leak a price list and therapist first names; writes were the real hole.

### QR self-check-in (`/checkin`, `checkin_codes`)
Lets a guest use their *own* phone instead of the kiosk (e.g. to avoid saying a phone number aloud). The kiosk's welcome step mints a code (`api/_checkinCore.ts`'s `mint`, device-token-authed like any other kiosk write) and shows it as a QR encoding `/checkin?c=<code>`. From there the guest's phone is anonymous but not uncredentialed: `checkin_codes` (migration `0019`) is a `pair_codes`-style secrets table (hash-only storage, no grant, no policy — service-role only), and the code is short-lived (15 min), lookup-capped, and dies the instant `save` succeeds — `used_at` is claimed atomically (`used_at is.null` on the update) *before* the intake insert, so a retried/double-tapped `save` can't create two intakes for one code. `save` only ever **updates an existing** `guest_profiles` row — it never originates one, so a brand-new guest still does the kiosk flow — and it creates an `intakes` row with `status: 'incomplete'` (missing guest name/therapist/treatment) rather than a normal `'submitted'` one. Reception fills the rest in from `/queue` via `completeIntake()` (`src/lib/intakes.ts`), a plain RLS-gated update — no serverless endpoint needed, since `intakes_update_auth` already covers it.

**This page captures consent itself** (retired the earlier "consent capture is kiosk-only" rule) — `CheckinPage.tsx`'s `ConsentSection` is the same nested base/health toggle pair as the kiosk's `PreferencesStep.tsx`, and `saveByCode` takes `consent`/`healthConsent` in the body, same semantics as `_guestCore.ts`'s `saveGuest` (see "Guest CRM: base vs. health consent" below): `consent !== true` **deletes** the `guest_profiles` row instead of editing it; `healthConsent === true` lets the phone view/edit zones + notes directly (full replace — no more silent stripping). `CheckinPrefsEditor.tsx` only renders the zone/note fields when `healthConsent` is true: a compact list of zones already marked non-default or carrying a note (with a per-row remove ×), plus the same interactive body map as the kiosk's `BodyMapStep` (silhouette + tap markers + `ZonePopover`, driven by the parent-owned `StoredPreferences` instead of `GuestContext`), collapsed behind a "Mark on the body map" button so it doesn't eat the phone viewport.

### Known gap: kiosk live-session view unreachable
The kiosk has a `masseur` AppStep (`src/components/steps/MasseurDashboard.tsx`) intended to display a live intake summary *on the same tablet* after the guest hands it back. Currently this step is unreachable via any UI action — no button or gesture dispatches to it. The therapist-facing summary is available via the `/queue` staff dashboard instead (which works and is fully routed). This gap does not break the product (the summary exists and renders correctly when manually navigated to), but it prevents the intended feature of immediate on-tablet review. Decide whether this should be wired with a "hand to therapist" button on the handoff screen or if `/queue` should be the sole canonical path going forward.

### GDPR / privacy constraints (do not regress)
- Guest phone numbers are **never stored raw** — only as `HMAC-SHA256(normalized_phone, GUEST_HASH_SECRET + account_id)`. Rotating `GUEST_HASH_SECRET` orphans all `guest_profiles` rows.
- Guest CRM consent (`guest_profiles.preferences` / `consent_version` / `health_consent_version`) is opt-in and split into base + health tiers — see "Guest CRM: base vs. health consent" below for the full model. `toStoredPreferences()` / `applyStoredPreferences()` in `src/lib/guestProfile.ts` are the client (de)serializer; `sanitizePreferences()` in `api/_guestCore.ts` is the server-side structural whitelist + length cap (consent-blind by design — callers enforce the health gate) — keep all three in sync on any shape change.
- **Intake rows are the *other* place health data lives, and they are scrubbed, not exempt.** `intakes.personalizations` carries the same `zoneNotes`/`generalNote`/`zones` for the therapist handoff. Migration `0018_intake_lifecycle.sql` adds a trigger that blanks those three keys (to `{}`/`""`, not deleted — `IntakePanel` reads them as required fields with no null-guards) the moment `status` flips to `'done'`, plus an hourly `pg_cron` job that auto-flips (and thus scrubs) any intake still not done after 24h. `api/_surveyCore.ts`'s `submitSurvey` also flips an intake to `done` on its linked visit's first survey response — so "done" now has three triggers (manual /queue button, survey submission, 24h timeout), all funneled through the one trigger function. `/queue` (`TherapistQueue.tsx`) splits Active (`status !== 'done'`) vs Archive (`status === 'done'`) tabs; archived rows are expected to have blank notes/zones. `status` has a third value, `'incomplete'` (QR self-check-in — see above), which is also `!== 'done'` so it lands on the Active tab and goes through the same scrub/24h-timeout path as any other intake. Migration `0021` adds a CHECK constraint pinning `status` to exactly these three values at the DB level, so no writer can escape the scrub/sweep by parking a row in some other status string.

### Room/bed assignment
Beds belong to rooms (pick a room, then a bed within it) — `rooms`/`beds` tables (migration `0022`), location-scoped, RLS mirroring the `services` pattern (`has_location_access` read, `can_manage_location` write). Managed per-location on `/manage` (`RoomsEditor.tsx` + `src/lib/rooms.ts`, admin CRUD under RLS, hard delete — see the RLS no-op note above). The kiosk reads via `kiosk_rooms(location)`, a `SECURITY DEFINER` RPC mirroring `kiosk_therapists` (no anon table grant needed). Assignment is **optional** — `WelcomeStep`'s room/bed picker only renders when the location has rooms configured, and it never gates `canContinue`. Like `TherapistAssignment`, the pick is stored on the intake as a **name snapshot** (`RoomAssignment {roomId, roomName, bedId, bedName}`, index-aligned per guest in `intakes.room_assignments`) so a later room rename/delete doesn't rewrite history — ids are kept alongside the names as groundwork for a future CRM join, not used by anything today.

### Per-service pressure levels
Each service can restrict which of the four global pressure levels (`Lekki | Średni | Mocny | Głęboki`, `PressureLevel` in `src/types/index.ts`) it offers, instead of always offering all four. `services.pressure_levels` (migration `0023`, `text[]`, CHECK-constrained to those four values) is **nullable = all four offered** — the canonical "no restriction" value, so existing rows and the bundled demo catalogue need no backfill. `src/lib/catalog.ts`'s `normalizePressureLevels()` collapses a full or invalid array back to `undefined` on read, so downstream code (`MassageType.pressureLevels`) only ever sees `undefined` (all offered) or a genuine subset. Managed per-service in `/manage` (`OfferCMS.tsx`'s `ServiceEditor` — toggle pills, blocks unchecking the last level; the DB CHECK is the backstop). The kiosk's `PreferencesStep.tsx` filters the pressure `SegmentedControl` to the active guest's selected massage's offered levels, and clamps an out-of-range `preferences.pressure` (a stale default, a CRM-prefilled value, or a massage switched after the fact) to the nearest still-offered level, ties resolved toward the softer option.

### Guest CRM: base vs. health consent (migration `0024`)
The single opt-in consent from Phase 4a is split into two nested tiers, both required-explicit and both server-stamped in `api/_guestCore.ts`'s `saveGuest`:
- **Base** (`BASE_CONSENT_VERSION`, `consent_version`/`consent_at`) covers only the structured comfort prefs — pressure, oilId, tableWarming, headrestPillow, music, communication.
- **Health** (`HEALTH_CONSENT_VERSION`, `health_consent_version`/`health_consent_at`) is a *second*, nested opt-in (meaningless without base) that additionally covers **body-zone marks** (`zones`) as well as the free-text `zoneNotes`/`generalNote`. The zone marks themselves are Article 9 health data here, not just the notes — marking a zone "priority"/"blocked" discloses a health-relevant area even with no text attached, so it needs the same consent as the notes do.

`saveGuest` strips `zones`/`zoneNotes`/`generalNote` from the payload and nulls both health columns whenever `healthConsent !== true` — so a save with health consent switched off (base still on) erases previously stored zones/notes without touching the rest of the profile, same withdrawal-must-be-as-easy-as-the-grant guarantee as the original single consent. `lookupGuest` strips them again on the way out (checks `health_consent_version`) as defense in depth. Client-side, `GuestCrmState` carries both `consent`/`healthConsent` booleans; `SET_GUEST_CONSENT` forces `healthConsent: false` whenever base goes off, enforcing the nesting in both directions. The kiosk's `PreferencesStep.tsx` consent card nests a second toggle, shown only while base is on.

Rows saved under the old single "2026-07-v2" consent were backfilled in `0024` (`health_consent_version = consent_version`) rather than left to special-case forever — that consent's disclosure copy already named zones+notes as health data, so no re-consent was needed.

### Body-map zones (anatomical markers)
A guest marks pain/preference zones on a silhouette during intake. Zone state flows: client (`GuestContext.zones`) → server write (`/api/intake` pins it) → stored in `intakes.personalizations` + optional guest CRM (`guest_profiles.preferences`, opt-in only). New zones require sync across four files:
- `src/types/index.ts` — `ZoneId` union (TypeScript enforces exhaustiveness on `zoneTranslations`)
- `src/data/zones.ts` — `zoneDefinitions` (label + view: front/back) + `zoneSummaryLabel` logic
- `src/i18n/translations.ts` — exhaustive `Record<ZoneId, Dict>` for all 8 languages
- `src/components/BodyMap/markerPositions.ts` — bilateral marker coordinates (left%, top%)

Server-side readers (`sanitizePreferences`, serializers in `guestProfile.ts`, `/queue` intake panel) are zone-id-agnostic, so only client changes needed when adding new zones.

### i18n
Eight languages (`pl/en/uk/it/fr/de/es/id`) in `src/i18n/translations.ts` as `ui: Record<string, Record<LangCode, string>>` — the type is compiler-enforced, so **every new key needs all 8 translations** or `tsc -b` fails. Use `t(key, lang)` / `tf(key, lang, vars)`. Kiosk language is per-session; staff dashboards use the persistent `LanguageContext`.

## Database migrations
SQL migrations live in `supabase/migrations/NNNN_name.sql`, applied in order via the Supabase dashboard/CLI (not automated by this repo). Each phase adds its own feature-table RLS policies. When adding a table, enable RLS and add policies in the same migration; secrets tables (e.g. `pair_codes`, `checkin_codes`) stay service-role-only (no grant, no policy).

## Environment
See `.env.example`. `VITE_`-prefixed vars ship to the client (Supabase URL + anon key — safe, RLS is the boundary). Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GUEST_HASH_SECRET`, `DEEPL_API_KEY`) must **never** be prefixed `VITE_` or imported into client code; they're read by the serverless functions (prod) and the Vite proxies (dev).
