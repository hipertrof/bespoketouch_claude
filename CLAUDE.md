# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Compact instructions
When compacting, drop exploratory reasoning.

## Project structure

- `src/` — React SPA: components (organized by feature/context), contexts, i18n, static data, and client API wrappers (`lib/`). Styled with **Tailwind CSS**.
- `src/App.tsx` — React Router setup. Kiosk flow at `/` (anonymous); all other routes require `AuthContext` (staff dashboards).
- `api/` — Vercel serverless functions; core logic in `_*Core.ts` files (shared by prod + dev proxy). Each endpoint (`members.ts`, `guest.ts`, `device.ts`, `pairing.ts`, `intake.ts`, `survey.ts`) mirrors a dev proxy plugin.
- `vite-plugins/` — dev proxy middlewares. When you add/change an endpoint in `api/`, update or add its corresponding proxy (e.g., `api/survey.ts` ↔ `vite-plugins/survey-proxy.ts`), registered in `vite.config.ts`.
- `supabase/migrations/` — SQL migrations applied via Supabase dashboard/CLI (not automated).
- `dist/` — build output (created by `npm run build`).

## Commands

- `npm run dev` — Vite dev server. The dev server also serves the `/api/*` endpoints via middleware plugins (see "Serverless functions" below), so most backend work is testable locally.
- `npm run build` — `tsc -b && vite build`. TypeScript is project-references (`tsc -b`); a type error fails the build. TypeScript enforces `noUnusedLocals` and `noUnusedParameters`, so remove dead code. Do this before committing non-trivial changes.
- `npm run lint` — `oxlint` (not ESLint). Fast; run it after edits.
- `npm run preview` — preview the production bundle (use when `npm run build` succeeds).

There is **no test runner configured**. `src/lib/rls-isolation.test.ts` exists but is not wired to any `test` script — do not assume `npm test` works.

## What this is

**BespokeTouch** — a multi-tenant SaaS spa product with two faces:
1. A **guest-intake kiosk** (route `/`) — an anonymous, no-login, multi-step, multi-language state machine a spa guest fills in on a tablet (preferences, body-map pain zones, oil choices) that hands off to a therapist.
2. **Staff dashboards** (all other routes) — login-gated, role-scoped React screens: platform admin, offer CMS, therapist queue, staff management, kiosk/device management.

Backend is **Supabase** (Postgres + Auth + REST). There is no custom app server — privileged operations run as **Vercel serverless functions** in `api/`. Everything else is a client-side SPA talking to Supabase REST under Row-Level Security.

## Architecture

### Multi-tenancy + RLS is the security boundary
`accounts → locations → (slots, services, intakes, guest_profiles, surveys)`. RLS is enabled on **every** table; access is decided by the `memberships` table (roles: `owner | manager | therapist | frontdesk`) or the `profiles.is_platform_admin` flag — **never** trusted from the client. When adding a table or query, assume RLS denies by default and add policies in a migration. The RBAC logic is mirrored in three places that must stay consistent: SQL `SECURITY DEFINER` helpers (`has_location_access`, `can_manage_location`, `is_account_owner`, etc.), the serverless authorization checks, and `AuthContext.tsx`'s `canManage` / `canManageLocation`.

### Serverless functions (`api/*.ts`) — strict conventions
These run on Vercel as **ESM without bundling** (`"type": "module"`). Three rules that WILL break the build/runtime if ignored:
- **Relative imports must use an explicit `.js` extension** (e.g. `import { handleGuest } from "./_guestCore.js"`) even though the source is `.ts`.
- **Underscore-prefixed files (`_guestCore.ts`, `_membersCore.ts`, …) are shared helpers, NOT routes.** Vercel treats every other `api/*.ts` as an HTTP endpoint.
- **No Supabase SDK in serverless functions.** The SDK crashed them with `FUNCTION_INVOCATION_FAILED`. Use dependency-free plain `fetch` against Supabase REST (`/rest/v1`) and Auth (`/auth/v1`). Copy the established pattern in `api/_membersCore.ts` / `api/_guestCore.ts`.

Two authorization styles for serverless endpoints:
- **Authed (manager-facing)** — e.g. `api/members.ts`, `api/pairing.ts`: take the caller's JWT, resolve identity via `GET /auth/v1/user`, then self-authorize with REST queries. Runs with the service-role key (bypasses RLS), so the endpoint must enforce access itself.
- **Anonymous (kiosk-facing)** — e.g. `api/guest.ts`, `api/device.ts`: no login. They resolve an active location → account server-side and scope by that. Guarded against exposing the service key; `sb_publishable_` guard rejects wrong keys.

### Dev proxies mirror the serverless functions
The dev server (`npm run dev`) runs middleware plugins that import the same core logic as prod serverless functions, so `/api/*` endpoints behave identically locally. Mapping:
- `/api/members` ← `api/_membersCore.ts` ↔ `vite-plugins/members-proxy.ts`
- `/api/guest` ← `api/_guestCore.ts` ↔ `vite-plugins/guest-proxy.ts`
- `/api/device` ← `api/_deviceAuth.ts` / `_deviceCore.ts` ↔ `vite-plugins/device-proxy.ts`
- `/api/pairing` ← `api/_pairingCore.ts` ↔ `vite-plugins/pairing-proxy.ts`
- `/api/intake` ← `api/_intakeCore.ts` ↔ `vite-plugins/intake-proxy.ts`
- `/api/survey` ← `api/_surveyCore.ts` ↔ `vite-plugins/survey-proxy.ts`

