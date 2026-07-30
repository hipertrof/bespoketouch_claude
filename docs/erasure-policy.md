# Erasure policy — BespokeTouch

How a guest's data is deleted, what is kept afterwards and why, and what the spa can show a regulator.

Written position as of migration `0030`. Companion to the code in `api/_erasureLog.ts`,
`api/_crmCore.ts`, `api/_guestCore.ts` and `api/_checkinCore.ts`.

---

## 1. Who is responsible for what

The **spa is the controller**. It decides what guest data is collected and what happens to it, and it is
the one a guest or the Polish data protection authority (UODO) contacts.

**BespokeTouch is the processor.** It stores and handles the data on the spa's behalf and acts on the
spa's instructions. It does not decide what the data is used for.

Two consequences run through everything below:

- The erasure record belongs to the **tenant**, not to us. `erasure_log.account_id` is the spa, and the
  record cascades away if the spa's account is deleted.
- Because the spa must be able to answer for the erasure, the record captures **who at the spa started
  it** (`executed_by`, `executed_by_name`), not only that it happened.

The processing agreement between the spa and BespokeTouch should state the response deadline (section 5)
and name the sub-processors (section 5).

---

## 2. What is erased, and by which route

Six paths delete or cut back a guest record. All six now write to `erasure_log`.

| Route | Started by | What goes | Recorded as |
|---|---|---|---|
| "Zapomnij gościa" on `/guests` | A manager, guest name typed to confirm | The whole profile | `channel='dashboard'` |
| Consent desk, base consent withdrawn | Reception, on a phone call | The whole profile | `channel='consent_desk'` |
| Consent desk, health or marketing withdrawn | Reception, on a phone call | Only that tier | `consent_desk`, `outcome='partial'` |
| Kiosk "forget", or a consent un-ticked at handoff | The guest, in person on the tablet | Whole profile, or one tier | `channel='kiosk'` |
| QR page on the guest's own phone | The guest, using a one-time code | Whole profile, or one tier | `channel='checkin'` |
| 540 days without a visit | Nobody — automatic | The whole profile | `channel='retention'` |

A seventh route erases nothing: a request the spa **refuses** (section 7) is recorded from the guest panel
or the consent desk as `outcome='refused'`, leaving the guest's data untouched.

Deleting the profile deletes everything hanging off it: visit history, staff notes and tag assignments all
cascade. Survey answers survive but lose their link to the person, so they revert to anonymous rather than
being destroyed.

**Withdrawing a consent erases the data that consent covered.** Turning off health consent deletes the
marked body zones and every note about them. Turning off marketing consent deletes the phone number,
e-mail and birthday. This is not a flag that hides the data — the columns are emptied.

---

## 3. What the erasure record holds, and what it deliberately does not

Article 17 does not ask the spa to keep the deletion itself. Article 5(2) — accountability — asks the spa
to be able to **show** that a request arrived, that the person was identified, and that it was carried out.
A minimal, separate record is the expected design. What must be avoided is a "deletion log" that quietly
keeps the profile alive under another name.

**Held** (`public.erasure_log`, one row per erasure):

- `subject_ref` — the phone number run through a one-way scrambler with a secret key. It can be matched
  but never read back. This is the same `phone_hash` the product already uses as its guest identifier.
- when the request arrived, and through which route
- how the person's identity was checked
- what was erased (`scope`), and whether it was complete or partial
- when it was done, by whom, or by which automatic process
- any legal reason something had to be kept (`retained_under_exemption`)
- which outside companies were told (`recipients_notified`)

**Not held:** no name, no e-mail, no readable phone number, no treatment, no notes, no body zones, no
prices. Nothing about the person survives in a form anyone can read.

When a guest comes back six months later and asks whether they were deleted, the spa takes the number they
give, scrambles it the same way, and finds the record. Confirmation without retention.

The table is **append-only**: a database rule blocks any edit to a row once written. A record that can be
altered afterwards proves nothing. Rows can still be deleted, by exactly two things — the retention job
below, and removing the spa's whole account.

### Reading it back: the register on `/guests`

The record is only useful if the spa can produce it without asking us. "Rejestr usunięć" at the top of
`/guests` (managers and owners only) opens the whole account's history, filterable by date range, by
outcome, and by one person's phone number, with a CSV download of exactly what is on screen.

