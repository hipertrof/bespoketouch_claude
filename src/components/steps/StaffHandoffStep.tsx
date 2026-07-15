import { useMemo } from "react";
import { ArrowRight, Hand } from "lucide-react";
import { useGuest } from "../../context/GuestContext";
import { useCatalog } from "../../context/CatalogContext";
import { toMassageTypes } from "../../lib/catalog";
import { Button } from "../Button";
import { t, tf } from "../../i18n/translations";
import { guestDisplayName } from "../../utils/guestName";

export function StaffHandoffStep() {
  const { state, dispatch } = useGuest();
  const { catalog } = useCatalog();
  const lang = state.language;
  const massages = useMemo(() => toMassageTypes(catalog, lang), [catalog, lang]);
  const isCouple = state.partySize === 2;
  const showSeparate = isCouple && state.separateTreatments;

  const massageName = (id: string | null | undefined) =>
    massages.find((m) => m.id === id)?.name ?? null;

  const treatmentLine = (index: number) => {
    const sel = state.treatmentSelections[index];
    const name = massageName(sel?.treatmentId);
    if (!name) return "—";
    return `${name}${sel?.treatmentMinutes ? ` (${sel.treatmentMinutes} min)` : ""}`;
  };

  const singleName = massageName(state.treatmentSelections[0]?.treatmentId);
  const singleMinutes = state.treatmentSelections[0]?.treatmentMinutes;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col items-center justify-center px-4 py-14 text-center sm:px-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-clay-tint text-clay-dark">
        <Hand size={36} strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 font-serif text-3xl text-charcoal sm:text-4xl">
        {tf("allReady", lang, { name: guestDisplayName(state.guestNames, state.partySize, lang) })}
      </h1>

      {showSeparate ? (
        <div className="flex flex-col gap-1 text-left">
          {[0, 1].map((i) => (
            <p key={i} className="text-base leading-relaxed text-slate sm:text-lg">
              <span className="font-semibold text-charcoal">
                {state.guestNames[i]?.trim() || `${t("person", lang)} ${i + 1}`}:
              </span>{" "}
              {treatmentLine(i)}
            </p>
          ))}
        </div>
      ) : (
        <p className="max-w-md text-base leading-relaxed text-slate sm:text-lg">
          {singleName
            ? tf("chosenTreatment", lang, {
                treatment: `${singleName}${singleMinutes ? ` (${singleMinutes} min)` : ""}`,
              })
            : t("treatmentAlreadyChosen", lang)}
        </p>
      )}

      <p className="mt-3 max-w-md text-base leading-relaxed text-slate sm:text-lg">
        {t("personalizePrompt", lang)}
      </p>

      {isCouple && (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-light">
          {showSeparate ? t("coupleFlowSeparate", lang) : t("coupleFlowShared", lang)}
        </p>
      )}

      <Button onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })} className="mt-10">
        {t("startPersonalization", lang)}
        <ArrowRight size={18} />
      </Button>
    </div>
  );
}
