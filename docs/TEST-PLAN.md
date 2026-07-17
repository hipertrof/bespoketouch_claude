# BespokeTouch — test catalogue (Phases 0–5, pre-Stripe)

Every test case for what is built so far. Status: ✅ = already verified in prod, ⬜ = not yet run, 🔁 = verified once, re-run after any deploy touching that area.

**Conventions**

- "Prod" = https://bespoketouch.vercel.app. "Local" = `npm run dev` — ⚠️ local `/api/*` is dead until `.env` gets `SUPABASE_SERVICE_ROLE_KEY` + `GUEST_HASH_SECRET` (+ `DEEPL_API_KEY` for note translation).
- After ANY deploy that touches kiosk writes: **hard-reload the tablet** (stale bundles have hit post-deploy auth walls before).
- Use the `ZZZ Test` account / `ZZZ Lokalizacja` for anything destructive. Never change a real client's dates or slots.
- curl probes use the anon key (`VITE_SUPABASE_ANON_KEY`) as `apikey` header unless stated.

---

## 1. Device pairing & activation

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| PAIR-1 | Fresh kiosk is gated | Open `/` in a browser with no `bt_device_token` | Activation screen, no intake flow reachable | ✅ |
| PAIR-2 | Happy path | `/kiosks` → Dodaj kiosk → enter 6-digit code on tablet | Kiosk unlocks on the right location; `/kiosks` row flips to "Sparowany" | ✅ |
| PAIR-3 | Wrong code | Enter a made-up 6-digit code | "Nieprawidłowy lub wygasły kod", stays gated | ✅ |
| PAIR-4 | Expired code | Mint a code, wait >15 min (CODE_TTL_MINUTES), enter it | 410 → same invalid-code message | ⬜ |
| PAIR-5 | Code reuse | Pair successfully, then enter the same code on a second device | Rejected (code is single-use) | ⬜ |
| PAIR-6 | Reload persistence | Pair, then reload the tab | Stays paired (token from localStorage revalidates) | ✅ |
| PAIR-7 | Re-pair revokes old token | Re-pair the slot onto device B; reload device A | A falls back to activation screen; no extra slot consumed | ✅ |
| PAIR-8 | Re-pair rate limit | Re-pair twice within 60 s (REPAIR_COOLDOWN_SECONDS) | 429 `re_pair_too_soon`, UI shows "Zbyt szybko…" | ✅ |
| PAIR-9 | Revoke | `/kiosks` → Usuń on a paired slot; reload tablet | Tablet gated; slot freed (count drops) | ✅ |
| PAIR-10 | Heartbeat | Use a paired kiosk, then check `/kiosks` | "Ostatnio aktywny" updates | ✅ |

## 2. Billing — hard cap (slots)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| CAP-1 | Cap blocks new slot | Account at `slots_paid` slots → Dodaj kiosk | Blocked server-side; UI shows "Osiągnięto limit…" and disables add | ✅ |
| CAP-2 | Cap raise unlocks | `/admin`: raise Stanowiska → back to `/kiosks` | Add re-enabled, next slot creates | ⬜ |
| CAP-3 | Cap is server-side | With account at cap, POST `/api/pairing` createSlot directly with a valid manager JWT | Rejected regardless of client state | ⬜ |
| CAP-4 | Revoke frees capacity | At cap, revoke one slot → add one | Succeeds | ✅ |

## 3. Billing — soft lapse (Phase 5)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| SOFT-1 | Chip states in `/admin` | Set Koniec to +8d / +15d / −1d / blank, Zapisz each | amber chip / no chip / rose "Wygasła" / no chip; boundary: +14d amber, +15d none | ✅ |
| SOFT-2 | Banner on 4 dashboards | Owner/manager login, account ending soon | Banner on `/manage`, `/kiosks`, `/staff`, `/reports` | ✅ |
| SOFT-3 | Never in front of a guest | Same state → `/queue` and kiosk `/` | No banner on either | ✅ (queue) ⬜ (kiosk visual) |
| SOFT-4 | Lapsed ≠ blocked | Account lapsed → Dodaj kiosk, live check-in on its kiosk | Both still work — lapse gates nothing | ✅ (add) ⬜ (live check-in on lapsed account) |
| SOFT-5 | Lapsed banner undismissable | Lapsed account → `/manage` | Rose banner, no ✕ | ✅ |
| SOFT-6 | Dismiss semantics | Dismiss amber banner → navigate dashboards → change date in `/admin` | Stays hidden across nav (per tab); re-appears after date change; new tab shows it again | ✅ (nav+re-arm) ⬜ (new tab) |
| SOFT-7 | Platform admin sees no banner | Platform-admin-only login → `/manage` | No banner (no memberships) — by design | ✅ |
| SOFT-8 | Therapist sees no banner | Therapist login → `/queue` | No banner (role filtered) | ⬜ |
| SOFT-9 | Failed read renders nothing | Simulate accounts read failure (e.g. block request in devtools) | Dashboard renders normally, no banner, no crash | ⬜ |