**The register stays pseudonymous, and that is the point.** Each row identifies the person only by a
shortened form of the same one-way scramble the product uses everywhere. No name, no number, no address —
nothing that can be read back into a person. Article 5(2) asks the spa to show the *process* ran; it does
not ask for a readable list of everyone who asked to be deleted, and Art. 5(1)(c) minimisation and Art. 32
pseudonymisation both point the other way. A "deletion log" that quietly rebuilt the guest list would be
the failure mode, not the goal.

So the register answers the two questions that actually get asked:

- *"Show us how you handled erasure requests last quarter."* Set the dates, download the CSV.
- *"This person says you ignored their request."* Type their number into the register. It is scrambled on
  the server and matched against the record. Nothing readable is stored, and nothing readable is needed.

The search is the same mechanism promised in section 3 for a returning guest asking whether they were
deleted. Front desk cannot reach the register — the consent desk exists so a receptionist can act on one
caller, whereas the register is the whole account's compliance history and answers to the regulator, which
is the owner's responsibility.

### Why the record itself is lawful, and for how long

The scrambled number is still personal data, so the record needs its own justification and its own end
date:

- **Basis:** legal obligation and legitimate interest — being able to demonstrate compliance (Art. 6(1)(c)
  and (f), read with Art. 5(2)). Add it to the spa's record of processing activities as a separate entry.
- **Retention: 3 years.** This matches the window in which a complaint or claim about the erasure can
  realistically be brought. A nightly job (`erasure-log-purge`) deletes anything older.

---

## 4. Backups

Backups cannot be edited one guest at a time, and no honest policy pretends otherwise. The position is:

- Snapshots are **not** amended for an individual erasure.
- They **expire on a fixed 30-day cycle**, so an erased guest is gone from every backup within 30 days.
- If a backup is ever restored, the erasure is **applied again automatically** as part of the restore.
- Restored data is **not used** in the meantime.

**Tell the guest this in writing when confirming their erasure.** Saying nothing about backups is what gets
flagged in an audit. Suggested wording:

> Your data has been deleted from our live systems. Encrypted backups are not edited individually; they are
> replaced on a rolling 30-day cycle, so your data disappears from them within 30 days at the latest. If a
> backup ever has to be restored, your deletion is applied again as part of that restore, and the data is
> not used in the meantime.

---

## 5. Deadline, and the companies that hold the data

- **Response deadline: 30 days** from the request (Art. 12(3)), extendable by two months for genuinely
  complex cases, with the guest told inside the first 30 days.
- **Sub-processors** — the companies that actually hold guest data:
  - **Supabase** — the database and login system, where everything is stored.
  - **Vercel** — the servers that run the code. Data passes through them; nothing is stored there.

  Both are named in `erasure_log.recipients_notified` on every erasure. Erasure reaches both immediately:
  the delete runs against the live database and Vercel keeps no copy.
- **DeepL** is used for translating menu text only. No guest data is sent to it, so it is not a recipient
  for erasure purposes.

---

## 6. Health information

Marked body zones and any notes about them are **special-category health data** (Art. 9). They need
explicit consent, they raise the bar for a data protection impact assessment, and deletion has to reach
every copy.

They exist in two places:

1. `guest_profiles.preferences` — the remembered profile. Stored only under a separate health consent,
   erased the moment that consent is withdrawn, and stripped again on the way out as a second line of
   defence.
2. `intakes.personalizations` — the copy the therapist reads. Migration `0018` already blanks the zones and
   both note fields the moment a visit is marked done, and an hourly job forces any visit still open after
   24 hours to done, which triggers the same wipe. So this copy is short-lived by construction.

### Open item: the tablet's own browser cache

The kiosk tablets run Fully Kiosk. The app's own memory is cleared by a page refresh — the whole intake
lives in memory with no saving to disk, so a refresh is a clean reset. **The browser layer underneath it
has never been checked.** A WebView can hold its own cache of what was typed and displayed, and that is
exactly the kind of copy a deletion routine misses.

Needed: confirm what Fully Kiosk's WebView caches, and set it to clear on handoff or on a fixed interval.
Until that is done and written up, the claim "deletion reaches every copy" is not fully evidenced for the
tablets.

---

## 7. What the spa may have to keep anyway

