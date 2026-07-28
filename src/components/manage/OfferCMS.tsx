import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  GripVertical,
  Hand,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  ALL_PRESSURE_LEVELS,
  fetchCatalog,
  importDefaultCatalog,
  type CatalogService,
  type ServiceDurationRow,
} from "../../lib/catalog";
import { languages, pressureTranslations, t, tf } from "../../i18n/translations";
import { useDragReorder } from "../../hooks/useDragReorder";
import type { LangCode, PressureLevel } from "../../types";
import { Button } from "../Button";
import { DashboardShell } from "../DashboardShell";
import { SubscriptionBanner } from "../billing/SubscriptionBanner";
import { BrandingEditor } from "./BrandingEditor";
import { ComfortEditor } from "./ComfortEditor";
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

  const { dragIndex, insertionIndex, dragOffset, getHandleProps, registerItem } = useDragReorder({
    itemCount: catalog.length,
    onReorder: (from, to) => reorderServices(from, to),
    disabled: busy,
  });

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

  // Move a service to an arbitrary position (drag) or one step (arrows).
  // `services.sort` has existed since 0001 and fetchCatalog already orders by
  // it, but nothing ever wrote it after insert — so legacy rows can all sit at
  // the default 0, where a naive swap is a silent no-op. Renormalizing the whole
  // list to 0..n-1 and writing only the rows that actually change fixes that and
  // closes the gaps left behind by deletes, in one pass.
  async function reorderServices(from: number, to: number) {
    if (!locationId || from === to) return;
    if (from < 0 || to < 0 || from >= catalog.length || to >= catalog.length) return;

    const previous = catalog;
    const reordered = [...catalog];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    const changed = reordered
      .map((service, i) => ({ id: service.id, sort: i }))
      .filter(({ id, sort }) => previous.find((s) => s.id === id)?.sort !== sort);
    if (changed.length === 0) return;

    // Optimistic: a drag that snapped back until the round-trip landed would
    // read as broken. The loadCatalog in `finally` is still the authority.
    setCatalog(reordered);

    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        changed.map(async ({ id, sort }) => {
          // RLS-blocked updates return error: null with zero rows, so the
          // affected-row check is the only way to tell a real write from a
          // silent no-op (see CLAUDE.md).
          const { data, error: updateError } = await supabase
            .from("services")
            .update({ sort })
            .eq("id", id)
            .select("id");
          if (updateError) throw new Error(updateError.message);
          if (!data || data.length === 0) throw new Error(t("cmsReorderFailed", lang));
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("cmsReorderFailed", lang));
    } finally {
      setBusy(false);
      // Reload either way — on failure it resyncs away any partial write.
      await loadCatalog(locationId);
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
    <DashboardShell title={t("offer", lang)}>
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
              <p className="mt-1 text-sm text-slate">
                {t("cmsServicesHint", lang)} {t("cmsReorderHint", lang)}
              </p>
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
              // Single column, not a grid: "up" has to mean the row above, and
              // in a multi-column grid the previous item sits to the left.
              <div className="flex flex-col gap-2">
                {catalog.map((s, i) => (
                  <ServiceEditor
                    key={s.id}
                    service={s}
                    index={i}
                    onChanged={() => loadCatalog(locationId)}
                    onMoveUp={() => reorderServices(i, i - 1)}
                    onMoveDown={() => reorderServices(i, i + 1)}
                    canMoveUp={i > 0 && !busy}
                    canMoveDown={i < catalog.length - 1 && !busy}
                    registerItem={registerItem}
                    handleProps={getHandleProps(i)}
                    isDragging={dragIndex === i}
                    dragOffset={dragIndex === i ? dragOffset : 0}
                    dropBefore={insertionIndex === i}
                    dropAfter={insertionIndex === catalog.length && i === catalog.length - 1}
                  />
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

            {/* Section break, same pattern as the sections above. */}
            <div className="mt-10 mb-4 border-t border-sand pt-8">
              <h2 className="flex items-center gap-2 font-serif text-xl text-charcoal">
                <Sparkles size={18} className="text-slate-light" />
                {t("cmsComfortHeading", lang)}
              </h2>
            </div>
            {locationId && <ComfortEditor locationId={locationId} />}
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
// One line in the offer list. Deliberately the same density as the kiosk's
// treatment list — a manager scanning the offer is doing the same "find the
// known name" job the receptionist does, so it gets the same one-line row
// rather than an accordion that pushes everything below it down the page.
// Editing happens in a modal, so this row has no expand affordance and the
// only chevron-ish controls left are the reorder arrows.
function ServiceEditor({
  service,
  index,
  onChanged,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  registerItem,
  handleProps,
  isDragging,
  dragOffset,
  dropBefore,
  dropAfter,
}: {
  service: CatalogService;
  index: number;
  onChanged: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  registerItem: (index: number, el: HTMLElement | null) => void;
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: { touchAction: "none" };
  };
  isDragging: boolean;
  dragOffset: number;
  dropBefore: boolean;
  dropAfter: boolean;
}) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);

  const name = service.name_i18n.pl?.trim() || t("cmsName", lang);
  const pricedSingles = service.durations
    .map((d) => d.price_single)
    .filter((p): p is number => p != null);
  const summary =
    service.durations.length === 0
      ? "—"
      : [
          `${service.durations.map((d) => d.minutes).join(", ")} min`,
          pricedSingles.length
            ? tf("priceFrom", lang, { price: `${Math.min(...pricedSingles)} zł` })
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <>
      <div
        ref={(el) => registerItem(index, el)}
        style={
          isDragging
            ? { transform: `translateY(${dragOffset}px)`, position: "relative", zIndex: 10 }
            : undefined
        }
        className={`flex items-center rounded-2xl border bg-white ${
          service.active ? "" : "opacity-60"
        } ${
          isDragging
            ? "border-clay opacity-90 shadow-lift"
            : "border-sand shadow-soft transition-transform duration-150"
        } ${dropBefore ? "shadow-[0_-3px_0_-1px_var(--color-clay)]" : ""} ${
          dropAfter ? "shadow-[0_3px_0_-1px_var(--color-clay)]" : ""
        }`}
      >
        {/* Drag from the grip only: the row body is already a button that opens
            the editor, so a whole-row drag surface would fight it. */}
        <span
          {...handleProps}
          aria-hidden="true"
          className="flex min-h-11 w-7 shrink-0 cursor-grab items-center justify-center text-sand-dark transition-colors duration-200 hover:text-slate-light active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </span>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left transition-colors duration-200 hover:bg-oatmeal/50"
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="text-sm font-semibold text-charcoal">{name}</span>
            <span className="ml-2 text-xs text-slate-light">{summary}</span>
          </span>
          {!service.active && (
            <span className="shrink-0 rounded-full bg-oatmeal px-2.5 py-0.5 text-xs font-medium text-slate-light">
              {t("cmsInactive", lang)}
            </span>
          )}
        </button>

        {/* Arrows, not chevrons: a chevron reads as "expand", and three of them
            in a row gave no clue which one moved the service and which opened
            it. */}
        <div className="flex shrink-0 items-center pr-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={t("cmsMoveUp", lang)}
            className="flex min-h-11 w-9 items-center justify-center rounded-xl text-slate-light transition-colors duration-200 hover:bg-oatmeal hover:text-charcoal disabled:pointer-events-none disabled:opacity-25"
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={t("cmsMoveDown", lang)}
            className="flex min-h-11 w-9 items-center justify-center rounded-xl text-slate-light transition-colors duration-200 hover:bg-oatmeal hover:text-charcoal disabled:pointer-events-none disabled:opacity-25"
          >
            <ArrowDown size={16} />
          </button>
        </div>
      </div>

      {open && (
        <ServiceEditorModal
          service={service}
          title={name}
          onClose={() => setOpen(false)}
          onChanged={() => {
            setOpen(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

// The editing form, in a modal. Mounted only while open, so its state re-seeds
// from the freshest service row each time and abandoned edits die on close.
function ServiceEditorModal({
  service,
  title,
  onClose,
  onChanged,
}: {
  service: CatalogService;
  title: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { lang } = useLanguage();
  // Per-language name map, seeded from the stored translations.
  const [names, setNames] = useState<Record<string, string>>(() => ({ ...service.name_i18n }));
  const [showTranslations, setShowTranslations] = useState(false);
  const [active, setActive] = useState(service.active);
  // null (all offered) seeds every level checked.
  const [pressureLevels, setPressureLevels] = useState<PressureLevel[]>(
    () => (service.pressure_levels as PressureLevel[] | null) ?? ALL_PRESSURE_LEVELS,
  );
  const [durations, setDurations] = useState<ServiceDurationRow[]>(service.durations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes, matching what a manager expects of any dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      .update({
        name_i18n: nameI18n,
        active,
        // All four checked stores as null, keeping the "all offered" row
        // canonical (matches bundled/imported services, which insert null).
        pressure_levels:
          pressureLevels.length === ALL_PRESSURE_LEVELS.length ? null : pressureLevels,
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

  function togglePressureLevel(level: PressureLevel) {
    setPressureLevels((prev) => {
      const isOn = prev.includes(level);
      // Unchecking the last remaining level is a no-op — a service must offer
      // at least one (the DB CHECK constraint is the backstop for this).
      if (isOn && prev.length === 1) return prev;
      return isOn ? prev.filter((l) => l !== level) : [...prev, level];
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-soft sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close", lang)}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-slate-light hover:bg-oatmeal"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 pr-12 font-serif text-2xl text-charcoal">{title}</h2>

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
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-light">
          {t("cmsPressureLevels", lang)}
        </div>
        <p className="mb-2 text-xs text-slate-light">{t("cmsPressureLevelsHint", lang)}</p>
        <div className="flex flex-wrap gap-2">
          {ALL_PRESSURE_LEVELS.map((level) => {
            const isOn = pressureLevels.includes(level);
            return (
              <button
                key={level}
                type="button"
                onClick={() => togglePressureLevel(level)}
                aria-pressed={isOn}
                className={`min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                  isOn
                    ? "border-sage bg-sage-tint text-sage-dark"
                    : "border-sand bg-cream text-slate-light"
                }`}
              >
                {pressureTranslations[level][lang]}
              </button>
            );
          })}
        </div>
      </div>

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
            {/* These are all short numeric fields, so the columns are sized to
                their content rather than to an input's ~170px intrinsic width —
                which is what used to push this table into a horizontal scroll
                inside the modal. min-w only bites on a genuinely tiny phone. */}
            <div className="grid min-w-[19rem] grid-cols-[3.75rem_1fr_2.5rem_1fr_1.5rem] items-center gap-x-2 gap-y-1.5">
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
                    className={numCellClass}
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
                    className={numCellClass}
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
                    className={`${numCellClass} disabled:opacity-40`}
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

      <div className="mt-6 flex items-center gap-3 border-t border-sand pt-5">
        <label className="flex items-center gap-2 text-sm text-slate">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("cmsActive", lang)}
        </label>
        <div className="flex-1" />
        <button type="button" onClick={remove} disabled={busy} className="text-sm text-rose-dark hover:underline">
          {t("cmsDelete", lang)}
        </button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t("cancel", lang)}
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? t("saving", lang) : t("save", lang)}
        </Button>
      </div>
      </div>
    </div>
  );
}

const inputClass =
  "min-h-11 rounded-xl border border-sand bg-cream px-3 text-charcoal outline-none focus:border-sage";

// Compact variant for the durations table: numeric fields only, so it trades
// the full-size input's padding and intrinsic width for a table that fits
// without scrolling. min-w-0 is what actually lets the 1fr columns shrink.
const numCellClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-sand bg-cream px-2 text-sm tabular-nums text-charcoal outline-none focus:border-sage";

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
