import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import {
  fetchCatalog,
  importDefaultCatalog,
  type CatalogService,
  type ServiceDurationRow,
} from "../../lib/catalog";
import { Button } from "../Button";

interface LocationLite {
  id: string;
  name: string;
  account_id: string;
}

// Location Manager / Owner / Platform Admin offer CMS. Lists the locations the
// signed-in user can read (RLS filters the rest), lets them pick one, and edit
// its services + durations. Writes are gated at the DB by can_manage_location().
export function OfferCMS() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  // Load readable locations once signed in.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("locations")
      .select("id, name, account_id")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setLocations((data as LocationLite[]) ?? []);
          if (data && data.length > 0) setLocationId((prev) => prev || data[0].id);
        }
      });
  }, [user]);

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
      description_i18n: {},
      active: true,
      sort: catalog.length,
    });
    setBusy(false);
    if (error) setError(error.message);
    else loadCatalog(locationId);
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-cream px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl text-charcoal">Offer</h1>
            <p className="text-sm text-slate">{user.email}</p>
          </div>
          <Button variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
        </header>

        {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

        {locations.length === 0 ? (
          <p className="text-slate">
            No locations you can manage yet. Create one from the Platform Admin dashboard.
          </p>
        ) : (
          <>
            <label className="mb-6 flex max-w-sm flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-light">
              Location
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
                <p className="mb-4 text-slate">This location has no services yet.</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={handleImport} disabled={busy}>
                    {busy ? "Importing…" : "Import Nusa catalogue"}
                  </Button>
                  <Button variant="secondary" onClick={addService} disabled={busy}>
                    Add blank service
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {catalog.map((s) => (
                  <ServiceEditor key={s.id} service={s} onChanged={() => loadCatalog(locationId)} />
                ))}
                <Button variant="secondary" onClick={addService} disabled={busy} className="self-start">
                  + Add service
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

// One service row: pl/en names, pl description, active flag, and its durations.
function ServiceEditor({ service, onChanged }: { service: CatalogService; onChanged: () => void }) {
  const [namePl, setNamePl] = useState(service.name_i18n.pl ?? "");
  const [nameEn, setNameEn] = useState(service.name_i18n.en ?? "");
  const [descPl, setDescPl] = useState(service.description_i18n.pl ?? "");
  const [active, setActive] = useState(service.active);
  const [durations, setDurations] = useState<ServiceDurationRow[]>(service.durations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    // Preserve other-language keys; only overwrite pl/en.
    const { error: sErr } = await supabase
      .from("services")
      .update({
        name_i18n: { ...service.name_i18n, pl: namePl, en: nameEn },
        description_i18n: { ...service.description_i18n, pl: descPl },
        active,
      })
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
    if (!confirm(`Delete "${namePl}"? This cannot be undone.`)) return;
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name (PL)">
          <input value={namePl} onChange={(e) => setNamePl(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Name (EN)">
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Description (PL)" className="mt-3">
        <textarea
          value={descPl}
          onChange={(e) => setDescPl(e.target.value)}
          rows={2}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-light">
          Durations
        </div>
        <div className="flex flex-col gap-2">
          {durations.map((d, i) => (
            <div key={d.id ?? `new-${i}`} className="flex flex-wrap items-end gap-2">
              <MiniField label="Min">
                <input
                  type="number"
                  value={d.minutes}
                  onChange={(e) => updateDuration(i, { minutes: Number(e.target.value) })}
                  className={`${inputClass} w-20`}
                />
              </MiniField>
              <MiniField label="Single (zł)">
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
              <MiniField label="Couple (zł)">
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
                couple
              </label>
              <button
                type="button"
                onClick={() => removeDuration(d, i)}
                className="pb-3 text-xs text-rose-dark hover:underline"
              >
                remove
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
            + add duration
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-dark">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
        <div className="flex-1" />
        <button type="button" onClick={remove} disabled={busy} className="text-sm text-rose-dark hover:underline">
          Delete
        </button>
        <Button variant="secondary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
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
