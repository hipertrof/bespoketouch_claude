import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { LanguageSelector } from "../LanguageSelector";

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
  const { user, loading, rolesReady, canManage, canManageLocation, signOut } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

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
          if (manageable.length > 0) setLocationId((prev) => prev || manageable[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, rolesReady]);

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
    <div className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-charcoal">{t("offer", lang)}</h1>
            <p className="text-sm text-slate">{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/queue" className="text-sm font-medium text-sage-dark hover:underline">
              {t("queueNav", lang)}
            </Link>
            <Link to="/staff" className="text-sm font-medium text-sage-dark hover:underline">
              {t("staffNav", lang)}
            </Link>
            <LanguageSelector />
            <Button variant="ghost" onClick={() => signOut()}>
              {t("signOut", lang)}
            </Button>
          </div>
        </header>

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
          </>
        )}
      </div>
    </div>
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

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-soft ${active ? "" : "opacity-60"}`}>
      <Field label={`${t("cmsName", lang)} (PL)`}>
        <input
          required
          value={names.pl ?? ""}
          onChange={(e) => setName("pl", e.target.value)}
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

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("cmsDurations", lang)}
        </div>
        <div className="flex flex-col gap-2">
          {durations.map((d, i) => (
            <div key={d.id ?? `new-${i}`} className="flex flex-wrap items-end gap-2">
              <MiniField label={t("cmsMin", lang)}>
                <input
                  type="number"
                  value={d.minutes}
                  onChange={(e) => updateDuration(i, { minutes: Number(e.target.value) })}
                  className={`${inputClass} w-20`}
                />
              </MiniField>
              <MiniField label={t("cmsPriceSingle", lang)}>
                <input
                  type="number"
                  value={d.price_single ?? ""}
                  onChange={(e) =>
                    updateDuration(i, {
                      price_single: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={`${inputClass} w-24`}
                />
              </MiniField>
              <MiniField label={t("cmsPriceCouple", lang)}>
                <input
                  type="number"
                  value={d.price_couple ?? ""}
                  disabled={!d.couple_available}
                  onChange={(e) =>
                    updateDuration(i, {
                      price_couple: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={`${inputClass} w-24 disabled:opacity-40`}
                />
              </MiniField>
              <label className="flex items-center gap-1 pb-3 text-xs text-slate">
                <input
                  type="checkbox"
                  checked={d.couple_available}
                  onChange={(e) => updateDuration(i, { couple_available: e.target.checked })}
                />
                {t("cmsCoupleShort", lang)}
              </label>
              <button
                type="button"
                onClick={() => removeDuration(d, i)}
                className="pb-3 text-xs text-rose-dark hover:underline"
              >
                {t("cmsRemove", lang)}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setDurations((prev) => [
                ...prev,
                { id: "", service_id: service.id, minutes: 60, price_single: null, price_couple: null, couple_available: false },
              ])
            }
            className="self-start text-xs text-sage-dark hover:underline"
          >
            + {t("cmsAddDuration", lang)}
          </button>
        </div>
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
    <label className={`flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light ${className}`}>
      {label}
      {children}
    </label>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-light">
      {label}
      {children}
    </label>
  );
}