Article 17(3)(b) lets a controller refuse erasure where another law requires keeping the data. In Poland
the common case is an invoice: it must be kept for **5 years from the end of the year the tax was due**.

The correct handling is not "wipe everything" — it is **erase the guest record, restrict the accounting
record**: keep the invoice, stop using it for anything else.

**BespokeTouch stores no invoices and no accounting records**, so nothing inside this product moves into
restricted processing today. Invoices live in the spa's own accounting system, and whether to keep one is
the spa's call as controller. When the spa makes that call, it is recorded in
`erasure_log.retained_under_exemption` alongside the erasure of everything else.

### Requests that are refused or only partly met

Regulators pay more attention to these than to clean ones. "We declined it on 4 March under Art. 17(3)(b)
because of an outstanding invoice" is a far better answer than "we have no record of that request".

A refusal is recorded from the same two screens the erasure itself runs from: the guest panel on `/guests`
for a manager, and the consent desk for reception. Nothing about the guest changes — the form writes one
`erasure_log` row with `outcome='refused'`, the free-text explanation in `refusal_reason`, and the legal
ground in `retained_under_exemption`, chosen from a closed list:

| Ground | Recorded as |
|---|---|
| An invoice or other legal retention duty | Art. 17(3)(b) |
| A claim being brought or defended | Art. 17(3)(e) |
| An ongoing contract or booking | Art. 17(1)(a) not met |
| Anything else | Controller decision, see `refusal_reason` |

Because nothing was erased, two fields are deliberately left empty on these rows: `completed_at` (nothing
completed) and `recipients_notified` (no processor was told, because there was nothing to tell them). The
`scope` records what was **asked for** and not done.

**Only a full erasure can be refused.** Withdrawing health or marketing consent is Art. 7(3) — withdrawal
must be as easy as granting it, and there is no ground to decline — so the form has no per-tier option. A
spa refusing the profile while honouring a marketing withdrawal does both, and gets two records.

**One thing the app still cannot do: tell the guest.** Art. 12(4) requires informing them within a month
that the request was refused, and of their right to complain to UODO and to go to court. BespokeTouch sends
no messages, so this is on the spa. The form says so on screen rather than leaving it implied.

---

## 8. Reporting figures survive

Deleting a guest must not cost the spa its business figures. Aggregates are **anonymised, not deleted**.

Immediately before a guest record is deleted, a database rule folds that guest's visits into
`public.visit_stats`: a count and a revenue total per month, per location, per treatment. No guest, no
date finer than the month, no therapist, no identifiers. "This treatment was booked 40 times in March"
survives; the link to any individual is gone and cannot be rebuilt. Once nobody can be identified from a
figure, it is no longer personal data and falls outside GDPR entirely.

Survey answers keep the same principle: erasing a guest sets the response's guest link to empty, so the
rating still counts towards the spa's averages as an anonymous answer.

---

## 9. The do-not-contact list

`public.contact_suppression` holds one thing: the scrambled phone number of someone who was erased or who
withdrew marketing consent. No name, no readable number — you cannot read a number out of it, only check a
number you already have against it.

It is **deliberately not linked to the guest record**, so deleting the guest does not delete it. Without
this, a spa importing an old marketing spreadsheet next month silently brings back the person who asked to
be left alone, and contacts them again.

- **No end date.** Purging this list would defeat its entire purpose. It is kept for as long as the spa's
  account exists.
- **Removed only by the person themselves**, giving fresh marketing consent in person at the kiosk or on
  their own phone via the QR page. A new, freely given consent overrides the earlier objection. Staff can
  never clear it — the same reason the consent desk can only turn consent off, never on.

**Nothing sends messages yet.** When a messaging feature is built, checking this list before sending is
mandatory, and that check is the reason the list exists now rather than later.

---

## 10. What is not built yet

Stated plainly so none of it reads as an oversight:

- **No outbound message to the guest.** Neither an erasure confirmation nor a refusal notice is sent from
  the product; both are the spa's job today (sections 4 and 7).
- **No per-recipient notification record.** `recipients_notified` names the sub-processors, but if the spa
  ever adds one of its own (a mailing tool, an accounting integration), nothing tracks whether *it* was
  told. Not a gap today, because there are no such recipients.
- **The Fully Kiosk cache has not been audited** (section 6).
