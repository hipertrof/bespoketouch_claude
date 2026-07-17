# BespokeTouch — step-by-step test script (Claude Code desktop app, no CLI)

Companion to [TEST-PLAN.md](TEST-PLAN.md) (the catalogue). This is the **executable version**: every step is marked

- **👤 YOU** — you click/type it (Browser pane, your own browser, or the Supabase dashboard's SQL editor — all GUI, no terminal).
- **🤖 CLAUDE** — say the quoted phrase and Claude does it (drives the pane, runs the HTTP probes itself, checks results).

**Key insight: a "kiosk" is just a browser window at `/`.** The Browser pane or a second window of your own browser can be the tablet. No hardware needed for anything except optionally touching a real tablet at the very end.

**Ground rules**

- Test in prod (https://bespoketouch.vercel.app) — no real clients yet, so no risk. Keep destructive actions on the `ZZZ Test` account anyway; it's the habit that matters once clients exist.
- Claude **cannot type your passwords** — every login is a 👤 step in the pane.
- Claude runs all HTTP probes (the old "curl" cases) itself via its own tools — those whole sections are one sentence from you.

---

## Session 0 — one-time fixtures (~15 min)

Everything later assumes these exist.

1. 👤 Log into the pane as yourself (platform admin). Ask 🤖 *"open /admin"* first if the pane is closed.
2. 👤 In `/admin`, confirm **ZZZ Test** exists (slots `1`) with location **ZZZ Lokalizacja**. Create them if missing.
3. 👤 `/admin` → ZZZ Test → set **Koniec** = *(today + 60 days)* so billing banners stay quiet during unrelated tests.
4. 👤 `/manage` → location **ZZZ Lokalizacja** → if it has no services, click the import-default-catalogue action (or create one service "Masaż testowy", 60 min, 200 zł, Aktywna).
5. 👤 `/staff` → account **ZZZ Test** → add two members **using real inboxes you own** (Gmail `+` aliases work: `jakub.dobies+manager@gmail.com`, `jakub.dobies+therapist@gmail.com`):
   - role **Manager**, no location
   - role **Terapeuta**, location ZZZ Lokalizacja
   For each: copy the invite link shown, open it in a private window, set a password. These two logins are reused everywhere below.
6. 👤 Keep your own **Manager** membership on ZZZ Test from the Phase 5 test (re-add via `/staff` if you removed it).
7. 🤖 *"Session 0 done, verify fixtures"* — Claude reads `/staff` and `/kiosks` in the pane and confirms the roster and empty slot state.

---

## Session 1 — security probes, fully automated (~5 min of your time)

1. 🤖 *"Run the security probe suite"* — Claude executes, with no action from you:
   - **SEC-1/2/3**: POST `/api/intake`, `/api/guest`, `/api/survey` with missing and junk device tokens → expect 401 each.
   - **SEC-5/6**: anon REST reads+writes on `intakes` and `survey_responses` → expect permission denied.
   - **READ-1/2**: anon reads of active `services` and the `kiosk_*` RPCs → expect 200 (the deliberate public menu).
   - **READ-4**: anon reads on `accounts`, `memberships`, `guest_profiles`, `slots`, `tokens`, `pair_codes` → expect denied/empty for every one.
   - **SEC-8**: fetch the prod JS bundle and search it for the service-role key prefix and `GUEST_HASH_SECRET` → expect absent.
2. 👤 Read Claude's pass/fail table. Anything red stops the session — it's a live security hole.

---

## Session 2 — pairing lifecycle in the pane (~25 min)

The pane plays the manager; **a second window of your own browser plays the tablet** (keep them side by side).

**PAIR-1 — fresh kiosk is gated**
1. 👤 In your own browser, open a **private/incognito window** at the prod URL. → Expect the activation screen (Aktywuj to urządzenie), not the intake flow.

**PAIR-2 — happy path**
2. 👤 Pane: log in as `+manager` → 🤖 *"open /kiosks, location ZZZ Lokalizacja"*.
3. 👤 Type device name `Tablet A` → **Dodaj kiosk**. A 6-digit code appears.
4. 👤 Type that code into the incognito "tablet". → Expect it unlocks straight into the ZZZ welcome screen.
5. 🤖 *"verify pairing"* — Claude reloads `/kiosks` in the pane: row `Tablet A` = **Sparowany**, `Wykorzystane stanowiska: 1 / 1`.

**PAIR-3 — wrong code**: 👤 open a second incognito window, enter `000000`. → Expect "Nieprawidłowy lub wygasły kod", still gated.

**PAIR-6 — reload persistence**: 👤 reload the paired tablet window. → Expect still paired (no activation screen).

**CAP-1 — hard cap**: 🤖 *"check the add-kiosk form"* — with 1/1 used, expect the add control disabled + "Osiągnięto limit…" message.

**CAP-2 — cap raise unlocks**: 👤 your own browser (admin session) → `/admin` → ZZZ Test → Stanowiska `2` → Zapisz. 🤖 *"reload /kiosks"* → add re-enabled. Then set it back to `1`? **No — leave at 2**, Session 3 needs a second slot later. Actually leave at **2** permanently; note it.

**PAIR-8 — re-pair rate limit**: 👤 on `Tablet A`'s row click **Sparuj ponownie** twice in quick succession. → Second click: "Zbyt szybko…" (the 60 s cooldown). Wait 60 s.

**PAIR-7 — re-pair revokes the old token**
6. 👤 After the cooldown: **Sparuj ponownie** on `Tablet A` → new code → enter it in a **new** incognito window ("tablet B").
7. 👤 Reload the ORIGINAL tablet window. → Expect it falls back to the activation screen (old token revoked), and 🤖 *"verify"* — still `1 / 2` used, no extra slot.

**PAIR-4 — expired code**: 👤 mint a code (Sparuj ponownie), **note it, don't use it**, set a 16-minute timer, do Session 3 meanwhile, then enter it. → Expect invalid/expired (codes live 15 min).

**PAIR-5 — code reuse**: 👤 after pairing with a code once, enter the same code in another incognito window. → Expect rejected (single-use).

**PAIR-9 — revoke**: do this **last, in Session 6 cleanup** (the paired tablet is needed until then).

**SEC-9 — `?location=` stays dead**: 👤 in a fresh incognito window open `/?location=<uuid of ZZZ Lokalizacja>` (🤖 *"give me the ZZZ location uuid"* if needed). → Expect activation screen; param ignored.

**SEC-10 — `?demo`**: 👤 open `/?demo`. → Expect the demo catalogue loads with no pairing; complete an intake — the final save must fail gracefully / write nothing (🤖 *"confirm no ZZZ intake row appeared"*).

---

## Session 3 — guest intake + CRM on the paired "tablet" (~30 min)

Use the paired tablet window from Session 2. Pane stays logged in as `+manager`.

**FLOW-1/3 — full happy path with body map**
1. 👤 Tablet: walk the whole flow — pick the test service, mark 2–3 body zones front + back with different intensities, pick pressure/oil/music, add a free-text note "test uwaga — proszę mocniej na barki", finish to the handoff screen.
2. 👤 Pane (or 🤖 *"open /queue for ZZZ"*): the intake card appears with the same zones, intensities, preferences. FLOW-1 ✅ FLOW-3 ✅.

**FLOW-7 — retention stamp**: 👤 Supabase dashboard → SQL editor:
```sql
select status, expires_at, created_at from intakes order by created_at desc limit 1;
```
→ `expires_at` ≈ `created_at + 48 h`; status is the server-pinned initial value.

**QUE-2 — therapist assignment**: 👤 in `/queue`, assign therapist `+therapist` to the guest. Reload. → Assignment persists.

**FLOW-6 — kiosk reset**: 👤 tablet returned to welcome after handoff; no trace of the previous guest on screen.

**FLOW-4 — party of 2**: 👤 run the flow again choosing 2 guests; complete both. → Both land in `/queue`, separately and correctly.

**FLOW-5 — back-navigation**: 👤 start a flow, answer, go back, change answers, finish. → Queue card shows the **edited** values only.

**CRM-1/3/4 — consent save + the two GDPR guarantees**
3. 👤 Run the flow once more: enter phone `+48 601 234 567`, **tick the consent box**, include zone notes and a general note, finish.
4. 👤 SQL editor:
```sql
select phone_hash, preferences, consent_version, consent_at
from guest_profiles order by created_at desc limit 1;
```
→ CRM-1: row exists, consent fields stamped. CRM-3: `phone_hash` is a hex blob — confirm `601` appears **nowhere**. CRM-4 (**the critical one**): read `preferences` fully — structured prefs only, **no zoneNotes / generalNote / any free text**.

**CRM-5 — return-visit prefill**: 👤 new flow on the tablet, enter the **same phone**. → Preferences prefill.

**CRM-8 — normalization**: 👤 same but type it as `48601234567` (no +, no spaces). → Same profile found.

**CRM-2 — no consent, no save**: 👤 flow with a NEW phone `+48 602 000 000`, consent **unticked**. 👤 SQL: `select count(*) from guest_profiles;` → count unchanged.

**CRM-7 — forget**: 👤 trigger the forget/erase action for `601 234 567`, then re-run the lookup flow. → No prefill; SQL count dropped by one.

**I18N-3 — kiosk language is per-session**: 👤 switch the tablet to Українська, finish an intake. → Next guest's welcome is back to default; the pane's staff language untouched.

**FLOW-2 — languages**: 👤 walk one full intake in `uk`, and welcome-screen-spot-check the remaining five (`it fr de es id`). → No Polish leaking through, no `missing key` strings. (🤖 *"screenshot each welcome"* can speed this up.)

**FLOW-8 — note translation**: 👤 log into the pane as `+therapist`… wait — therapist home is `/queue`. Switch dashboard language to English and open the intake with the Polish note. → Translated note appears (needs `DEEPL_API_KEY` in Vercel; if it doesn't, that's a Vercel env finding, not a code bug).

---

## Session 4 — survey + reports, closing the known-open E2E (~25 min)

Prereq: Session 3 left visits in the queue assigned to `+therapist`.

**SUR-1 — the deferred E2E, finally**
1. 👤 Tablet window: go to `/survey`. Front-desk picker appears (device-token gated).
2. 👤 Pick today's visit (the one assigned to `+therapist`), hand to "guest": answer all 6 questions with **memorable values** — e.g. overall 5, NPS 9 — and submit. → Thank-you screen.
3. 👤 Pane as `+manager` → 🤖 *"open /reports"* → the response is there, linked to the right therapist and treatment. **SUR-1 ✅ — the roadmap's open item closes here.**

**SUR-3 — no repeat**: 👤 `/survey` again → the surveyed visit is **absent** from the picker. 🤖 *"replay the survey submit for that visit"* — Claude re-POSTs it → expect 409 "already surveyed".

**SUR-2 — all skippable**: 👤 survey another visit skipping every question. → Accepted; `/reports` counts it without crashing on nulls.

**SUR-4 — NPS bounds**: 🤖 *"probe NPS 11"* — Claude submits `nps: 11` with the real token → expect DB check-constraint rejection.

**SUR-5 — languages**: 👤 spot-check the survey screens in 2–3 languages.

**SUR-6 — demo can't submit**: 🤖 *"verify /survey?demo"* — renders, submit fails without a token.

**REP-1 — aggregate math**: submit 3 surveys with NPS 9, 6, 10 (one promoter ≥9 ×2, one passive 7–8 ×0, one detractor ≤6 ×1 → NPS = 2/3 − 1/3 ≈ **+33**). 👤 check `/reports` shows the same. CSAT: your overall answers' mean.

**REP-2/3**: 👤 assign a second therapist to a visit, survey it, check the per-therapist split; toggle 7/30/90 days.

**REP-4 — therapist sees NOTHING (the RLS promise)**
4. 👤 Private window: log in as `+therapist`, open `/reports` directly. → Redirected away.
5. 🤖 *"probe survey_responses as the therapist"* — you paste nothing; Claude asks the therapist login to be typed into the pane once, then reads `supabase.auth` session from the page and queries `survey_responses` with that JWT via the page's own client → expect **zero rows** (whole-table `can_manage_location` RLS). **REP-4 ✅.**

---

## Session 5 — RBAC + tenant isolation (~30 min)

The systematic pass the security model never had. Two halves.

**Route gating (STAFF-7/8/9)** — 👤 in a private window per role:
- `+therapist` login → lands on `/queue`; then manually open `/manage`, `/kiosks`, `/staff`, `/reports`, `/admin` → **all redirect away**.
- `+manager` login → lands manager-side; `/admin` → "no platform-admin rights" screen.
- Your admin login → `/admin` works.

**RLS via the page's own client (RLS-1…8)** — no CLI: Claude runs REST queries **through the signed-in pane** (the page's Supabase client carries the JWT).
1. 👤 Pane: log in as `+manager` (member of ZZZ Test only).
2. 🤖 *"run the RLS isolation suite"* — Claude, via the page:
   - reads `accounts`, `locations`, `services`, `intakes`, `guest_profiles`, `slots`, `tokens` → expect **only ZZZ rows**, never Nusa/Thai Bali.
   - reads `pair_codes` → expect denied (service-role only).
   - UPDATE own account's `slots_paid` → 99 → expect denied (`accounts_admin_write`).
   - INSERT a service into a Nusa Spa location → expect denied.
   - INSERT a membership granting self owner on Nusa Spa → expect denied.
3. 👤 Read the pass/fail table. Any leak = stop, fix before Stripe.

**STAFF-3/4**: 👤 as `+manager` in `/staff`: add `+therapist` again (→ no duplicate, "already a member" path), try to create a role **Właściciel** (→ rejected — only platform admin makes owners).

---

## Session 6 — billing regression + cleanup (~15 min)

**SOFT-1…9 regression** (already ✅ once — re-run only if `billing.ts`/`SubscriptionBanner` change): the full walkthrough lives in the Phase 5 section of TEST-PLAN.md; the pane flow is: `/admin` date flips → chip; `+manager` pane login → banner on 4 dashboards, absent on `/queue`/kiosk; lapsed = no dismiss; date change re-arms.

**SOFT-3 kiosk half**: 👤 with ZZZ lapsed (`Koniec` = yesterday), look at the paired tablet → **no banner anywhere in the guest flow**; and **SOFT-4**: complete a live check-in on it → works. Restore the date after.

**SOFT-8**: 👤 `+therapist` pane login while ZZZ is lapsed → `/queue` → no banner.

**SEC-7 — revoked token is dead**: 🤖 *"capture the tablet's device token"* (from the paired window via the pane is not possible — so: 👤 on the tablet window, F12 → Application → Local Storage → copy `bt_device_token` and paste it to Claude — it's a disposable test token). Then 👤 revoke `Tablet A` in `/kiosks` (**PAIR-9 ✅**) and 🤖 replays an intake POST with the dead token → expect 401.

**Cleanup**
- 👤 `/kiosks`: revoke any remaining ZZZ slots.
- 👤 SQL editor: `delete from guest_profiles where ...` ZZZ rows; same for test `intakes`/`survey_responses` if you want zeroes (or let the 48 h expiry clear intakes).
- 👤 `/staff`: keep or remove the `+manager`/`+therapist` members — **keep them**; every future test session reuses them.
- 👤 `/admin`: ZZZ Test back to Stanowiska `1`, Koniec = +60 days.

---

## Coverage map

| Session | Closes | Time |
|---|---|---|
| 0 | fixtures | 15 min |
| 1 | SEC-1/2/3/5/6/8, READ-1/2/4 | 5 min |
| 2 | PAIR-1…8, CAP-1/2, SEC-9/10 | 25 min |
| 3 | FLOW-1…8, CRM-1…8, QUE-2, I18N-3 | 30 min |
| 4 | SUR-1…6, REP-1…4 ← **both roadmap-open items** | 25 min |
| 5 | STAFF-3/4/7/8/9, RLS-1…8 | 30 min |
| 6 | SOFT kiosk half, SEC-7, PAIR-9, cleanup | 15 min |

Not covered desktop-only: nothing. A real tablet adds only touch-ergonomics confidence (optional re-run of Session 3 on hardware). Remaining ⬜ after all six: CRM-6 (needs a second *paired* account — do it whenever a second test account gets a kiosk), READ-3, QUE-3/4, CMS-2/4, REP-5, I18N-4 — all listed in TEST-PLAN.md and none blocking.

Update TEST-PLAN.md statuses as sessions complete — tell Claude *"mark session N done"* and it will edit the catalogue.
