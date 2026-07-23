import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BedDouble, ChevronDown, Hand, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  fetchCatalog,
  importDefaultCatalog,
  type CatalogService,
  type ServiceDurationRow,
} from "../../lib/catalog";
import { languages, t, tf } from "../../i18n/translations";
import type { LangCode } from "../../types";
import { Button } from "../Button";
import { DashboardShell } from "../DashboardShell";
import { SubscriptionBanner } from "../billing/SubscriptionBanner";
import { BrandingEditor } from "./BrandingEditor";
import { RoomsEditor } from "./RoomsEditor";

interface LocationLite {
  id: string;
  name: string;
  account_id: string;
}

// Location Manager / Owner / Platform Admin offer CMS. Lists the locations the
// signed-in user can read (RLS filters the rest), lets them pick one, and edit
// its services + durations. Writes are gated at the DB by can_manage_location().
// UI language is the global staff language (defaults to Polish) so a
// non-Polish-speaking manager can switch it from the top selector.
export function OfferCMS() {
  const { user, loading, rolesReady, canManage, canManageLocation } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  // Deep link from the admin dashboard: /manage?location=<id> preselects it.
  const [searchParams] = useSearchParams();
  const requestedLocation = searchParams.get("location");

  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Route gate: must be signed in AND able to manage offers (platform admin,
  // owner, or manager). Therapist/front-desk are sent to the therapist queue.
  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login");
    else if (rolesReady && !canManage) navigate("/queue");
  }, [loading, user, rolesReady, canManage, navigate]);

  // Load readable locations once roles are known (so the manageable filter works).
  useEffect(() => {
    if (!user || !rolesReady) return;
    supabase
      .from("locations")
      .select("id, name, account_id")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          // RLS lets a manager READ sibling locations; only show ones they can MANAGE.
          const manageable = ((data as LocationLite[]) ?? []).filter((l) => canManageLocation(l));
          setLocations(manageable);
          const preferred =
            requestedLocation && manageable.some((l) => l.id === requestedLocation)
              ? requestedLocation
              : manageable[0]?.id;
          if (preferred) setLocationId((prev) => prev || preferred);
        }
      });
  }, [user, rolesReady, canManageLocation, requestedLocation]);

  const loadCatalog = useCallback(async (locId: string) => {
    setError(null);
    try {
      setCatalog(await fetchCatalog(locId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load catalogue.");
    }
  }, []);

  useEffect(() => {
    if (locationId) loadCatalog(locationId);
  }, [locationId, loadCatalog]);

  async function handleImport() {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    try {
      await importDefaultCatalog(locationId);
      await loadCatalog(locationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addService() {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("services").insert({
      location_id: locationId,
      name_i18n: { pl: "Nowa usługa" },
      active: true,
      sort: catalog.length,
    });
    setBusy(false);
    if (error) setError(error.message);
    else loadCatalog(locationId);
  }

  if (loading || !rolesReady) return <Centered>{t("loading", lang)}</Centered>;
  if (!user || !canManage) return null;

  return (
    <DashboardShell title={t("offer", lang)} width="max-w-4xl">
      <SubscriptionBanner />

        {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

        {locations.length === 0 ? (
          <p className="text-slate">{t("cmsNoLocations", lang)}</p>
        ) : (
          <>
            <label className="mb-6 flex max-w-sm flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
              {t("locationLabel", lang)}
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={inputClass}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            {locationId && <BrandingEditor locationId={locationId} />}

            {/* Section break: the branding editor above is one white card; without
                a heading the service cards below read as more of the same. */}
            <div className="mt-10 mb-4 border-t border-sand pt-8">
              <h2 className="flex items-center gap-2 font-serif text-xl text-charcoal">
                <Hand size={18} className="text-slate-light" />
                {t("cmsServicesHeading", lang)}
              </h2>
              <p className="mt-1 text-sm text-slate">{t("cmsServicesHint", lang)}</p>
            </div>

            {catalog.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 text-center shadow-soft">
                <p className="mb-4 text-slate">{t("cmsNoServices", lang)}</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={handleImport} disabled={busy}>
                    {busy ? t("cmsImporting", lang) : t("cmsImport", lang)}
                  </Button>
                  <Button variant="secondary" onClick={addService} disabled={busy}>
                    {t("cmsAddBlank", lang)}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {catalog.map((s) => (
                  <ServiceEditor key={s.id} service={s} onChanged={() => loadCatalog(locationId)} />
                ))}
                <Button variant="secondary" onClick={addService} disabled={busy} className="self-start">
                  + {t("cmsAddService", lang)}
                </Button>
              </div>
            )}

            {/* Section break, same pattern as the services heading above. */}
            <div className="mt-10 mb-4 border-t border-sand pt-8">
              <h2 className="flex items-center gap-2 font-serif text-xl text-charcoal">
                <BedDouble size={18} className="text-slate-light" />
                {t("cmsRoomsHeading", lang)}
              </h2>
              <p className="mt-1 text-sm text-slate">{t("cmsRoomsHint", lang)}</p>
            </div>
            {locationId && <RoomsEditor locationId={locationId} />}
          </>
        )}
    </DashboardShell>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 text-slate">
      {children}
    </div>
  );
}

// The non-Polish languages a manager can optionally translate a name into.
const otherLangs = languages.map((l) => l.code).filter((c): c is LangCode => c !== "pl");

// One service row: a required Polish name, optional per-language name
// translations (blank = falls back to Polish), an active flag, and durations.
function ServiceEditor({ service, onChanged }: { service: CatalogService; onChanged: () => void }) {
  const { lang } = useLanguage();
  // Per-language name map, seeded from the stored translations.
  const [names, setNames] = useState<Record<string, string>>(() => ({ ...service.name_i18n }));
  const [showTranslations, setShowTranslations] = useState(false);
  const [active, setActive] = useState(service.active);
  const [durations, setDurations] = useState<ServiceDurationRow[]>(service.durations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default so the offer reads as a scannable list of services;
  // the editing form (name, translations, durations, prices) only appears once
  // the manager opens a service. A freshly added service starts collapsed too.
  const [expanded, setExpanded] = useState(false);

  const setName = (code: string, value: string) =>
    setNames((prev) => ({ ...prev, [code]: value }));

  async function save() {
    const pl = (names.pl ?? "").trim();
    if (!pl) {
      setError(t("cmsNameRequired", lang));
      return;
    }
    setBusy(true);
    setError(null);
    // Rebuild name_i18n: Polish always present; other languages only if the
    // manager filled them in (empty ones are dropped so the kiosk falls back
    // to Polish). Description is intentionally not stored.
    const nameI18n: Record<string, string> = { pl };
    for (const code of otherLangs) {
      const v = (names[code] ?? "").trim();
      if (v) nameI18n[code] = v;
    }
    const { error: sErr } = await supabase
      .from("services")
      .update({ name_i18n: nameI18n, active })
      .eq("id", service.id);
    if (sErr) {
      setBusy(false);
      setError(sErr.message);
      return;
    }
    // Upsert durations (existing rows have ids; new ones don't).
    for (const d of durations) {
      const payload = {
        service_id: service.id,
        minutes: d.minutes,
        price_single: d.price_single,
        price_couple: d.price_couple,
        couple_available: d.couple_available,
      };
      const { error: dErr } = d.id
        ? await supabase.from("service_durations").update(payload).eq("id", d.id)
        : await supabase.from("service_durations").insert(payload);
      if (dErr) {
        setBusy(false);
        setError(dErr.message);
        return;
      }
    }
    setBusy(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(tf("cmsDeleteConfirm", lang, { name: names.pl ?? "" }))) return;
    setBusy(true);
    const { error } = await supabase.from("services").delete().eq("id", service.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  }

  async function removeDuration(d: ServiceDurationRow, index: number) {
    if (d.id) {
      const { error } = await supabase.from("service_durations").delete().eq("id", d.id);
      if (error) {
        setError(error.message);
        return;
      }
    }
    setDurations((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDuration(index: number, patch: Partial<ServiceDurationRow>) {
    setDurations((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  // Collapsed-header summary: the durations and the lowest single price, so a
  // manager can scan the offer without opening each service.
  const pricedSingles = durations
    .map((d) => d.price_single)
    .filter((p): p is number => p != null);
  const summary =
    durations.length === 0
      ? "—"
      : [
          `${durations.map((d) => d.minutes).join(", ")} min`,
          pricedSingles.length
            ? tf("priceFrom", lang, { price: `${Math.min(...pricedSingles)} zł` })
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow-soft ${active ? "" : "opacity-60"}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-lg text-charcoal">
            {names.pl?.trim() || t("cmsName", lang)}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-light">{summary}</div>
        </div>
        {!active && (
          <span className="shrink-0 rounded-full bg-oatmeal px-2.5 py-0.5 text-xs font-medium text-slate-light">
            {t("cmsInactive", lang)}
          </span>
        )}
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-light transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-sand px-5 pb-5 pt-4">
      <Field label={`${t("cmsName", lang)} (PL)`}>
        <input
          required
          value={names.pl ?? ""}
          onChange={(e) => setName("pl", e.target.value)}
          // Same font as the duration/price fields below it, so every input in
          // the editing form reads consistently.
          className={inputClass}
        />
      </Field>

      <button
        type="button"
        onClick={() => setShowTranslations((v) => !v)}
        className="mt-2 self-start text-xs font-medium text-sage-dark hover:underline"
      >
        {showTranslations ? t("cmsHideTranslations", lang) : t("cmsAddTranslations", lang)}
      </button>
      {showTranslations && (
        <div className="mt-2 rounded-xl bg-oatmeal p-3">
          <p className="mb-2 text-xs text-slate-light">{t("cmsFallbackNote", lang)}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {otherLangs.map((code) => (
              <Field key={code} label={languages.find((l) => l.code === code)!.label}>
                <input
                  value={names[code] ?? ""}
                  onChange={(e) => setName(code, e.target.value)}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("cmsDurations", lang)}
        </div>

        {durations.length > 0 && (
          <div className="overflow-x-auto">
            {/* An aligned grid table: the column headers are shown once at the top
                instead of being repeated on every duration row (the old layout
                stamped MIN / price / couple labels onto each line, which read as
                clutter once a service had several durations). */}
            <div className="grid min-w-[26rem] grid-cols-[5.5rem_1fr_3.25rem_1fr_1.75rem] items-center gap-x-3 gap-y-2">
              <HeadCell>{t("cmsMin", lang)}</HeadCell>
              <HeadCell>{t("cmsPriceSingle", lang)}</HeadCell>
              <HeadCell className="text-center">{t("cmsCoupleShort", lang)}</HeadCell>
              <HeadCell>{t("cmsPriceCouple", lang)}</HeadCell>
              <span />

              {durations.map((d, i) => (
                <Fragment key={d.id ?? `new-${i}`}>
                  <input
                    type="number"
                    min={1}
                    value={d.minutes}
                    aria-label={t("cmsMin", lang)}
                    onChange={(e) =>
                      updateDuration(i, {
                        minutes: Math.max(0, Math.round(Number(e.target.value) || 0)),
                      })
                    }
                    className={`${inputClass} tabular-nums`}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="—"
                    value={d.price_single ?? ""}
                    aria-label={t("cmsPriceSingle", lang)}
                    onChange={(e) =>
                      updateDuration(i, {
                        price_single:
                          e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      })
                    }
                    className={`${inputClass} tabular-nums`}
                  />
                  <label className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={d.couple_available}
                      aria-label={t("cmsCoupleShort", lang)}
                      // Clearing the couple price when couples are turned off keeps a
                      // stale (and now hidden) price from being saved to the row.
                      onChange={(e) =>
                        updateDuration(i, {
                          couple_available: e.target.checked,
                          price_couple: e.target.checked ? d.price_couple : null,
                        })
                      }
                    />
                  </label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={d.price_couple ?? ""}
                    disabled={!d.couple_available}
                    aria-label={t("cmsPriceCouple", lang)}
                    onChange={(e) =>
                      updateDuration(i, {
                        price_couple:
                          e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                      })
                    }
                    className={`${inputClass} tabular-nums disabled:opacity-40`}
                  />
                  <button
                    type="button"
                    onClick={() => removeDuration(d, i)}
                    aria-label={t("cmsRemove", lang)}
                    className="flex justify-center text-slate-light transition-colors hover:text-rose-dark"
                  >
                    <Trash2 size={15} />
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            setDurations((prev) => [
              ...prev,
              { id: "", service_id: service.id, minutes: 60, price_single: null, price_couple: null, couple_available: false },
            ])
          }
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sage-dark hover:underline"
        >
          <Plus size={13} />
          {t("cmsAddDuration", lang)}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-dark">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("cmsActive", lang)}
        </label>
        <div className="flex-1" />
        <button type="button" onClick={remove} disabled={busy} className="text-sm text-rose-dark hover:underline">
          {t("cmsDelete", lang)}
        </button>
        <Button variant="secondary" onClick={save} disabled={busy}>
          {busy ? t("saving", lang) : t("save", lang)}
        </Button>
      </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "min-h-11 rounded-xl border border-sand bg-cream px-3 text-charcoal outline-none focus:border-sage";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // The caption's text-xs/uppercase styling lives on its own span rather than
    // the wrapping label, so it doesn't cascade into the input (an input has no
    // font-size of its own, so it was inheriting the 12px caption size — making
    // the name field read smaller than the duration/price inputs beside it).
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-light">{label}</span>
      {children}
    </label>
  );
}

// Column header for the duration/price grid — one row of labels shared by every
// duration below it.
function HeadCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wide text-slate-light ${className}`}>
      {children}
    </span>
  );
}