**When you add or change an endpoint in `api/`, update or add its dev proxy.** Without it, the endpoint works in prod but 404s in dev. Proxies are registered in `vite.config.ts` and receive secrets via `loadEnv`.

### Client → backend patterns
- Authed dashboard calls: `supabase.auth.getSession()` → `Authorization: Bearer <token>` (see `src/lib/members.ts`, `src/lib/pairing.ts`).
- Client reads that RLS permits go directly through the `supabase` JS client (`src/lib/supabase.ts`); privileged writes go through the serverless endpoints via `src/lib/*.ts` wrappers.
- Context providers own cross-cutting state: `AuthContext` (session + roles), `LanguageContext` (persistent staff language, `bt_lang`), `DeviceContext` (kiosk pairing token, `bt_device_token`), `CatalogContext` (active location + services), `GuestContext` (the intake reducer/state machine).

### Device pairing / billing model
A kiosk identifies its location **only** by a paired device token (6-digit activation → `bt_device_token` in localStorage, validated against `slots`/`tokens`/`pair_codes`). `DeviceContext` resolves it and exposes `{status, locationId, token}`; `CatalogContext` consumes `locationId` from there. `?demo` runs the bundled offer with no token (so it can read a demo catalogue but write nothing). The `?location=<uuid>` param was **retired in Phase 2 hardening** — don't reintroduce a client-supplied location. Slots are capped by `accounts.slots_paid` (set manually in `/admin` — Stripe is deferred).

The enforcement split is deliberate and **must not be flattened**:
- **Adding a new device is a HARD limit** — `/api/pairing` blocks past `accounts.slots_paid`.
- **A payment lapse is SOFT** — paired kiosks keep running and a live guest check-in is *never* blocked. `src/lib/billing.ts` classifies `accounts.subscription_end` into `ok | endingSoon | lapsed` (14-day window), and `SubscriptionBanner` shows a reminder on the **manager dashboards only** (`/manage`, `/kiosks`, `/staff`, `/reports`). It is deliberately absent from the kiosk and `/queue`, where it would sit in front of a guest. Nothing in `billing.ts` gates a control; a failed read renders nothing rather than breaking the dashboard. `/admin` shows the same status as a chip so the operator knows who to chase. Stripe is still deferred — dates are set by hand in `/admin`.

### Kiosk writes are device-token authenticated (do not regress)
The kiosk has no login, but it is **not unauthenticated**. Every kiosk write goes through a serverless endpoint that takes the device token and **derives the location from it** — the client never says which location it is writing to. `api/_deviceAuth.ts` is the single definition of "valid token" (exists, not revoked, slot active); `resolveDevice()` returning null MUST mean 401, never a fallback to a client-supplied location.
- `/api/intake` (`_intakeCore.ts`) — replaces the old anon RLS insert. Pins `status` and `expires_at` server-side.
- `/api/guest` (`_guestCore.ts`) — takes `deviceToken`, not `locationId`.
- Migration `0012` dropped `intakes_insert_anon` + the anon INSERT grant, so `anon` now has **no** access to `intakes` in either direction.

The anon **read** bridge deliberately stays (0003 services, 0009 `kiosk_*` RPCs): an active location's price list is a public menu. Reads leak a price list and therapist first names; writes were the real hole.

### GDPR / privacy constraints (do not regress)
- Guest phone numbers are **never stored raw** — only as `HMAC-SHA256(normalized_phone, GUEST_HASH_SECRET + account_id)`. Rotating `GUEST_HASH_SECRET` orphans all `guest_profiles` rows.
- The guest CRM stores **structured comfort preferences only**. Free-text notes (`zoneNotes`, `generalNote`) are treated as Article 9 health data and must **never** be persisted — `toStoredPreferences()` in `src/lib/guestProfile.ts` deliberately never reads them.
- CRM is opt-in: `save` requires `consent === true` and stamps `consent_version`/`consent_at` server-side.

### i18n
Eight languages (`pl/en/uk/it/fr/de/es/id`) in `src/i18n/translations.ts` as `ui: Record<string, Record<LangCode, string>>` — the type is compiler-enforced, so **every new key needs all 8 translations** or `tsc -b` fails. Use `t(key, lang)` / `tf(key, lang, vars)`. Kiosk language is per-session; staff dashboards use the persistent `LanguageContext`.

## Database migrations
SQL migrations live in `supabase/migrations/NNNN_name.sql`, applied in order via the Supabase dashboard/CLI (not automated by this repo). Each phase adds its own feature-table RLS policies. When adding a table, enable RLS and add policies in the same migration; secrets tables (e.g. `pair_codes`) stay service-role-only (no grant, no policy).

## Environment
See `.env.example`. `VITE_`-prefixed vars ship to the client (Supabase URL + anon key — safe, RLS is the boundary). Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GUEST_HASH_SECRET`, `DEEPL_API_KEY`) must **never** be prefixed `VITE_` or imported into client code; they're read by the serverless functions (prod) and the Vite proxies (dev).
