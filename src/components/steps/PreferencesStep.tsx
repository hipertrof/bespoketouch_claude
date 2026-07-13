import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Flame, MessageCircle, Music, VolumeX } from "lucide-react";
import { useGuest, useActiveGuest } from "../../context/GuestContext";
import { Button } from "../Button";
import { SegmentedControl } from "../SegmentedControl";
import { PreferenceCard } from "../PreferenceCard";
import { Toggle } from "../Toggle";
import { oils } from "../../data/oils";
import type { CommunicationStyle, MusicPreference, PressureLevel } from "../../types";

const pressureOptions: { value: PressureLevel; label: string }[] = [
  { value: "Lekki", label: "Lekki" },
  { value: "Średni", label: "Średni" },
  { value: "Mocny", label: "Mocny" },
  { value: "Głęboki", label: "Głęboki" },
];

const pressureDescriptions: Record<PressureLevel, string> = {
  Lekki: "Lekki nacisk – delikatny i kojący.",
  Średni: "Średni nacisk – zrównoważony i relaksujący.",
  Mocny: "Mocny nacisk – intensywny i pobudzający krążenie.",
  Głęboki: "Głęboki nacisk – praca na głębokich warstwach mięśni.",
};

const musicOptions: { value: MusicPreference; label: string; icon: ReactNode }[] = [
  { value: "nature", label: "Dźwięki natury", icon: <Music size={16} /> },
  { value: "ambient", label: "Ambient", icon: <Music size={16} /> },
  { value: "silence", label: "Cisza", icon: <VolumeX size={16} /> },
];

export function PreferencesStep() {
  const { state, dispatch } = useGuest();
  const activeGuest = useActiveGuest();
  const { preferences } = activeGuest;
  const isCouple = state.partySize === 2;

  const setPref = <K extends keyof typeof preferences>(
    key: K,
    value: (typeof preferences)[K],
  ) => dispatch({ type: "SET_PREFERENCE", key, value });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {isCouple && (
        <span className="mb-3 inline-flex items-center rounded-full bg-sage-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sage-dark">
          {state.guestNames[state.activeGuestIndex]?.trim() || `Osoba ${state.activeGuestIndex + 1}`}
        </span>
      )}
      <h1 className="mb-2 font-serif text-3xl text-charcoal sm:text-4xl">
        Twoje preferencje
      </h1>
      <p className="mb-8 max-w-xl text-base leading-relaxed text-slate">
        Dopasuj masaż do swoich potrzeb. Wszystko po to, aby stworzyć Twoje
        idealne doświadczenie.
      </p>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <PreferenceCard
          title="Siła nacisku"
          description="Wybierz preferowaną intensywność nacisku podczas masażu."
        >
          <SegmentedControl
            options={pressureOptions}
            value={preferences.pressure}
            onChange={(v) => setPref("pressure", v)}
          />
          <p className="mt-3 text-xs font-medium text-slate-light">
            {pressureDescriptions[preferences.pressure]}
          </p>
        </PreferenceCard>

        <PreferenceCard
          title="Olejek do masażu"
          description="Wybierz kompozycję zapachową, która wspiera Twoje samopoczucie."
        >
          <div className="grid grid-cols-2 gap-2.5">
            {oils.map((oil) => {
              const isSelected = preferences.oilId === oil.id;
              return (
                <button
                  key={oil.id}
                  type="button"
                  onClick={() => setPref("oilId", oil.id)}
                  className={`relative min-h-16 rounded-xl border p-3 text-left transition-all duration-300 active:scale-[0.98] ${
                    isSelected
                      ? "border-clay bg-clay-tint shadow-soft"
                      : "border-sand bg-white hover:border-clay/40 hover:bg-oatmeal/60"
                  }`}
                >
                  {isSelected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-sage-dark text-cream">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                  <div className="pr-5 text-sm font-semibold text-charcoal">
                    {oil.name}
                  </div>
                  <div className="text-xs text-slate-light">{oil.subtitle}</div>
                </button>
              );
            })}
          </div>
        </PreferenceCard>

        <PreferenceCard
          title="Podgrzewanie stołu"
          description="Ciepły stół zwiększa komfort i pomaga w rozluźnieniu mięśni."
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
              <Flame size={18} className="text-clay-dark" />
              {preferences.tableWarming ? "Włączone" : "Wyłączone"}
            </div>
            <Toggle
              checked={preferences.tableWarming}
              onChange={(v) => setPref("tableWarming", v)}
              label="Podgrzewanie stołu"
            />
          </div>

          <div className="my-4 h-px bg-sand" />

          <div className="mb-2 text-sm font-semibold text-charcoal">
            Poduszka zagłówka
          </div>
          <SegmentedControl
            options={[
              { value: "Standardowa", label: "Standardowa" },
              { value: "Ultra-miękka", label: "Ultra-miękka" },
            ]}
            value={preferences.headrestPillow}
            onChange={(v) => setPref("headrestPillow", v)}
          />

          <div className="my-4 h-px bg-sand" />

          <div className="mb-2 text-sm font-semibold text-charcoal">
            Muzyka w tle
          </div>
          <div className="flex flex-wrap gap-2">
            {musicOptions.map((opt) => {
              const isSelected = preferences.music === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPref("music", opt.value)}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-all duration-300 active:scale-[0.98] ${
                    isSelected
                      ? "border-clay bg-clay-tint text-clay-dark"
                      : "border-sand bg-white text-slate hover:border-clay/40"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </PreferenceCard>

        <PreferenceCard
          title="Komunikacja"
          description="Wybierz preferowany sposób komunikacji podczas masażu."
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {(
              [
                {
                  value: "silent" as CommunicationStyle,
                  title: "Sesja w ciszy",
                  subtitle: "Skupienie na relaksie i oddechu.",
                  icon: <VolumeX size={18} />,
                },
                {
                  value: "guided" as CommunicationStyle,
                  title: "Z przewodnikiem",
                  subtitle: "Terapeuta będzie informował i pytał o odczucia.",
                  icon: <MessageCircle size={18} />,
                },
              ] as const
            ).map((opt) => {
              const isSelected = preferences.communication === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPref("communication", opt.value)}
                  className={`flex min-h-24 flex-col gap-1.5 rounded-xl border p-4 text-left transition-all duration-300 active:scale-[0.98] ${
                    isSelected
                      ? "border-clay bg-clay-tint shadow-soft"
                      : "border-sand bg-white hover:border-clay/40 hover:bg-oatmeal/60"
                  }`}
                >
                  <span
                    className={isSelected ? "text-clay-dark" : "text-slate-light"}
                  >
                    {opt.icon}
                  </span>
                  <span className="text-sm font-semibold text-charcoal">
                    {opt.title}
                  </span>
                  <span className="text-xs leading-snug text-slate-light">
                    {opt.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </PreferenceCard>
      </div>

      <div className="mt-10 flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "SET_STEP", step: "bodyMap" })}
        >
          <ArrowLeft size={18} />
          Wstecz
        </Button>
        <Button onClick={() => dispatch({ type: "COMPLETE_GUEST_PREFERENCES" })}>
          Zatwierdź i zablokuj preferencje
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}
