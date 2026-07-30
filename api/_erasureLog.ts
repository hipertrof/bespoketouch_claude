// Shared erasure-accountability helper, used by every path that deletes or
// cuts back a guest profile: api/_crmCore.ts (manager forget + consent desk),
// api/_guestCore.ts (kiosk forget, kiosk tier withdrawal, 540-day expiry) and
// api/_checkinCore.ts (the guest's own phone via QR).
//
// Deliberately dependency-free — plain fetch against Supabase REST, mirroring
// the _*Core.ts files. Underscore-prefixed so Vercel bundles it WITHOUT
// turning it into its own route, and relative imports need the explicit .js
// extension (ESM, unbundled).
//
// Why this exists: Art. 17 does not require keeping the erasure, but Art. 5(2)
// requires the CONTROLLER (the spa) to be able to demonstrate the process ran.
// Until now every delete path answered {ok:true} and left nothing behind. See
// supabase/migrations/0030_erasure_log.sql and docs/erasure-policy.md.
//
// Two hard rules for callers:
//   1. Record AFTER the delete/patch succeeds — this attests to something that
//      happened, it is not an intent log.
//   2. A failed record must NEVER block or reverse an erasure. Erasure is the
//      guest's right; the paperwork is the spa's obligation, and the second
//      must not be allowed to defeat the first. Everything here swallows its
//      own errors; recordErasure reports the failure in its return value so a
//      caller can surface `logged: false`.

type Headers = Record<string, string>;

export type ErasureChannel =
  | "dashboard"
  | "consent_desk"
  | "kiosk"
  | "checkin"
  | "retention"
  // A pre-visit intake link (api/_previsitCore.ts). Its own channel rather than
  // borrowing 'checkin': the identity verification is genuinely different — a
  // link that travelled over e-mail plus the phone recorded at booking, versus
  // a code shown on a screen to someone standing in the room.
  | "previsit";

// What was actually erased. "profile" implies the whole CRM footprint, since
// guest_visits / guest_notes / guest_tag_assignments cascade off the row.
export type ErasureScope =
  | "profile"
  | "visits"
  | "notes"
  | "tags"
  | "health"
  | "marketing"
  | "contact";

// Everything a full profile erasure destroys, in one place so the six call
// sites can't drift apart on what they claim.
export const FULL_SCOPE: ErasureScope[] = ["profile", "visits", "notes", "tags", "health", "marketing", "contact"];

// Art. 19: the processors that hold the data and are therefore "recipients"
// told about an erasure. Static because the sub-processor list is static; it
// belongs in the record so the spa can answer the question without asking us.
export const ERASURE_RECIPIENTS = ["supabase (database + auth)", "vercel (serverless compute)"];

export interface ErasureEntry {
  accountId: string;
  // The guest_profiles.phone_hash — NEVER a readable phone number. The whole
  // point of the record is that it proves the erasure without keeping anything
  // legible about the person.
  subjectRef: string;
  channel: ErasureChannel;
  identityVerification: string;
  // For a refusal this is what was REQUESTED and not done, not what was erased.
  scope: ErasureScope[];
  outcome?: "completed" | "partial" | "refused";
  executedBy?: string | null;
  executedByName?: string | null;
  executedBySystem?: string | null;
  retainedUnderExemption?: string | null;
  // Only meaningful with outcome 'refused': why the controller turned the
  // request down. Regulators scrutinise refusals harder than clean erasures,
  // so "declined under Art. 17(3)(b), invoice 2026/114 unpaid" is the answer
  // this column exists to be able to give.
  refusalReason?: string | null;
}

// Best effort. Never throws. Returns false when the record could not be
// written — the caller may surface that, but must not undo the erasure.
export async function recordErasure(base: string, svc: Headers, entry: ErasureEntry): Promise<boolean> {
  if (!entry.accountId || !entry.subjectRef) return false;
  const outcome = entry.outcome ?? "completed";
  // A refused request erased nothing, so two fields that are honest for every
  // other outcome would be lies here: nothing was COMPLETED, and no recipient
  // was notified under Art. 19 because there was nothing to notify them of.
  const refused = outcome === "refused";
  const now = new Date().toISOString();
  try {
    const res = await fetch(`${base}/rest/v1/erasure_log`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        account_id: entry.accountId,
        subject_ref: entry.subjectRef,
        request_channel: entry.channel,
        identity_verification_method: entry.identityVerification,
        scope: entry.scope,
        outcome,
        refusal_reason: entry.refusalReason ?? null,
        retained_under_exemption: entry.retainedUnderExemption ?? null,
        // Stamped server-side, like every consent version — a caller cannot
        // backdate its own compliance.
        completed_at: refused ? null : now,
        executed_by: entry.executedBy ?? null,
        executed_by_name: entry.executedByName ?? null,
        executed_by_system: entry.executedBySystem ?? null,
        recipients_notified: refused ? null : ERASURE_RECIPIENTS,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Do-not-contact list
// ---------------------------------------------------------------------------
// Survives the erasure by design (no FK to guest_profiles), so a spa
// re-importing an old marketing spreadsheet cannot silently resurrect someone
// who objected. Nothing sends messages yet — any future sending path MUST
// check this table first.

export async function suppressContact(
  base: string,
  svc: Headers,
  accountId: string,
  subjectRef: string,
  reason: "erasure" | "marketing_withdrawal",
): Promise<void> {
  if (!accountId || !subjectRef) return;
  try {
    await fetch(`${base}/rest/v1/contact_suppression`, {
      method: "POST",
      headers: {
        ...svc,
        "Content-Type": "application/json",
        // The FIRST objection is the one that counts, so an already-listed
        // person keeps their original date instead of being overwritten by a
        // later erasure. Same option assignTag uses in _crmCore.ts.
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ account_id: accountId, subject_ref: subjectRef, reason }),
    });
  } catch {
    // Non-fatal, same reasoning as recordErasure.
  }
}

// Cleared ONLY by a fresh in-person marketing opt-in at the kiosk or /checkin:
// a new, freely given consent supersedes the earlier objection. Deliberately
// never called from _crmCore — staff cannot re-grant on a guest's behalf, the
// same reason withdrawConsent can only turn a tier OFF.
export async function clearSuppression(
  base: string,
  svc: Headers,
  accountId: string,
  subjectRef: string,
): Promise<void> {
  if (!accountId || !subjectRef) return;
  try {
    await fetch(
      `${base}/rest/v1/contact_suppression?account_id=eq.${accountId}&subject_ref=eq.${subjectRef}`,
      { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } },
    );
  } catch {
    // Non-fatal.
  }
}
