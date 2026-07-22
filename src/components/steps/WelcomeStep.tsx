import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ClipboardCheck, HeartHandshake, QrCode, Search, Sparkles, Trash2, UserRound, Users } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { useDevice } from "../../context/DeviceContext";
import {
  applyStoredPreferences,
  forgetGuestProfile,
  lookupGuestProfile,
} from "../../lib/guestProfile";
import { t, tf } from "../../i18n/translations";
import { Button } from "../Button";
import { Toggle } from "../Toggle";
import { CheckinQrModal } from "./CheckinQrModal";
import type { BodyGender, PartySize } from "../../types";

const partySizeOptions: { value: PartySize; labelKey: string }[] = [
  { value: 1, labelKey: "partyOne" },
  { value: 2, labelKey: "partyTwo" },
];

// First half of the kiosk check-in: who is visiting (party size, names,
// gender, therapist, returning-guest lookup) plus the couple "different
// treatments" toggle. Treatment + duration selection happens on the next step
// (TreatmentStep), so this screen stays a short, single-purpose form.
export function WelcomeStep() {
  const { state, dispatch } = useGuest();
  const { locationInfo, therapists } = useCatalog();
  const { token } = useDevice();
  const lang = state.language;
  const isCouple = state.partySize === 2;

  const namesFilled = state.guestNames
    .slice(0, state.partySize)
    .every((n) => n.trim().length > 0);
  // Therapist choice is mandatory whenever the location has therapists to pick.
  const therapistsFilled =
    therapists.length === 0 ||
    state.guestTherapists.slice(0, state.partySize).every((tp) => tp?.id);
  const canContinue = namesFilled && therapistsFilled;

  const handleContinue = () => {
    state.guestNames.slice(0, state.partySize).forEach((n, i) => {
      dispatch({ type: "SET_GUEST_NAME", index: i, name: n.trim() });
    });
    dispatch({ type: "SET_STEP", step: "treatment" });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mb-10 flex flex-col items-start gap-3 sm:mb-10">
        <div className="flex w-full items-start justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sage-dark">
            <Sparkles size={12} />
            {t("checkInBadge", lang)}
          </span>
          {/* Checkout mode, for front-desk. Only on a paired kiosk — the survey
              writes need the device token, so offering it in the demo would
              dead-end. Labelled in the staff language (pl), not the guest's:
              this button is for the receptionist, not the person checking in. */}
          {token && (
            <Link
              to="/survey"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sage-dark hover:underline"
            >
              <ClipboardCheck size={15} />
              {t("surveyStart", "pl")}
            </Link>
          )}
        </div>
        {locationInfo && (
          <h1 className="font-serif text-3xl text-charcoal sm:text-4xl">
            {tf("welcomeAt", lang, {
              name: `${locationInfo.accountName} ${locationInfo.locationName}`,
            })}
          </h1>
        )}
      </div>

      <div className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-charcoal">
          <Users size={16} className="text-slate-light" />
          {t("partySize", lang)}
        </h2>
        <div className="inline-flex rounded-full border border-sand bg-white p-1 shadow-soft">
          {partySizeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => dispatch({ type: "SET_PARTY_SIZE", partySize: opt.value })}
              className={`min-h-12 rounded-full px-6 text-sm font-semibold transition-all duration-300 ${
                state.partySize === opt.value
                  ? "bg-clay text-white shadow-soft"
                  : "text-slate hover:bg-oatmeal"
              }`}
            >
              {t(opt.labelKey, lang)}
            </button>
          ))}
        </div>
        {isCouple && (
          <p className="mt-2.5 max-w-md text-xs leading-relaxed text-slate-light">
            {t("coupleHint", lang)}
          </p>
        )}
      </div>

      <div className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-charcoal">
          <UserRound size={16} className="text-slate-light" />
          {t("guestDetails", lang)}
        </h2>
        <div className="flex flex-wrap gap-8">
        {Array.from({ length: state.partySize }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div>
              <label
                htmlFor={`guestName-${i}`}
                className="mb-2.5 block text-sm font-semibold text-charcoal"
              >
                {!isCouple
                  ? t("nameGuest", lang)
                  : i === 0
                    ? t("nameFirst", lang)
                    : t("nameSecond", lang)}
              </label>
              <input
                id={`guestName-${i}`}
                type="text"
                value={state.guestNames[i] ?? ""}
                onChange={(e) =>
                  dispatch({ type: "SET_GUEST_NAME", index: i, name: e.target.value })
                }
                placeholder={t("namePlaceholder", lang)}
                className="min-h-14 w-full max-w-md rounded-2xl border border-sand bg-white px-5 text-base text-charcoal placeholder:text-sm placeholder:text-slate-light/70 shadow-soft outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15 sm:max-w-sm"
              />
            </div>
            <div>
              <div className="inline-flex self-start rounded-full border border-sand bg-white p-1 shadow-soft">
                {(["female", "male"] as BodyGender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => dispatch({ type: "SET_GUEST_GENDER", index: i, bodyGender: g })}
                    className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-all duration-300 ${
                      state.guests[i]?.bodyGender === g
                        ? "bg-clay text-white shadow-soft"
                        : "text-slate hover:bg-oatmeal"
                    }`}
                  >
                    {g === "male" ? t("genderMale", lang) : t("genderFemale", lang)}
                  </button>
                ))}
              </div>
            </div>
            {therapists.length > 0 && (
              <div>
                <label
                  htmlFor={`guestTherapist-${i}`}
                  className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-charcoal"
                >
                  <HeartHandshake size={16} className="text-slate-light" />
                  {t("therapistLabel", lang)}
                </label>
                <select
                  id={`guestTherapist-${i}`}
                  value={state.guestTherapists[i]?.id ?? ""}
                  onChange={(e) => {
                    const picked = therapists.find((tp) => tp.id === e.target.value) ?? null;
                    dispatch({ type: "SET_GUEST_THERAPIST", index: i, therapist: picked });
                  }}
                  className="min-h-12 w-full max-w-md rounded-2xl border border-sand bg-white px-4 text-base text-charcoal shadow-soft outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15 sm:max-w-sm"
                >
                  <option value="">{t("therapistChoose", lang)}</option>
                  {therapists.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {token && <ReturningGuestBlock index={i} deviceToken={token} />}
          </div>
        ))}
        </div>
      </div>

      {isCouple && (
        <div className="mb-10 flex items-center gap-3 rounded-2xl border border-sand bg-white p-4 shadow-soft">
          <Toggle
            checked={state.separateTreatments}
            onChange={(v) => dispatch({ type: "SET_SEPARATE_TREATMENTS", separate: v })}
            label={t("differentMassages", lang)}
          />
          <div>
            <div className="text-sm font-semibold text-charcoal">
              {t("differentMassages", lang)}
            </div>
            <div className="text-xs text-slate-light">
              {state.separateTreatments
                ? t("differentMassagesOn", lang)
                : t("differentMassagesOff", lang)}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!canContinue}
          onClick={handleContinue}
          className="w-full sm:w-auto"
        >
          {t("next", lang)}
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}

// Returning-guest lookup for one guest. Front-desk enters the guest's phone to
// prefill their saved preferences. Only rendered on a paired kiosk — the device
// token authenticates the lookup and tells the server which account's profiles
// to search. All failures are non-blocking — the flow continues regardless.
function ReturningGuestBlock({ index, deviceToken }: { index: number; deviceToken: string }) {
  const { state, dispatch } = useGuest();
  const lang = state.language;
  const crm = state.guestCrm[index] ?? { phone: "", consent: false, prefilled: false };
  const [status, setStatus] = useState<"idle" | "looking" | "found" | "missing" | "failed">("idle");
  const [confirmForget, setConfirmForget] = useState(false);
  const [forgotten, setForgotten] = useState(false);
  // The QR alternative: the receptionist hands the guest their own phone
  // instead of asking for the number aloud. Independent of the lookup status
  // above — a scanned check-in lands as a fresh "incomplete" intake in /queue
  // rather than prefilling this session, so there's nothing to reconcile here.
  const [showQr, setShowQr] = useState(false);

  const phoneValid = crm.phone.replace(/\D/g, "").length >= 8;

  const handleLookup = async () => {
    if (!phoneValid) return;
    setStatus("looking");
    setForgotten(false);
    try {
      const stored = await lookupGuestProfile(deviceToken, crm.phone);
      if (!stored) {
        setStatus("missing");
        return;
      }
      const applied = applyStoredPreferences(stored);
      if (!applied) {
        setStatus("missing");
        return;
      }
      dispatch({
        type: "APPLY_GUEST_PROFILE",
        index,
        preferences: applied.preferences,
        zones: applied.zones,
        zoneNotes: applied.zoneNotes,
        generalNote: applied.generalNote,
      });
      setStatus("found");
    } catch (err) {
      console.error("[crm] lookup failed:", err);
      setStatus("failed");
    }
  };

  const handleForget = async () => {
    if (!confirmForget) {
      setConfirmForget(true);
      return;
    }
    try {
      await forgetGuestProfile(deviceToken, crm.phone);
      dispatch({ type: "CLEAR_GUEST_PROFILE", index });
      setStatus("idle");
      setConfirmForget(false);
      setForgotten(true);
    } catch (err) {
      console.error("[crm] forget failed:", err);
      setStatus("failed");
    }
  };

  return (
    <div className="mt-1 max-w-md rounded-2xl border border-sand bg-oatmeal/40 p-4">
      <label
        htmlFor={`guestPhone-${index}`}
        className="mb-2 block text-sm font-semibold text-charcoal"
      >
        {t("returningGuest", lang)}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`guestPhone-${index}`}
          type="tel"
          inputMode="tel"
          value={crm.phone}
          onChange={(e) => {
            dispatch({ type: "SET_GUEST_PHONE", index, phone: e.target.value });
            setStatus("idle");
            setConfirmForget(false);
            setForgotten(false);
          }}
          placeholder={t("guestPhonePlaceholder", lang)}
          className="min-h-11 flex-1 rounded-xl border border-sand bg-white px-3 text-base text-charcoal placeholder:text-sm placeholder:text-slate-light/70 outline-none transition-all duration-300 focus:border-clay focus:ring-4 focus:ring-clay/15"
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={!phoneValid || status === "looking"}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-sand bg-white px-3 text-sm font-semibold text-slate transition-all duration-200 hover:border-clay/40 disabled:opacity-50"
        >
          <Search size={15} />
          {status === "looking" ? t("guestLooking", lang) : t("guestLookup", lang)}
        </button>
        {/* Alternative to speaking the number aloud: the guest scans this on
            their own phone and types it themselves (api/_checkinCore.ts). */}
        <button
          type="button"
          onClick={() => setShowQr(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-sand bg-white px-3 text-sm font-semibold text-slate transition-all duration-200 hover:border-clay/40"
        >
          <QrCode size={15} />
          {t("checkinShowQr", lang)}
        </button>
      </div>
      {showQr && (
        <CheckinQrModal deviceToken={deviceToken} lang={lang} onClose={() => setShowQr(false)} />
      )}
      {status === "found" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-sage-dark">
          <Check size={14} strokeWidth={3} />
          {t("guestFound", lang)}
        </p>
      )}
      {status === "missing" && (
        <p className="mt-2 text-xs text-slate-light">{t("guestNotFound", lang)}</p>
      )}
      {status === "failed" && (
        <p className="mt-2 text-xs text-rose-dark">{t("guestLookupFailed", lang)}</p>
      )}
      {forgotten && (
        <p className="mt-2 text-xs font-medium text-slate">{t("guestForgotten", lang)}</p>
      )}
      {(status === "found" || crm.prefilled) && (
        <button
          type="button"
          onClick={handleForget}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-rose-dark hover:underline"
        >
          <Trash2 size={13} />
          {confirmForget ? t("guestForgetConfirm", lang) : t("guestForget", lang)}
        </button>
      )}
    </div>
  );
}