## 4. Kiosk write authentication (do-not-regress)

curl probes; `$U` = Supabase URL, `$A` = prod app origin.

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| SEC-1 | Intake without token | `POST $A/api/intake` with no/junk `deviceToken` | 401, nothing written | ✅ |
| SEC-2 | Guest API without token | `POST $A/api/guest` lookup/save/forget with no/junk token | 401 | ✅ |
| SEC-3 | Survey without token | `POST $A/api/survey` with no/junk token | 401 | ✅ |
| SEC-4 | Location smuggling | Valid token + a `locationId` for a DIFFERENT location in the body | Server ignores it — row lands on the token's location | ✅ |
| SEC-5 | Anon intake grant revoked | `POST $U/rest/v1/intakes` with anon key | Grant-level "permission denied" (both directions) | ✅ |
| SEC-6 | Anon survey locked out | `GET/POST $U/rest/v1/survey_responses` with anon key | Denied | ✅ |
| SEC-7 | Revoked token is dead | Revoke a slot, then use its old token on `/api/intake` | 401 (resolveDevice → null → 401, never a fallback) | ⬜ |
| SEC-8 | Service key not in bundle | Fetch the prod JS bundle, grep for `service_role` / `GUEST_HASH_SECRET` / `DEEPL_API_KEY` / secret-key prefixes | Absent (`sb_secret_` appears only as the Supabase SDK's own format-validation literal — expected) | ✅ 2026-07-17 |
| SEC-9 | `?location=` stays dead | Open kiosk `/?location=<real-uuid>` unpaired | Activation screen; param ignored | ✅ |
| SEC-10 | `?demo` writes nothing | Complete a demo intake, try survey submit in `?demo` | Reads demo catalogue; no `/api` write succeeds (no token) | ✅ |

## 5. Anon read bridge (deliberately open)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| READ-1 | Active services readable | Anon `GET /rest/v1/services?...` for an active location | 200 (public price list) | ✅ |
| READ-2 | `kiosk_*` RPCs readable | Anon call the 0009 RPCs | 200, therapist first names only | ✅ |
| READ-3 | Inactive location hidden | Deactivate a location, repeat READ-1/2 | No rows for it | ⬜ |
| READ-4 | Bridge leaks nothing else | Anon `GET` on `accounts`, `memberships`, `guest_profiles`, `slots`, `tokens`, `pair_codes`, `profiles`, `intakes` | All denied/empty | ✅ 2026-07-17: all 7 + intakes denied at grant level |

## 6. Guest intake flow (kiosk UI)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| FLOW-1 | Full happy path | Welcome → preferences → body map → oils → handoff | Intake appears in `/queue` for the right location | ✅ |
| FLOW-2 | All 8 languages | Switch language on welcome; walk the flow in each | Every step fully translated (spot-check pl/en/uk minimum) | ⬜ (pl/en done) |
| FLOW-3 | Body map zones | Mark several zones front+back, add intensity; check therapist view | Zones and intensities match on `/queue` card | ✅ |
| FLOW-4 | Party of 2 | Choose 2 guests, complete both | Both land in queue, correctly attributed | ⬜ |
| FLOW-5 | Step back/forward | Navigate backward mid-flow, change answers, continue | No state leakage between steps; final intake reflects edits | ⬜ |
| FLOW-6 | Kiosk reset after handoff | Finish an intake | Kiosk returns to welcome, previous guest's data gone from screen | ✅ |
| FLOW-7 | Intake retention stamp | Inspect a new `intakes` row | `expires_at` ≈ now + 48 h; `status` pinned server-side | ✅ |
| FLOW-8 | Note translation (prod) | Write a Polish free-text note; view as EN therapist | DeepL translation shows (needs DEEPL_API_KEY in Vercel) | ⬜ |

## 7. Guest CRM (Phase 4a — GDPR-critical)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| CRM-1 | Opt-in save | Complete intake with phone + consent ticked | `guest_profiles` row created; `consent_version`/`consent_at` stamped server-side | ✅ |
| CRM-2 | No consent = no save | Same but consent unticked (or `consent:false` via curl) | 400 / no row | ✅ |
| CRM-3 | Phone never raw | Inspect the row | Only HMAC hash; raw phone appears nowhere in DB | ✅ |
| CRM-4 | **No Article 9 data** | Save with `zoneNotes` + `generalNote` filled | Stored preferences contain NEITHER — structured prefs only | ✅ |
| CRM-5 | Lookup prefill | Return visit: same phone on the same account's kiosk | Preferences prefill | ✅ |
| CRM-6 | Cross-account isolation | Same phone on a DIFFERENT account's kiosk | No hit (hash is keyed per account) | ⬜ |
| CRM-7 | Forget | Trigger forget for the phone | Row gone; next lookup misses | ✅ |
| CRM-8 | Phone normalization | Save as `+48 601-234-567`, look up as `48601234567` | Same profile found | ⬜ |

## 8. Post-treatment survey (Phase 4b)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| SUR-1 | Happy path | `/survey` on paired kiosk → front desk picks today's visit → guest answers 6 Qs | Row written, linked to therapist + treatment | ⬜ **(the open E2E)** |
| SUR-2 | All questions skippable | Skip every question, submit | Accepted; empty answers stored as null | ⬜ |
| SUR-3 | No repeat survey | Try to survey the same visit again | Visit absent from the picker; forced replay → 409 "already surveyed" | ✅ (409 path) ⬜ (picker hides it) |
| SUR-4 | NPS bounds | Attempt `nps: 11` via curl with a valid token | Rejected by `survey_nps_chk` | ⬜ |
| SUR-5 | 8 languages | Walk survey in each language | All translated | ⬜ (spot-check) |
| SUR-6 | `?demo` renders, can't submit | `/survey?demo` | Screen renders; submit fails (no token) | ✅ |
| SUR-7 | Failure shows reason | Force a submit failure (e.g. junk token) | Friendly message + technical reason underneath | ✅ |

## 9. Reports (`/reports`)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| REP-1 | Aggregates correct | Submit known answers (e.g. NPS 9, 6, 10) → check CSAT/NPS math | NPS = %promoters − %detractors; CSAT matches | ⬜ |
| REP-2 | Per-therapist / per-treatment | Multiple surveys across two therapists/treatments | Split correctly | ⬜ |
| REP-3 | Time windows | Toggle 7/30/90 days | Counts change accordingly | ⬜ |
| REP-4 | **Therapist sees nothing** | Log in as a therapist → `/reports` and direct REST reads of `survey_responses` | Route redirects away AND RLS returns zero rows (whole-table `can_manage_location`) | ⬜ **(open — needs therapist login)** |
| REP-5 | Manager location scope | Manager of location A only | Sees A's surveys, not B's | ⬜ |

## 10. Staff management & RBAC

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| STAFF-1 | Invite new user | Add member with a fresh email | Invite link generated; user sets password via `/welcome`; membership exists | ✅ |
| STAFF-2 | Attach existing user | Add member with an existing user's email | Attached, no re-invite (used for Phase 5 testing) | ✅ |
| STAFF-3 | Duplicate add | Add the same member twice | `alreadyMember`, no duplicate row | ⬜ |
| STAFF-4 | Only platform admin creates owners | As manager, try to add role=owner | Rejected server-side | ⬜ |
| STAFF-5 | Edit role/location | Change a member therapist→frontdesk, move location | Persists; their access changes accordingly | ✅ |
| STAFF-6 | Remove member | Trash a membership | Gone; user loses that access on next load | ✅ |
| STAFF-7 | Role-home redirect | Log in as each role | owner/manager → manage-side; therapist → `/queue`; platform admin → `/admin` | ✅ |
| STAFF-8 | Route gating | As therapist, open `/manage`, `/kiosks`, `/staff`, `/reports`, `/admin` directly | Redirected away from all | ⬜ (spot-checked) |
| STAFF-9 | Non-admin at `/admin` | Owner/manager opens `/admin` | "no platform-admin rights" screen | ✅ |

## 11. Multi-tenant isolation (RLS) — the security boundary

Run as a signed-in member of account A (not platform admin), via REST with their JWT.

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| RLS-1 | Accounts | `GET /rest/v1/accounts` | Only account A | ⬜ |
| RLS-2 | Locations/services | List both | Only A's | ⬜ |
| RLS-3 | Intakes cross-tenant | Read intakes | Only A's locations' | ⬜ |
| RLS-4 | Guest profiles | Read guest_profiles | Only A's (and only if role permits) | ⬜ |
| RLS-5 | Slots/tokens | Read slots, tokens | Only A's; `pair_codes` denied entirely (service-role only) | ⬜ |
| RLS-6 | Write escalation | UPDATE account A's `slots_paid`/`subscription_end` as owner | Denied (`accounts_admin_write` is platform-admin only) | ⬜ |
| RLS-7 | Cross-tenant write | INSERT a service into account B's location | Denied | ⬜ |
| RLS-8 | Membership forgery | INSERT own membership row granting owner on B | Denied | ⬜ |

`src/lib/rls-isolation.test.ts` exists but is not wired to a runner — these are manual curl checks until then.

## 12. Offer CMS (`/manage`)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| CMS-1 | CRUD service | Create, edit prices/durations, delete | Kiosk catalogue reflects changes after reload | ✅ |
| CMS-2 | Couple pricing | Toggle "para", set couple price | Kiosk shows both prices in party-of-2 | ⬜ |
| CMS-3 | Inactive service hidden | Untick Aktywna | Gone from kiosk, stays in CMS | ✅ |
| CMS-4 | Translations | Add per-language names | Kiosk shows the session language's name, falls back sanely | ⬜ |
| CMS-5 | Import default catalogue | On an empty location | Bundled offer imported | ✅ |
| CMS-6 | Location switcher scope | Switch locations | Services swap; no bleed between locations | ✅ |

## 13. Therapist queue (`/queue`)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| QUE-1 | Intake arrives | Kiosk handoff → queue | Appears with prefs, zones, oils | ✅ |
| QUE-2 | Therapist assignment | Assign a therapist to a guest | Persists; visible to the team | ✅ |
| QUE-3 | Location scope | Therapist tied to location A | Sees only A's queue | ⬜ |
| QUE-4 | Expiry | An intake past `expires_at` (48 h) | No longer listed | ⬜ |

## 14. Platform admin (`/admin`)

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| ADM-1 | Create account + location | Nowe konto, then add location | Both appear; deep links (Oferta/Personel/Kioski) work | ✅ |
| ADM-2 | Edit slots/dates | Change values, Zapisz | Persist; chip reflects saved value only after Zapisz | ✅ |
| ADM-3 | Subscription chip | (see SOFT-1) | — | ✅ |

## 15. i18n & languages

| ID | Test | Steps | Expected | Status |
|---|---|---|---|---|
| I18N-1 | Compiler completeness | `npm run build` | Fails if any ui key misses one of the 8 languages — this IS the test | ✅ (every build) |
| I18N-2 | Staff language persists | Switch language on a dashboard, reload, revisit | Sticks (`bt_lang`) across all dashboards | ✅ |
| I18N-3 | Kiosk language is per-session | Change kiosk language, finish intake | Next guest starts at default; staff language unaffected | ⬜ |
| I18N-4 | Locale dates | Banner/report dates in de/id/uk | Localized format, correct day (no TZ drift) | ✅ (en) ⬜ (others) |

## 16. Deploy / regression rituals

| ID | Test | When | Expected | Status |
|---|---|---|---|---|
| DEP-1 | Hard-reload kiosks after deploy | Any deploy touching kiosk writes | Old bundle can 401 against new auth — reload fixes | 🔁 |
| DEP-2 | `npm run build` + `npm run lint` | Before every commit | Clean | 🔁 |
| DEP-3 | Migration idempotence | Before applying any new migration | Re-runnable (`if not exists` / drop-then-create), ALTER-not-CREATE for 0001 tables | 🔁 |
| DEP-4 | Local `.env` parity | When touching `/api/*` locally | All three server secrets set locally or endpoint work is prod-only | ⬜ (currently NOT set) |

---

## Priority order for the open items

1. **SUR-1 + REP-1/REP-4** — the one E2E explicitly left open: real survey → `/reports`, and a therapist login proving they see nothing. Needs a real kiosk + a therapist account.
2. **RLS-1…8** — the security boundary has never had a systematic pass; one afternoon with two test users and curl.
3. **SEC-7, SEC-8** — cheap curl probes closing the token-revocation and bundle-leak gaps.
4. **CRM-6, CRM-8** — cross-account hash isolation and phone normalization.
5. The rest are UX-level and can ride along with normal use.
