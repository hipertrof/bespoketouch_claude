import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, MapPin } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { useDevice } from "../../context/DeviceContext";
import { toMassageTypes } from "../../lib/catalog";
import { t, tf } from "../../i18n/translations";
import { guestDisplayName } from "../../utils/guestName";
import { buildTreatmentSnapshots, saveIntake } from "../../lib/intakes";
import { forgetGuestProfile, samePhone, saveGuestProfile } from "../../lib/guestProfile";
import { comfortLabelsFor, stripDisabled } from "../../lib/comfort";

export function HandoffStep() {
  const { state } = useGuest();
  const { catalog, loading, comfort } = useCatalog();
  const { token } = useDevice();
  const lang = state.language;
  const isCouple = state.partySize === 2;
  // Offer mapped to the session language, so the recap can name each treatment.
  const massages = useMemo(() => toMassageTypes(catalog, lang), [catalog, lang]);

  // Persist the locked intake once, in the background. This is the "lock" point:
  // the guest has finished and handed the tablet back. Only a paired device can
  // write — the server derives the location from the token, and the bundled demo
  // has no token and nowhere to write. The ref makes it fire exactly once even
  // under StrictMode's double-effect.
  // Opt-in guest CRM first, THEN the intake — sequenced deliberately: the
  // intake endpoint keys guest_visits history rows off EXISTING guest_profiles,
  // so a brand-new consenting guest's profile must land before the intake does.
  //
  // CRM semantics (unchanged from 0024, plus the marketing tier from
  // 0025/0026 — storing name/contact and permission to use it, merged into
  // one toggle):
  //   * consent on               → save (healthConsent=false strips + erases
  //     stored notes; identity sent only when marketing was opted in AND a
  //     name was typed);
  //   * prefilled + consent off  → withdrawal, erase the profile (art. 7(3));
  //   * never-prefilled + off    → no-op (an unticked toggle must not delete a
  //     profile that was never loaded — shared phone, typo).
  // CRM failures are logged, not surfaced — the upsert is idempotent and a lost
  // preference save is only cosmetic; the intake still proceeds.
  const savedRef = useRef(false);
  const [saveError, setSaveError] = useState(false);
  // Surfaced so staff know the intake actually landed before they refresh the
  // tablet for the next guest — refreshing mid-save aborts the request and
  // there is no draft to recover.
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (savedRef.current || loading || !token) return;
    savedRef.current = true;
    const size = state.partySize;

    // Last line of defence for two guests on one number. Both screens that take
    // a phone already stop it, but if one ever gets through, these writes run
    // concurrently against a single identity and whichever landed last decided
    // whose preferences survived. First guest wins, deterministically.
    const claimedPhones: string[] = [];
    const crmOps = state.guestCrm.slice(0, size).flatMap((crm, i) => {
      if (crm.phone.replace(/\D/g, "").length < 6) return [];
      if (claimedPhones.some((p) => samePhone(p, crm.phone))) return [];
      claimedPhones.push(crm.phone);
      if (crm.consent) {
        // The name is base-tier, so it saves with the profile; only the
        // contact e-mail waits on the marketing opt-in.
        const contact = crm.marketingConsent
          ? { email: crm.email.trim() || undefined }
          : undefined;
        return [
          saveGuestProfile(
            token,
            crm.phone,
            state.guests[i],
            crm.healthConsent,
            comfort,
            crm.name,
            contact,
          ),
        ];
      }
      // The name says WHICH profile on this number to erase (0032). Without it
      // the server matches nothing, rather than erasing everyone sharing it.
      if (crm.prefilled) return [forgetGuestProfile(token, crm.phone, crm.name)];
      return [];
    });

    Promise.allSettled(crmOps)
      .then((results) => {
        for (const r of results) {
          if (r.status === "rejected") console.error("[crm] save/forget failed:", r.reason);
        }
        return saveIntake({
          deviceToken: token,
          partySize: size,
          guestNames: state.guestNames.slice(0, size).map((n) => n.trim()),
          treatmentSelections: buildTreatmentSnapshots(
            state.treatmentSelections.slice(0, size),
            size,
            catalog,
          ),
          // Comfort features this location doesn't offer are dropped, and the
          // three id-valued ones get a Polish label snapshot alongside — same
          // rule as the therapist/room name snapshots, so an archived intake
          // still reads correctly after the manager edits the option list.
          personalizations: state.guests.slice(0, size).map((g) => {
            const preferences = stripDisabled(g.preferences, comfort);
            const comfortLabels = comfortLabelsFor(preferences, comfort);
            return { ...g, preferences, comfortLabels };
          }),
          therapists: state.guestTherapists.slice(0, size),
          roomAssignments: state.guestRooms.slice(0, size),
          // Only consenting guests get a visit-history row; others send null.
          guestPhones: state.guestCrm
            .slice(0, size)
            .map((crm) =>
              crm.consent && crm.phone.replace(/\D/g, "").length >= 6 ? crm.phone : null,
            ),
          // Index-aligned with guestPhones. Since 0032 the phone alone no
          // longer identifies a profile, so the server needs the name the
          // profile was saved under to file this visit against the right
          // person instead of whoever it happened to find first.
          guestCrmNames: state.guestCrm.slice(0, size).map((crm) => crm.name.trim()),
        }).then(() => {
          setSaved(true);
          // A failed attempt clears savedRef so a later render retries; if that
          // retry lands, the stale error has to go with it or staff would see a
          // save that succeeded still reading as failed.
          setSaveError(false);
        });
      })
      .catch((err) => {
        console.error("[intake] save failed:", err);
        savedRef.current = false; // allow a retry on the next render
        setSaveError(true);
      });
  }, [loading, token, catalog, comfort, state]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
        <CheckCircle2 size={40} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        {tf("thanksName", lang, { name: guestDisplayName(state.guestNames, state.partySize, lang) })}
      </h1>
      <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
        {isCouple ? t("prefsSavedCouple", lang) : t("prefsSavedSingle", lang)}{" "}
        {t("passTablet", lang)}
      </p>

      {/* Recap of what was captured — the step is named "Podsumowanie" but only
          showed a thank-you; this lets guest and front-desk confirm the picks
          before the tablet changes hands. */}
      <div className="mt-8 w-full max-w-md rounded-2xl border border-sand bg-white/70 p-5 text-left shadow-soft">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-light">
          {t("stepSummary", lang)}
        </p>
        <ul className="flex flex-col gap-3">
          {Array.from({ length: state.partySize }).map((_, i) => {
            const sel = state.treatmentSelections[i];
            const treatment = massages.find((m) => m.id === sel?.treatmentId);
            const minutes = sel?.treatmentMinutes;
            const zoneCount = Object.values(state.guests[i]?.zones ?? {}).filter(Boolean).length;
            return (
              <li key={i} className="flex flex-col gap-0.5">
                {isCouple && (
                  <span className="text-sm font-semibold text-charcoal">
                    {state.guestNames[i]?.trim() || `${t("person", lang)} ${i + 1}`}
                  </span>
                )}
                <span className="text-sm text-charcoal">
                  {treatment?.name ?? "—"}
                  {minutes ? ` · ${minutes} min` : ""}
                </span>
                {zoneCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-light">
                    <MapPin size={13} />
                    {zoneCount}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {saved && !saveError && (
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-sage-dark">
          <Check size={14} strokeWidth={2.5} />
          {t("intakeSaved", lang)}
        </p>
      )}

      {saveError && (
        <p className="mt-6 max-w-md text-sm text-rose-dark">{t("intakeSaveFailed", lang)}</p>
      )}
    </div>
  );
}
