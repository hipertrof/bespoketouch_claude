import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Plus, ScrollText, Search, Star, Tag as TagIcon, Trash2, UserRound, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  addCrmNote,
  assignCrmTag,
  createCrmTag,
  deleteCrmNote,
  deleteCrmTag,
  exportCrmErasures,
  exportCrmGuest,
  exportCrmGuestList,
  forgetCrmGuest,
  getCrmGuest,
  listCrmDuplicates,
  listCrmErasures,
  listCrmGuests,
  listCrmTags,
  lookupCrmConsentByPhone,
  recordCrmRefusal,
  unassignCrmTag,
  withdrawCrmConsent,
  type CrmConsent,
  type CrmConsentLookup,
  type CrmDuplicateGroup,
  type CrmErasureEntry,
  type CrmErasureFilters,
  type CrmFilters,
  type CrmGuestDetail,
  type CrmGuestListItem,
  type CrmRefusalGround,
  type CrmSegment,
  type CrmSort,
  type CrmTag,
} from "../../lib/crm";
import {
  communicationTranslations,
  pressureTranslations,
  t,
  tf,
  zoneTranslations,
} from "../../i18n/translations";
import {
  comfortLabel,
  defaultComfortConfig,
  findComfortOption,
  type ComfortSection,
} from "../../lib/comfort";
import type { StoredPreferences } from "../../lib/guestProfile";
import type { ZoneId } from "../../types";
import { Button } from "../Button";
import { DashboardShell } from "../DashboardShell";
import { SubscriptionBanner } from "../billing/SubscriptionBanner";

// Guest 360 dashboard (/guests). Manager-and-up only — enforced twice: this
// route gates on canManage (cosmetic), and /api/crm re-checks the caller's
// owner/manager membership per request (the real boundary; every CRM table is
// service-role-only).
//
// Sorting, segmenting and the tag filter are all SERVER-side (see
// _crmCore.listGuests): they run over aggregates computed across the whole
// account, not over the page in hand. Do not reintroduce a client-side
// filter — the previous one ran over 50 rows and silently missed every match
// past them.
//
// Since consent v4 the display name rides on base consent, so essentially
// every row has one. Rows without a name are legacy (saved before v4, under a
// copy that did not cover the name) and get a stable "Gość #XXXX" handle
// derived from their id, so they can still be told apart, searched by phone,
// and confirmed against when erasing.

type Lang = Parameters<typeof t>[1];

const PAGE = 50;

const SORTS: { value: CrmSort; key: string }[] = [
  { value: "lastVisit", key: "guestsSortLastVisit" },
  { value: "visits", key: "guestsSortVisits" },
  { value: "spend", key: "guestsSortSpend" },
  { value: "name", key: "guestsSortName" },
  { value: "newest", key: "guestsSortNewest" },
];

const SEGMENTS: { value: CrmSegment; key: string }[] = [
  { value: "all", key: "guestsSegAll" },
  { value: "regulars", key: "guestsSegRegulars" },
  { value: "new", key: "guestsSegNew" },
  { value: "lapsed", key: "guestsSegLapsed" },
];

// Only the two consents that actually vary. Base is deliberately absent — a
// profile cannot exist without it, so it always matches every row, and a
// filter that never narrows anything is not a filter. (CrmConsent/the
// server action still accept "base" for completeness; this UI just never
// offers it.)
const CONSENTS: { value: CrmConsent; key: string }[] = [
  { value: "health", key: "guestsConsentHealth" },
  { value: "marketing", key: "guestsConsentMarketing" },
];

// One accent hue per tier — the theme only has three (clay/sage/rose). Health
// keeps the terracotta dot/pill it already had; marketing gets rose. `base`
// stays in this map (unused by the UI) only because the Record<CrmConsent,…>
// type requires every tier to have an entry. Purely a colour key, not a
// good/bad signal — the filter pill and the row dot share a colour so the two
// are visibly the same thing, and each dot carries its tier name in a
// title/aria-label since colour alone must never be the only cue.
const CONSENT_COLORS: Record<CrmConsent, { dot: string; activePill: string }> = {
  base: { dot: "bg-sage", activePill: "border-sage bg-sage-tint font-medium text-sage-dark" },
  health: { dot: "bg-clay", activePill: "border-clay bg-clay/10 font-medium text-clay-dark" },
  marketing: { dot: "bg-rose", activePill: "border-rose bg-rose-tint font-medium text-rose-dark" },
};

interface AccountLite {
  id: string;
  name: string;
}

type Query = Required<Omit<CrmFilters, "consents">> & { consents: CrmConsent[] };

const EMPTY_QUERY: Query = {
  search: "",
  sort: "lastVisit",
  segment: "all",
  tagId: "",
  consents: [],
};

// The ONE place the screen's state turns into endpoint filters. Both the list
// and the CSV export go through it, because the export's entire promise is
// that it matches the list on screen — and when `load` built this object by
// hand it quietly dropped `consents`, so the two disagreed.
function toFilters(q: Query): CrmFilters {
  return {
    search: q.search || undefined,
    sort: q.sort,
    segment: q.segment,
    consents: q.consents,
    tagId: q.tagId || undefined,
  };
}

// Semicolons, not commas: Polish Excel splits on `;` by default, and a comma
// file opens as one column per row. The BOM is what makes Excel read the
// accents as UTF-8 instead of mangling "Zofia Kowalczyk".
function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // The BOM is written as an escape, not as a literal character — an
  // invisible byte in source is the kind of thing an editor silently eats.
  const bom = "\uFEFF";
  return bom + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

// ---------------------------------------------------------------------------
// Formatting — every one of these takes `lang`. The screen previously called
// toLocaleDateString() with no locale at five sites, so a Polish UI printed
// American dates, including on the consent stamp that evidences WHEN a guest
// consented and to which version.
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleDateString(lang, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
}

function fmtMoney(value: number, lang: Lang): string {
  return `${value.toLocaleString(lang)} zł`;
}

function displayNameOf(guest: { id: string; name: string | null }, lang: Lang): string {
  return guest.name ?? tf("guestsAnonymousHandle", lang, { code: guest.id.slice(0, 4).toUpperCase() });
}

export function GuestCrmDashboard() {
  const { user, loading, canManage, memberships, rolesReady } = useAuth();
  // Receptionist and above may reach the consent desk (phone lookup +
  // withdrawal only); full guest history/notes/export/forget stay
  // manager-and-up. Therapist has neither.
  const isFrontDesk = memberships.some((m) => m.role === "frontdesk");
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState("");
  const [guests, setGuests] = useState<CrmGuestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [query, setQuery] = useState<Query>(EMPTY_QUERY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // The selected guest lives in the URL, not in state: browser back works, a
  // manager can bookmark or share a guest mid-GDPR-request, and a refresh
  // doesn't dump them back at the top of the list. Mirrors StaffManagement's
  // ?account= precedent.
  const selectedId = searchParams.get("guest");
  const selectGuest = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("guest", id);
          else next.delete("guest");
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);
  useEffect(() => {
    if (rolesReady && !canManage && !isFrontDesk) navigate("/queue");
  }, [rolesReady, canManage, isFrontDesk, navigate]);

  // Accounts the caller can see (RLS-scoped read, same approach as /reports'
  // locations query). Managers usually have exactly one.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("accounts")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        const all = (data as AccountLite[]) ?? [];
        setAccounts(all);
        if (all.length > 0) setAccountId((prev) => prev || all[0].id);
      });
  }, [user]);

  const load = useCallback(async (acct: string, q: Query, offset: number) => {
    setBusy(true);
    setError(null);
    try {
      const page = await listCrmGuests(acct, { ...toFilters(q), limit: PAGE, offset });
      setGuests((prev) => (offset === 0 ? page.guests : [...prev, ...page.guests]));
      setTotal(page.total);
      setCapped(page.capped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, []);

  // Filters and sort apply immediately; only the free-text search waits for
  // submit (a keystroke-per-request would hammer the endpoint). Guarded by
  // canManage: front desk isn't authorized for `list`/`listTags` at all, and
  // firing them anyway would just paint a 403 into the error banner.
  useEffect(() => {
    if (accountId && canManage) load(accountId, query, 0);
  }, [accountId, canManage, query, load]);

  useEffect(() => {
    if (!accountId || !canManage) return;
    listCrmTags(accountId).then(setTags).catch(() => {});
  }, [accountId, canManage]);

  const refreshTags = useCallback(() => {
    if (accountId) listCrmTags(accountId).then(setTags).catch(() => {});
  }, [accountId]);

  const tagById = useMemo(() => new Map(tags.map((tg) => [tg.id, tg])), [tags]);

  const handleAccountChange = (next: string) => {
    setAccountId(next);
    // Reset the whole query — carrying a filter across tenants silently shows
    // the new account through the old account's lens.
    setQuery(EMPTY_QUERY);
    setSearchInput("");
    setGuests([]);
    selectGuest(null);
  };

  // Downloads exactly what the current filters produced — the endpoint runs
  // the same pipeline as the list, unpaginated. Contact columns are null in
  // the database without marketing consent, so filtering on that consent is
  // what turns this into a mailable list.
  const handleExportList = async () => {
    setBusy(true);
    setError(null);
    try {
      const rows = await exportCrmGuestList(accountId, toFilters(query));
      const header = [
        t("guestsSortName", lang),
        t("guestsCsvPhone", lang),
        t("guestsCsvEmail", lang),
        t("guestsCsvBirthday", lang),
        t("guestsColVisits", lang),
        t("guestsColSpend", lang),
        t("guestsColLastVisit", lang),
        t("guestsConsentFilterLabel", lang),
        t("guestsTags", lang),
      ];
      const body = rows.map((r) => [
        displayNameOf(r, lang),
        r.contactPhone ?? "",
        r.contactEmail ?? "",
        r.birthday ?? "",
        String(r.visitCount),
        String(r.totalSpend),
        r.lastVisitAt ? fmtDate(r.lastVisitAt, lang) : "",
        [
          t("guestsConsentBase", lang),
          r.healthConsent ? t("guestsConsentHealth", lang) : "",
          r.marketingConsent ? t("guestsConsentMarketing", lang) : "",
        ]
          .filter(Boolean)
          .join(", "),
        r.tagIds.map((id) => tagById.get(id)?.name).filter(Boolean).join(", "),
      ]);
      const url = URL.createObjectURL(
        new Blob([toCsv([header, ...body])], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("guestsNav", lang).toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      const msg = tf("guestsExportListDone", lang, { count: String(rows.length) });
      setFlash(msg);
      setAnnouncement(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !rolesReady) {
    return <div className="flex min-h-screen items-center justify-center bg-cream text-slate">{t("loading", lang)}</div>;
  }
  if (!user) return null;

  return (
    <DashboardShell title={t("guestsTitle", lang)}>
      <SubscriptionBanner />

      {/* Announcements for screen readers: tag changes, saves and erasures are
          otherwise silent DOM mutations. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {flash && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-sage bg-sage-tint px-4 py-3">
          <p className="text-sm text-sage-dark">{flash}</p>
          <button onClick={() => setFlash(null)} className="text-xs text-sage-dark hover:underline">
            {t("guestsDismiss", lang)}
          </button>
        </div>
      )}

      {/* A dismissible banner, never an early return: a failed tag write must
          not replace the whole screen with one line of red text. */}
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-dark/40 bg-white px-4 py-3">
          <p className="text-sm text-rose-dark">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-rose-dark hover:underline">
            {t("guestsDismiss", lang)}
          </button>
        </div>
      )}

      {accounts.length > 1 && (
        <div className="mb-4">
          <label htmlFor="crmAccount" className="mb-1.5 block text-xs font-semibold text-slate">
            {t("guestsAccountLabel", lang)}
          </label>
          <select
            id="crmAccount"
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="min-h-10 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {!canManage ? (
        // Front desk stops here: consent lookup + withdrawal only, none of
        // the manager-and-up dashboard below it.
        <ConsentDesk accountId={accountId} lang={lang} />
      ) : selectedId ? (
        <GuestDetailPanel
          accountId={accountId}
          guestId={selectedId}
          tags={tags}
          lang={lang}
          onBack={() => {
            selectGuest(null);
            load(accountId, query, 0);
          }}
          onFlash={(msg) => {
            setFlash(msg);
            setAnnouncement(msg);
          }}
          onForgotten={(msg) => {
            setFlash(msg);
            setAnnouncement(msg);
            selectGuest(null);
            load(accountId, query, 0);
          }}
        />
      ) : (
        <>
          {/* Sits ABOVE the guest list, not inside it: the register is about
              people who are gone, and burying a compliance record a manager
              reaches for under regulator pressure behind the browsing UI is
              exactly how it fails to be found. */}
          <ErasureRegister accountId={accountId} lang={lang} />
          {/* Same altitude as the register, and for the same reason: this is a
              fact about the account's data, not about whichever guest is
              selected, so it must not be buried inside the browse UI. */}
          <DuplicatesPanel
            accountId={accountId}
            lang={lang}
            onSelectGuest={selectGuest}
          />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery((q) => ({ ...q, search: searchInput.trim() }));
            }}
            className="mb-5 flex flex-wrap items-end gap-2"
          >
            <div>
              <label htmlFor="crmSearch" className="mb-1.5 block text-xs font-semibold text-slate">
                {t("guestsSearch", lang)}
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-sand bg-white px-3">
                <Search size={16} className="text-slate-light" />
                <input
                  id="crmSearch"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("guestsSearchPlaceholder", lang)}
                  className="min-h-10 w-56 bg-transparent text-sm text-charcoal outline-none"
                />
              </div>
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>
              {t("guestsSearch", lang)}
            </Button>
            <div>
              <label htmlFor="crmSort" className="mb-1.5 block text-xs font-semibold text-slate">
                {t("guestsSortLabel", lang)}
              </label>
              <select
                id="crmSort"
                value={query.sort}
                onChange={(e) => setQuery((q) => ({ ...q, sort: e.target.value as CrmSort }))}
                className="min-h-10 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{t(s.key, lang)}</option>
                ))}
              </select>
            </div>
            {tags.length > 0 && (
              <div>
                <label htmlFor="crmTagFilter" className="mb-1.5 block text-xs font-semibold text-slate">
                  {t("guestsTagFilterLabel", lang)}
                </label>
                <select
                  id="crmTagFilter"
                  value={query.tagId}
                  onChange={(e) => setQuery((q) => ({ ...q, tagId: e.target.value }))}
                  className="min-h-10 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal"
                >
                  <option value="">{t("guestsAllTags", lang)}</option>
                  {tags.map((tg) => (
                    <option key={tg.id} value={tg.id}>{tg.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => setTagManagerOpen((v) => !v)}
              aria-expanded={tagManagerOpen}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal transition-colors hover:border-clay"
            >
              <TagIcon size={14} />
              {t("guestsManageTags", lang)}
            </button>
          </form>

          {/* One filter row. The two halves behave differently on purpose —
              the segments are a single choice (a guest is new OR lapsed), the
              consents are independent toggles that AND together — so they are
              styled differently and split by a divider rather than pretending
              to be one uniform set. */}
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-slate">
              {t("guestsFiltersLabel", lang)}
            </span>
            {SEGMENTS.map((s) => {
              const active = query.segment === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setQuery((q) => ({ ...q, segment: s.value }))}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    active
                      ? "border-clay bg-clay/10 font-medium text-charcoal"
                      : "border-sand bg-white text-slate-light hover:border-clay"
                  }`}
                >
                  {t(s.key, lang)}
                </button>
              );
            })}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-sand" />
            {CONSENTS.map((c) => {
              const active = query.consents.includes(c.value);
              return (
                <button
                  key={c.value}
                  onClick={() =>
                    setQuery((q) => ({
                      ...q,
                      consents: active
                        ? q.consents.filter((x) => x !== c.value)
                        : [...q.consents, c.value],
                    }))
                  }
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    active ? CONSENT_COLORS[c.value].activePill : "border-sand bg-white text-slate-light hover:border-clay"
                  }`}
                >
                  {t(c.key, lang)}
                </button>
              );
            })}
          </div>

          {/* Tag vocabulary lives here, at account level, because that is what
              it is: creating or deleting a tag affects every guest. Assigning
              one to a guest stays inside that guest. The trigger button sits
              next to the tag filter select above; only the panel renders
              here, controlled by that same open state. */}
          {tagManagerOpen && (
            <TagManager
              accountId={accountId}
              tags={tags}
              lang={lang}
              onChanged={() => {
                refreshTags();
                load(accountId, query, 0);
              }}
              onError={setError}
            />
          )}

          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-sand/60 pb-4">
            <p className="text-sm text-slate">{tf("guestsCountLabel", lang, { count: String(total) })}</p>
            {capped && <p className="text-xs text-slate-light">{t("guestsCapped", lang)}</p>}
            {total > 0 && (
              <button
                onClick={handleExportList}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-sand bg-white px-3 py-1.5 text-sm text-charcoal transition-colors hover:border-clay disabled:opacity-50"
              >
                <Download size={14} />
                {t("guestsExportList", lang)}
              </button>
            )}
          </div>

          {guests.length === 0 ? (
            <p className="text-slate">
              {busy
                ? t("loading", lang)
                : query.search || query.segment !== "all" || query.tagId || query.consents.length > 0
                  ? t("guestsNoResults", lang)
                  : t("guestsEmpty", lang)}
            </p>
          ) : (
            <>
              {/* Column headings for the dense rows below — the house idiom
                  from TherapistQueue/StaffManagement, ~3× the guests per
                  viewport of the old 72px cards. */}
              <div className="hidden items-center gap-3 px-4 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-light sm:flex">
                <span className="min-w-0 flex-1">{t("guestsSortName", lang)}</span>
                <span className="w-16 text-right">{t("guestsColVisits", lang)}</span>
                <span className="w-24 text-right">{t("guestsColSpend", lang)}</span>
                <span className="w-28 text-right">{t("guestsColLastVisit", lang)}</span>
                <span className="w-16" />
              </div>
              <ul className="flex flex-col gap-1">
                {guests.map((g) => (
                  <li key={g.id} className="rounded-xl border border-sand bg-white shadow-soft">
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <button
                        onClick={() => selectGuest(g.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
                          <UserRound size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-charcoal">
                              {displayNameOf(g, lang)}
                            </span>
                            {/* One dot per consent tier in CONSENTS (health +
                                marketing — base excluded up there since it
                                always matches), same colour as its filter
                                pill. Colour is never the only cue: each dot
                                names its tier. */}
                            <span className="flex shrink-0 items-center gap-1">
                              {CONSENTS.filter((c) => g[`${c.value}Consent`]).map((c) => (
                                <span
                                  key={c.value}
                                  title={t(c.key, lang)}
                                  aria-label={t(c.key, lang)}
                                  className={`h-1.5 w-1.5 rounded-full ${CONSENT_COLORS[c.value].dot}`}
                                />
                              ))}
                            </span>
                          </span>
                        </span>
                      </button>
                      <span className="hidden w-16 shrink-0 text-right text-sm tabular-nums text-charcoal sm:block">
                        {g.visitCount}
                      </span>
                      <span className="hidden w-24 shrink-0 text-right text-sm tabular-nums text-charcoal sm:block">
                        {g.totalSpend > 0 ? fmtMoney(g.totalSpend, lang) : "—"}
                      </span>
                      <span className="hidden w-28 shrink-0 text-right text-sm tabular-nums text-slate-light sm:block">
                        {fmtDate(g.lastVisitAt, lang)}
                      </span>
                    </div>
                    {/* The columns collapse below sm, so restate them inline. */}
                    <div className="flex flex-wrap gap-x-3 border-t border-sand/60 px-4 py-1.5 text-xs text-slate-light sm:hidden">
                      <span>{tf("guestsVisitCount", lang, { count: String(g.visitCount) })}</span>
                      {g.totalSpend > 0 && <span>{fmtMoney(g.totalSpend, lang)}</span>}
                      <span>{fmtDate(g.lastVisitAt, lang)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {guests.length < total && (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => load(accountId, query, guests.length)}
                  >
                    {t("guestsShowMore", lang)}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </DashboardShell>
  );
}

// Receptionist-and-up view of /guests: find a guest by the phone they're
// calling from and withdraw a consent tier. Nothing else about the guest
// (visits, notes, spend, tags) is fetched or shown — the server enforces the
// same narrowing (see api/_crmCore.ts's authorizeStaff), this is just the UI
// side of that boundary.
function ConsentDesk({ accountId, lang }: { accountId: string; lang: Lang }) {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "looking" | "found" | "missing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<CrmConsentLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBase, setConfirmBase] = useState(false);
  const [baseConfirmName, setBaseConfirmName] = useState("");
  const [confirmTier, setConfirmTier] = useState<"health" | "marketing" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!phone.trim() || !accountId) return;
    setStatus("looking");
    setErrorMsg(null);
    setResult(null);
    setDone(null);
    setConfirmBase(false);
    setConfirmTier(null);
    try {
      const json = await lookupCrmConsentByPhone(accountId, phone.trim());
      setResult(json);
      setStatus(json.found ? "found" : "missing");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error");
      setStatus("error");
    }
  };

  const displayName =
    result?.name ?? (result?.guestId ? tf("guestsAnonymousHandle", lang, { code: result.guestId.slice(0, 4).toUpperCase() }) : "");

  const withdrawBase = async () => {
    if (!result?.guestId || baseConfirmName.trim() !== displayName) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await withdrawCrmConsent(accountId, result.guestId, { base: true });
      setDone(tf("guestsForgetDone", lang, { name: displayName }));
      setResult(null);
      setStatus("idle");
      setPhone("");
      setConfirmBase(false);
      setBaseConfirmName("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const withdrawTier = async (tier: "health" | "marketing") => {
    if (!result?.guestId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await withdrawCrmConsent(accountId, result.guestId, { [tier]: true });
      setResult((r) =>
        r?.consent
          ? { ...r, consent: { ...r.consent, [tier]: { version: null, at: null } } }
          : r,
      );
      setConfirmTier(null);
      setDone(tf("consentDeskTierWithdrawn", lang, { tier: t(`guestsConsent${tier === "health" ? "Health" : "Marketing"}`, lang) }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const tierRow = (
    key: "health" | "marketing",
    label: string,
    stamp: { version: string | null; at: string | null } | undefined,
  ) => {
    const active = !!stamp?.version;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-oatmeal/40 p-3">
        <span className="text-sm font-medium text-charcoal">{label}</span>
        {!active ? (
          <span className="text-xs text-slate-light">{t("consentDeskAlreadyOff", lang)}</span>
        ) : confirmTier === key ? (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-rose-dark">{t("consentDeskWithdrawTierConfirm", lang)}</span>
            <button
              onClick={() => withdrawTier(key)}
              disabled={busy}
              className="font-semibold text-rose-dark hover:underline disabled:opacity-50"
            >
              {t("guestsConfirmDelete", lang)}
            </button>
            <button onClick={() => setConfirmTier(null)} className="text-slate-light hover:underline">
              {t("guestsCancel", lang)}
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmTier(key)} className="text-xs font-medium text-rose-dark hover:underline">
            {t("consentDeskWithdraw", lang)}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-sm text-slate">{t("consentDeskIntro", lang)}</p>

      {done && (
        <div className="mb-4 rounded-xl border border-sage bg-sage-tint px-4 py-3">
          <p className="text-sm text-sage-dark">{done}</p>
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-dark/40 bg-white px-4 py-3">
          <p className="text-sm text-rose-dark">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="text-xs text-rose-dark hover:underline">
            {t("guestsDismiss", lang)}
          </button>
        </div>
      )}

      <form onSubmit={search} className="mb-5 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="consentDeskPhone" className="mb-1.5 block text-xs font-semibold text-slate">
            {t("consentDeskPhoneLabel", lang)}
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-sand bg-white px-3">
            <Search size={16} className="text-slate-light" />
            <input
              id="consentDeskPhone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="min-h-10 w-56 bg-transparent text-sm text-charcoal outline-none"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary" disabled={status === "looking" || !phone.trim()}>
          {t("consentDeskSearch", lang)}
        </Button>
      </form>

      {status === "looking" && <p className="text-slate">{t("loading", lang)}</p>}
      {status === "missing" && <p className="text-slate">{t("consentDeskNotFound", lang)}</p>}

      {status === "found" && result?.consent && (
        <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
          <h2 className="mb-4 font-serif text-xl text-charcoal">{displayName}</h2>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-oatmeal/40 p-3">
              <span className="text-sm font-medium text-charcoal">{t("guestsConsentBase", lang)}</span>
              {confirmBase ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <label htmlFor="consentDeskBaseConfirm" className="sr-only">
                    {t("guestsForgetInputLabel", lang)}
                  </label>
                  <input
                    id="consentDeskBaseConfirm"
                    value={baseConfirmName}
                    onChange={(e) => setBaseConfirmName(e.target.value)}
                    placeholder={displayName}
                    className="min-h-9 flex-1 rounded-lg border border-sand bg-white px-2.5 text-sm text-charcoal outline-none focus:border-clay"
                  />
                  <button
                    onClick={withdrawBase}
                    disabled={busy || baseConfirmName.trim() !== displayName}
                    className="text-xs font-semibold text-rose-dark hover:underline disabled:opacity-50"
                  >
                    {t("guestsConfirmDelete", lang)}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmBase(false);
                      setBaseConfirmName("");
                    }}
                    className="text-xs text-slate-light hover:underline"
                  >
                    {t("guestsCancel", lang)}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmBase(true)}
                  className="text-xs font-medium text-rose-dark hover:underline"
                >
                  {t("consentDeskWithdraw", lang)}
                </button>
              )}
            </div>
            {confirmBase && (
              <p className="text-xs text-rose-dark">
                {tf("guestsForgetConfirm", lang, { name: displayName })}
              </p>
            )}
            {tierRow("health", t("guestsConsentHealth", lang), result.consent.health)}
            {tierRow("marketing", t("guestsConsentMarketing", lang), result.consent.marketing)}
          </div>
          {/* Only a whole-profile erasure can be refused — a tier withdrawal is
              Art. 7(3) and cannot be declined — so this sits below the rows
              rather than inside one. */}
          {result.guestId && (
            <div className="mt-4 border-t border-sand pt-4">
              <RefusalForm
                accountId={accountId}
                guestId={result.guestId}
                displayName={displayName}
                channel="consent_desk"
                lang={lang}
                onDone={(msg) => {
                  setErrorMsg(null);
                  setDone(msg);
                }}
                onError={setErrorMsg}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Records a REFUSED erasure request (Art. 17(3)). Shared by both surfaces —
// the manager's RODO card and the front desk's consent desk — so the copy,
// the grounds list and the validation cannot drift between them; only the
// `channel` differs, and the server decides what that means.
//
// This is the one control in the CRM that changes no guest data. It is
// therefore styled neutral rather than rose: the RODO card groups its controls
// by risk, and refusing is not a destructive act. What it writes is one
// erasure_log row, which is also why a failed write is surfaced as a failure
// rather than swallowed — there is no other outcome to fall back on.
const REFUSAL_GROUNDS: { value: CrmRefusalGround; key: string }[] = [
  { value: "legal_obligation", key: "erasureGroundLegalObligation" },
  { value: "legal_claims", key: "erasureGroundLegalClaims" },
  { value: "contract", key: "erasureGroundContract" },
  { value: "other", key: "erasureGroundOther" },
];

function RefusalForm({
  accountId,
  guestId,
  displayName,
  channel,
  lang,
  onDone,
  onError,
}: {
  accountId: string;
  guestId: string;
  displayName: string;
  channel: "dashboard" | "consent_desk";
  lang: Lang;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ground, setGround] = useState<CrmRefusalGround>("legal_obligation");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const { logged } = await recordCrmRefusal(accountId, guestId, {
        ground,
        reason: reason.trim(),
        channel,
      });
      if (!logged) {
        // The log write IS the operation here, so a failure leaves nothing
        // behind and the staffer has to fall back to their own paperwork.
        onError(t("erasureRefuseNotLogged", lang));
        return;
      }
      setOpen(false);
      setReason("");
      onDone(tf("erasureRefuseDone", lang, { name: displayName }));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sand px-3 text-sm font-medium text-slate transition-colors hover:bg-oatmeal/40"
      >
        <FileText size={16} />
        {t("erasureRefuse", lang)}
      </button>
      {open && (
        <div className="mt-4 w-full rounded-xl border border-sand bg-oatmeal/30 p-4">
          <h4 className="mb-1 text-sm font-semibold text-charcoal">{t("erasureRefuseTitle", lang)}</h4>
          <p className="mb-4 text-xs text-slate">{t("erasureRefuseIntro", lang)}</p>

          <label htmlFor="crmRefusalGround" className="mb-1.5 block text-xs font-semibold text-charcoal">
            {t("erasureRefuseGround", lang)}
          </label>
          <select
            id="crmRefusalGround"
            value={ground}
            onChange={(e) => setGround(e.target.value as CrmRefusalGround)}
            className="mb-4 min-h-10 w-full rounded-xl border border-sand bg-white px-3 text-sm text-charcoal outline-none focus:border-clay"
          >
            {REFUSAL_GROUNDS.map((g) => (
              <option key={g.value} value={g.value}>
                {t(g.key, lang)}
              </option>
            ))}
          </select>

          <label htmlFor="crmRefusalReason" className="mb-1.5 block text-xs font-semibold text-charcoal">
            {t("erasureRefuseReason", lang)}
          </label>
          <textarea
            id="crmRefusalReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t("erasureRefusePlaceholder", lang)}
            className="mb-3 w-full rounded-xl border border-sand bg-white p-3 text-sm text-charcoal outline-none focus:border-clay"
          />

          {/* The app cannot send anything, and Art. 12(4) still requires the
              guest to be told. Saying so here beats a silent gap. */}
          <p className="mb-4 text-xs text-slate-light">{t("erasureRefuseHint", lang)}</p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} disabled={busy || !reason.trim()}>
              {t("erasureRefuseSubmit", lang)}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("guestsCancel", lang)}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// The spa's own Art. 5(2) accountability record, readable at last. 0030 wrote
// erasure_log with no way to read it back, which meant producing the register
// for UODO needed OUR help — the opposite of the controller/processor split
// the policy document asserts.
//
// Stays pseudonymous on purpose: `reference` is a truncated one-way hash, and
// finding one person's entry means SEARCHING their phone, which is hashed
// server-side. That is not a limitation worked around — Art. 5(1)(c) and
// Art. 32 both favour it, and Art. 5(2) asks for proof the process ran, not a
// readable list of who asked.
const ERASURE_CHANNEL_KEYS: Record<string, string> = {
  dashboard: "erasureChannelDashboard",
  consent_desk: "erasureChannelConsentDesk",
  kiosk: "erasureChannelKiosk",
  checkin: "erasureChannelCheckin",
  retention: "erasureChannelRetention",
  previsit: "erasureChannelPrevisit",
};

const ERASURE_OUTCOME_KEYS: Record<string, string> = {
  completed: "erasureOutcomeCompleted",
  partial: "erasureOutcomePartial",
  refused: "erasureOutcomeRefused",
};

const ERASURE_OUTCOMES = ["completed", "partial", "refused"] as const;

function erasureChannelLabel(v: string | null, lang: Lang): string {
  const key = v ? ERASURE_CHANNEL_KEYS[v] : undefined;
  return key ? t(key, lang) : (v ?? "—");
}

function erasureOutcomeLabel(v: string | null, lang: Lang): string {
  const key = v ? ERASURE_OUTCOME_KEYS[v] : undefined;
  return key ? t(key, lang) : (v ?? "—");
}

// A full erasure gets one readable phrase; anything narrower prints the raw
// scope tokens, which are the column names an auditor would be reconciling
// against anyway.
function erasureScopeLabel(scope: string[], lang: Lang): string {
  if (scope.length === 0) return "—";
  if (scope.length >= 7) return t("erasureScopeAll", lang);
  return scope.join(", ");
}

// Where a number carries more than one profile. Sits beside the erasure
// register rather than inside the guest list, for the same reason: it is a
// property of the ACCOUNT's data, not of whichever guest happens to be on
// screen, and a manager comes looking for it deliberately.
//
// It only shows and links. Deciding two records are one person, and folding
// them together, is the merge tool — a one-way, destructive operation that
// belongs behind its own confirmation, not one click from a browse view.
function DuplicatesPanel({
  accountId,
  lang,
  onSelectGuest,
}: {
  accountId: string;
  lang: Lang;
  onSelectGuest: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<CrmDuplicateGroup[]>([]);
  const [capped, setCapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await listCrmDuplicates(accountId);
      setGroups(res.groups);
      setCapped(res.capped);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!loaded) void load();
        }}
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sand bg-white px-3 text-sm font-medium text-charcoal transition-colors hover:border-clay"
      >
        <Users size={16} className="text-slate-light" />
        {t("duplicatesPanel", lang)}
        {loaded && groups.length > 0 && (
          <span className="rounded-full bg-clay-tint px-2 py-0.5 text-xs font-semibold text-clay-dark">
            {groups.length}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-sand bg-white p-5 shadow-soft">
          <p className="mb-4 max-w-3xl text-xs text-slate">{t("duplicatesIntro", lang)}</p>

          {error && (
            <p className="mb-3 rounded-xl bg-rose-tint px-3 py-2 text-xs font-medium text-rose-dark">
              {error}
            </p>
          )}
          {busy && <p className="text-xs text-slate-light">…</p>}
          {!busy && loaded && groups.length === 0 && (
            <p className="text-sm text-slate-light">{t("duplicatesNone", lang)}</p>
          )}

          <div className="flex flex-col gap-3">
            {groups.map((group, gi) => (
              // Index key: the grouping value is the hashed phone and stays
              // server-side, so there is no stable id to key on here — and the
              // list is replaced wholesale on every load, never reordered.
              <div key={gi} className="rounded-xl border border-sand bg-oatmeal/30 p-3">
                <p className="mb-2 text-xs font-semibold text-slate">
                  {t("duplicatesSharedNumber", lang)}
                </p>
                <div className="flex flex-col gap-1.5">
                  {group.guests.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onSelectGuest(g.id)}
                      className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border border-sand bg-white px-3 py-2 text-left transition-colors hover:border-clay"
                    >
                      <span className="text-sm font-semibold text-charcoal">
                        {g.name ??
                          tf("guestsAnonymousHandle", lang, {
                            code: g.id.slice(0, 4).toUpperCase(),
                          })}
                      </span>
                      <span className="text-xs text-slate-light">
                        {g.visitCount} {t("duplicatesVisits", lang)}
                        {g.lastVisitAt
                          ? ` · ${new Date(g.lastVisitAt).toLocaleDateString(lang === "pl" ? "pl-PL" : lang)}`
                          : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {capped && (
            <p className="mt-3 text-xs text-slate-light">{t("duplicatesCapped", lang)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ErasureRegister({ accountId, lang }: { accountId: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [outcome, setOutcome] = useState("");
  const [phone, setPhone] = useState("");
  const [entries, setEntries] = useState<CrmErasureEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const filters = useCallback(
    (): CrmErasureFilters => ({
      from: from || undefined,
      to: to || undefined,
      outcome: outcome || undefined,
      phone: phone.trim() || undefined,
    }),
    [from, to, outcome, phone],
  );

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await listCrmErasures(accountId, filters(), 200, 0);
      setEntries(res.entries);
      setTotal(res.total);
      setCapped(res.capped);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const openPanel = () => {
    setOpen((v) => !v);
    if (!loaded) void load();
  };

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const { entries: rows } = await exportCrmErasures(accountId, filters());
      const header = [
        t("erasureColDate", lang),
        t("erasureColReference", lang),
        t("erasureColChannel", lang),
        t("erasureRegisterOutcome", lang),
        t("erasureColScope", lang),
        t("erasureColVerification", lang),
        t("erasureColExecutedBy", lang),
        t("erasureColCompletedAt", lang),
        t("erasureColExemption", lang),
        t("erasureRefuseReason", lang),
        t("erasureColRecipients", lang),
      ];
      const body = rows.map((r) => [
        r.receivedAt ?? "",
        r.reference,
        erasureChannelLabel(r.channel, lang),
        erasureOutcomeLabel(r.outcome, lang),
        r.scope.join(", "),
        r.identityVerification ?? "",
        r.executedBy ?? (r.executedBySystem ? `${t("erasureSystemActor", lang)} (${r.executedBySystem})` : ""),
        r.completedAt ?? "",
        r.retainedUnderExemption ?? "",
        r.refusalReason ?? "",
        (r.recipientsNotified ?? []).join(", "),
      ]);
      const url = URL.createObjectURL(
        new Blob([toCsv([header, ...body])], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `rejestr-usuniec-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5">
      <button
        onClick={openPanel}
        aria-expanded={open}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sand bg-white px-3 text-sm font-medium text-charcoal transition-colors hover:border-clay"
      >
        <ScrollText size={16} className="text-slate-light" />
        {t("erasureRegister", lang)}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-sand bg-white p-5 shadow-soft">
          <p className="mb-4 max-w-3xl text-xs text-slate">{t("erasureRegisterIntro", lang)}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
            className="mb-4 flex flex-wrap items-end gap-2"
          >
            <div>
              <label htmlFor="eraseFrom" className="mb-1.5 block text-xs font-semibold text-slate">
                {t("erasureRegisterFrom", lang)}
              </label>
              <input
                id="eraseFrom"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="min-h-10 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal outline-none focus:border-clay"
              />
            </div>
            <div>
              <label htmlFor="eraseTo" className="mb-1.5 block text-xs font-semibold text-slate">
                {t("erasureRegisterTo", lang)}
              </label>
              <input
                id="eraseTo"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="min-h-10 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal outline-none focus:border-clay"
              />
            </div>
            <div>
              <label htmlFor="eraseOutcome" className="mb-1.5 block text-xs font-semibold text-slate">
                {t("erasureRegisterOutcome", lang)}
              </label>
              <select
                id="eraseOutcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="min-h-10 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal"
              >
                <option value="">{t("erasureRegisterAllOutcomes", lang)}</option>
                {ERASURE_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {t(ERASURE_OUTCOME_KEYS[o], lang)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="erasePhone" className="mb-1.5 block text-xs font-semibold text-slate">
                {t("erasureRegisterPhone", lang)}
              </label>
              <input
                id="erasePhone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-h-10 w-48 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal outline-none focus:border-clay"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>
              {t("erasureRegisterApply", lang)}
            </Button>
            {(from || to || outcome || phone) && (
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setOutcome("");
                  setPhone("");
                }}
                className="min-h-10 text-xs text-slate-light hover:underline"
              >
                {t("erasureRegisterClear", lang)}
              </button>
            )}
          </form>

          {error && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-dark/40 bg-white px-4 py-3">
              <p className="text-sm text-rose-dark">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-rose-dark hover:underline">
                {t("guestsDismiss", lang)}
              </button>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-sand/60 pb-3">
            <p className="text-sm text-slate">{tf("erasureRegisterCount", lang, { count: String(total) })}</p>
            {capped && <p className="text-xs text-slate-light">{t("erasureRegisterCapped", lang)}</p>}
            {total > 0 && (
              <button
                onClick={handleExport}
                disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-sand bg-white px-3 py-1.5 text-sm text-charcoal transition-colors hover:border-clay disabled:opacity-50"
              >
                <Download size={14} />
                {t("erasureRegisterExport", lang)}
              </button>
            )}
          </div>

          {busy && entries.length === 0 ? (
            <p className="text-slate">{t("loading", lang)}</p>
          ) : entries.length === 0 ? (
            <p className="text-slate">{t("erasureRegisterEmpty", lang)}</p>
          ) : (
            // Horizontally scrollable rather than wrapped: a register is read
            // column-by-column, and reflowing it into cards loses that.
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-sand text-left text-xs font-semibold uppercase tracking-wide text-slate-light">
                    <th className="py-2 pr-3 font-semibold">{t("erasureColDate", lang)}</th>
                    <th className="py-2 pr-3 font-semibold">{t("erasureColReference", lang)}</th>
                    <th className="py-2 pr-3 font-semibold">{t("erasureColChannel", lang)}</th>
                    <th className="py-2 pr-3 font-semibold">{t("erasureRegisterOutcome", lang)}</th>
                    <th className="py-2 pr-3 font-semibold">{t("erasureColScope", lang)}</th>
                    <th className="py-2 font-semibold">{t("erasureColExecutedBy", lang)}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={`${e.reference}-${e.receivedAt}-${i}`} className="border-b border-sand/50 align-top">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-charcoal">{fmtDate(e.receivedAt, lang)}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-light">{e.reference}</td>
                      <td className="py-2.5 pr-3 text-slate">{erasureChannelLabel(e.channel, lang)}</td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            e.outcome === "refused"
                              ? "bg-rose-dark/10 text-rose-dark"
                              : e.outcome === "partial"
                                ? "bg-oatmeal text-slate"
                                : "bg-sage-tint text-sage-dark"
                          }`}
                        >
                          {erasureOutcomeLabel(e.outcome, lang)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate">{erasureScopeLabel(e.scope, lang)}</td>
                      <td className="py-2.5 text-slate">
                        {e.executedBy ??
                          (e.executedBySystem
                            ? `${t("erasureSystemActor", lang)} (${e.executedBySystem})`
                            : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Account-level tag vocabulary: create and delete only. Assigning a tag to a
// guest is a different action and lives on the guest. Deleting is destructive
// across the whole account — it strips the tag from every guest carrying it —
// so it is collapsed by default and confirmed inline, the same idiom as note
// deletion.
function TagManager({
  accountId,
  tags,
  lang,
  onChanged,
  onError,
}: {
  accountId: string;
  tags: CrmTag[];
  lang: Lang;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const create = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = newTag.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createCrmTag(accountId, name);
      setNewTag("");
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tagId: string) => {
    setConfirmId(null);
    setBusy(true);
    try {
      await deleteCrmTag(accountId, tagId);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-sand bg-white p-4">
      <p className="mb-3 text-xs text-slate-light">{t("guestsManageTagsHint", lang)}</p>
      {tags.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {tags.map((tg) => (
            <li key={tg.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-charcoal">{tg.name}</span>
              {confirmId === tg.id ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-rose-dark">
                    {tf("guestsDeleteTagConfirm", lang, { name: tg.name })}
                  </span>
                  <button
                    onClick={() => remove(tg.id)}
                    disabled={busy}
                    className="font-semibold text-rose-dark hover:underline disabled:opacity-50"
                  >
                    {t("guestsConfirmDelete", lang)}
                  </button>
                  <button onClick={() => setConfirmId(null)} className="text-slate-light hover:underline">
                    {t("guestsCancel", lang)}
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmId(tg.id)}
                  className="text-xs text-rose-dark hover:underline"
                >
                  {t("guestsConfirmDelete", lang)}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Enter still submits — the button just makes that discoverable. */}
      <form onSubmit={create} className="flex flex-wrap items-center gap-1.5">
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder={t("guestsNewTag", lang)}
          aria-label={t("guestsNewTag", lang)}
          maxLength={40}
          className="min-h-9 w-40 rounded-full border border-dashed border-sand bg-white px-3 text-sm text-charcoal outline-none focus:border-clay"
        />
        <button
          type="submit"
          disabled={!newTag.trim() || busy}
          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-sage-dark px-3 text-sm font-semibold text-cream transition-colors hover:bg-sage disabled:bg-sand disabled:text-slate-light"
        >
          <Plus size={14} />
          {t("guestsAddTag", lang)}
        </button>
      </form>
    </div>
  );
}

function GuestDetailPanel({
  accountId,
  guestId,
  tags,
  lang,
  onBack,
  onFlash,
  onForgotten,
}: {
  accountId: string;
  guestId: string;
  tags: CrmTag[];
  lang: Lang;
  onBack: () => void;
  onFlash: (msg: string) => void;
  onForgotten: (msg: string) => void;
}) {
  const [detail, setDetail] = useState<CrmGuestDetail | null>(null);
  // Two error channels on purpose. `loadError` means there is genuinely
  // nothing to render; `actionError` is a banner over a panel that is still
  // perfectly usable. Routing the second through the first is what made a
  // failed note delete look like catastrophic data loss.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [confirmNoteId, setConfirmNoteId] = useState<string | null>(null);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [forgetConfirm, setForgetConfirm] = useState("");
  const [showForget, setShowForget] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    getCrmGuest(accountId, guestId)
      .then(setDetail)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Error"));
  }, [accountId, guestId]);
  useEffect(load, [load]);

  if (loadError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-rose-dark">{loadError}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            {t("backButton", lang)}
          </Button>
          <Button variant="secondary" onClick={load}>{t("guestsRetry", lang)}</Button>
        </div>
      </div>
    );
  }
  if (!detail) return <p className="text-slate">{t("loading", lang)}</p>;

  const { guest, visits, notes, surveys, stats } = detail;
  const guestTagIds = new Set(detail.tags.map((tg) => tg.id));
  const displayName = displayNameOf(guest, lang);

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text || noteBusy) return;
    setNoteBusy(true);
    setActionError(null);
    try {
      await addCrmNote(accountId, guestId, text);
      setNoteText("");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error");
    } finally {
      setNoteBusy(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setConfirmNoteId(null);
    setActionError(null);
    try {
      await deleteCrmNote(accountId, noteId);
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error");
    }
  };

  const handleToggleTag = async (tagId: string, assigned: boolean) => {
    if (tagBusy) return;
    setTagBusy(true);
    setTagError(null);
    try {
      await (assigned
        ? unassignCrmTag(accountId, guestId, tagId)
        : assignCrmTag(accountId, guestId, tagId));
      load();
    } catch (e2) {
      setTagError(e2 instanceof Error ? e2.message : "Error");
    } finally {
      setTagBusy(false);
    }
  };

  const handleExport = async () => {
    setActionError(null);
    try {
      const blob = await exportCrmGuest(accountId, guestId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      // Named for a human, not for a database: the manager has to recognise
      // this file in their downloads and forward it to the guest.
      const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      a.download = `${slug || "guest"}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onFlash(tf("guestsExportDone", lang, { name: displayName }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error");
    }
  };

  const handleForget = async () => {
    if (forgetConfirm.trim() !== displayName) return;
    setActionError(null);
    try {
      await forgetCrmGuest(accountId, guestId);
      // A permanent, legally significant deletion must not be confirmed by
      // absence alone — the manager needs something to point at.
      onForgotten(tf("guestsForgetDone", lang, { name: displayName }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Error");
    }
  };

  const consentChip = (label: string, stamp: { version: string | null; at: string | null }) => (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        stamp.version ? "bg-sage-tint text-sage-dark" : "bg-oatmeal text-slate-light"
      }`}
    >
      {label}
      {/* The date was hover-only in a title=, which is exactly the fact a
          data-protection query turns on. */}
      {stamp.at && <span className="ml-1 font-normal opacity-70">{fmtDate(stamp.at, lang)}</span>}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          {t("backButton", lang)}
        </Button>
      </div>

      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-dark/40 bg-white px-4 py-3">
          <p className="text-sm text-rose-dark">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-xs text-rose-dark hover:underline">
            {t("guestsDismiss", lang)}
          </button>
        </div>
      )}

      {/* Header card: identity + stats + consent chips */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-charcoal">{displayName}</h2>
            <p className="mt-1 text-sm text-slate-light">
              {[guest.contactPhone, guest.contactEmail, guest.birthday].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {consentChip(t("guestsConsentBase", lang), guest.consent.base)}
              {consentChip(t("guestsConsentHealth", lang), guest.consent.health)}
              {consentChip(t("guestsConsentMarketing", lang), guest.consent.marketing)}
            </div>
            <p className="mt-1.5 text-right text-xs text-slate-light">{t("guestsConsentLegend", lang)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("guestsStatVisits", lang)} value={String(stats.visitCount)} />
          <Stat
            label={t("guestsStatSpend", lang)}
            value={stats.totalSpend > 0 ? fmtMoney(stats.totalSpend, lang) : "—"}
          />
          <Stat label={t("guestsStatTherapist", lang)} value={stats.favoriteTherapist ?? "—"} />
          <Stat label={t("guestsStatTreatment", lang)} value={stats.favoriteTreatment ?? "—"} />
        </div>
      </div>

      {/* What the CRM exists to capture, and what the therapist needs before
          the guest walks in — fetched all along and previously never shown. */}
      <PreferencesCard preferences={guest.preferences} lang={lang} />

      {/* Visit timeline */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <h3 className="mb-3 text-sm font-semibold text-charcoal">{t("guestsVisits", lang)}</h3>
        {visits.length === 0 ? (
          <p className="text-sm text-slate-light">{t("guestsNoVisits", lang)}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-sand/60 pb-2 text-sm last:border-b-0">
                <span className="font-medium text-charcoal">{fmtDate(v.visited_at, lang)}</span>
                <span className="text-charcoal">{v.treatment_name ?? t("guestsVisitPending", lang)}</span>
                {v.duration_min ? <span className="text-slate-light">{v.duration_min} min</span> : null}
                {v.treatment_price ? (
                  <span className="text-slate-light">{fmtMoney(v.treatment_price, lang)}</span>
                ) : null}
                {v.therapist_name ? <span className="text-slate-light">{v.therapist_name}</span> : null}
                {v.room_name ? <span className="text-slate-light">{v.room_name}{v.bed_name ? ` · ${v.bed_name}` : ""}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Survey history */}
      {surveys.length > 0 && (
        <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
          <h3 className="mb-3 text-sm font-semibold text-charcoal">{t("guestsSurveys", lang)}</h3>
          <ul className="flex flex-col gap-2">
            {surveys.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-sand/60 pb-2 text-sm last:border-b-0">
                <span className="font-medium text-charcoal">{fmtDate(s.created_at, lang)}</span>
                {s.csat_stars !== null && (
                  <span
                    className="flex items-center gap-0.5 text-amber-600"
                    aria-label={`${t("guestsSurveys", lang)}: ${s.csat_stars}/5`}
                  >
                    <Star size={14} fill="currentColor" aria-hidden="true" />
                    {s.csat_stars}
                  </span>
                )}
                {s.nps !== null && <span className="text-slate-light">NPS {s.nps}</span>}
                {s.treatment_type && <span className="text-slate-light">{s.treatment_type}</span>}
                {s.next_visit_note && <span className="text-slate-light italic">„{s.next_visit_note}"</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Staff notes */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <h3 className="mb-1 text-sm font-semibold text-charcoal">{t("guestsNotes", lang)}</h3>
        <p className="mb-3 text-xs text-slate-light">{t("guestsNotesHint", lang)}</p>
        <div className="mb-4 flex gap-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            aria-label={t("guestsAddNote", lang)}
            rows={2}
            maxLength={2000}
            className="flex-1 rounded-xl border border-sand bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-clay"
          />
          <Button onClick={handleAddNote} disabled={!noteText.trim() || noteBusy}>
            {t("guestsAddNote", lang)}
          </Button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-light">{t("guestsNoNotes", lang)}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-oatmeal/40 p-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-light">
                  <span>
                    {n.author_name} · {fmtDateTime(n.created_at, lang)}
                  </span>
                  {/* A note is up to 2000 chars of irreplaceable staff
                      judgement and used to delete on one unguarded tap. */}
                  {confirmNoteId === n.id ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-charcoal">{t("guestsNoteDeleteConfirm", lang)}</span>
                      <button
                        onClick={() => handleDeleteNote(n.id)}
                        className="font-semibold text-rose-dark hover:underline"
                      >
                        {t("guestsConfirmDelete", lang)}
                      </button>
                      <button onClick={() => setConfirmNoteId(null)} className="hover:underline">
                        {t("guestsCancel", lang)}
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmNoteId(n.id)}
                      className="shrink-0 text-rose-dark hover:underline"
                    >
                      {t("guestsDeleteNote", lang)}
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-charcoal">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tags — ASSIGNMENT ONLY. Creating and deleting a tag changes the whole
          account's vocabulary, so it lives on the list screen instead: doing
          it from inside one guest made a global edit look like a local one,
          which is exactly how "delete" here read as "remove from this guest"
          when it actually removed the tag from everybody. */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
          <TagIcon size={16} />
          {t("guestsTags", lang)}
        </h3>
        {tags.length === 0 ? (
          <p className="text-sm text-slate-light">{t("guestsNoTagsYet", lang)}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tg) => {
              const active = guestTagIds.has(tg.id);
              return (
                <button
                  key={tg.id}
                  onClick={() => handleToggleTag(tg.id, active)}
                  disabled={tagBusy}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
                    active
                      ? "border-clay bg-clay/10 text-charcoal"
                      : "border-sand bg-white text-slate-light hover:border-clay"
                  }`}
                >
                  {tg.name}
                </button>
              );
            })}
          </div>
        )}
        {tagError && <p className="mt-2 text-sm text-rose-dark">{tagError}</p>}
      </div>

      {/* GDPR actions, grouped by domain and separated by RISK — an export and
          a permanent erasure used to sit side by side in the same variant. */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <h3 className="mb-1 text-sm font-semibold text-charcoal">{t("guestsRodoTitle", lang)}</h3>
        <p className="mb-4 text-xs text-slate-light">{t("guestsRodoBody", lang)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={handleExport}>
            <Download size={16} />
            {t("guestsExport", lang)}
          </Button>
          <button
            onClick={() => setShowForget((v) => !v)}
            aria-expanded={showForget}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-dark/40 px-3 text-sm font-medium text-rose-dark transition-colors hover:bg-rose-dark/5"
          >
            <Trash2 size={16} />
            {t("guestsForget", lang)}
          </button>
          {/* Neutral by design: refusing changes nothing, so it must not read
              as destructive next to the erasure it declines. */}
          <RefusalForm
            accountId={accountId}
            guestId={guestId}
            displayName={displayName}
            channel="dashboard"
            lang={lang}
            onDone={onFlash}
            onError={setActionError}
          />
        </div>
        {showForget && (
          <div className="mt-4 rounded-xl border border-rose-dark/40 bg-white p-4">
            <p className="mb-3 text-sm text-rose-dark">
              {tf("guestsForgetConfirm", lang, { name: displayName })}
            </p>
            <label htmlFor="crmForgetConfirm" className="mb-1.5 block text-xs font-semibold text-charcoal">
              {t("guestsForgetInputLabel", lang)}
            </label>
            <div className="flex gap-2">
              <input
                id="crmForgetConfirm"
                value={forgetConfirm}
                onChange={(e) => setForgetConfirm(e.target.value)}
                placeholder={displayName}
                className="min-h-10 flex-1 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal outline-none focus:border-clay"
              />
              <Button onClick={handleForget} disabled={forgetConfirm.trim() !== displayName}>
                {t("guestsForget", lang)}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Resolves an option id against the BUILT-IN comfort menu. Built-in ids are
// preserved verbatim (migration 0027), so this names the vast majority; a
// location's custom option falls back to its raw id, which still beats hiding
// the row. There is no single location_settings to resolve against here — the
// CRM is account-wide and a guest's visits can span locations.
function optionLabel(section: ComfortSection, id: string, lang: Lang): string {
  const opt = findComfortOption(section, id);
  return opt ? comfortLabel(opt, lang) : id;
}

function PreferencesCard({ preferences, lang }: { preferences: unknown; lang: Lang }) {
  const config = useMemo(() => defaultComfortConfig(), []);
  const p =
    preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? (preferences as StoredPreferences)
      : null;

  const rows: { label: string; value: string }[] = [];
  if (p?.pressure) {
    rows.push({ label: t("pressure", lang), value: pressureTranslations[p.pressure]?.[lang] ?? p.pressure });
  }
  if (p?.oilId) rows.push({ label: t("massageOil", lang), value: optionLabel(config.oil, p.oilId, lang) });
  if (p?.tableWarming !== undefined) {
    rows.push({ label: t("tableWarming", lang), value: p.tableWarming ? t("on", lang) : t("off", lang) });
  }
  if (p?.headrestPillow) {
    rows.push({ label: t("headrestPillow", lang), value: optionLabel(config.pillow, p.headrestPillow, lang) });
  }
  if (p?.music) rows.push({ label: t("backgroundMusic", lang), value: optionLabel(config.music, p.music, lang) });
  if (p?.communication) {
    rows.push({
      label: t("communication", lang),
      value: communicationTranslations[p.communication]?.[lang] ?? p.communication,
    });
  }

  // Health-tier data: present only when the row carries health consent (the
  // endpoint strips all three keys otherwise), so rendering it here needs no
  // gate of its own.
  const zones = Object.entries(p?.zones ?? {}) as [ZoneId, string][];
  const zoneNotes = (p?.zoneNotes ?? {}) as Partial<Record<ZoneId, string>>;

  return (
    <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
      <h3 className="mb-3 text-sm font-semibold text-charcoal">{t("guestsPrefsTitle", lang)}</h3>
      {rows.length === 0 && zones.length === 0 && !p?.generalNote ? (
        <p className="text-sm text-slate-light">{t("guestsPrefsNone", lang)}</p>
      ) : (
        <>
          {rows.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {rows.map((r) => (
                <div key={r.label} className="rounded-xl bg-oatmeal/40 p-3">
                  <dt className="text-xs uppercase tracking-wide text-slate-light">{r.label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold text-charcoal" title={r.value}>
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {zones.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {zones.map(([zoneId, mark]) => (
                <li key={zoneId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      mark === "blocked" ? "bg-rose-dark" : "bg-clay"
                    }`}
                  />
                  <span className="font-medium text-charcoal">
                    {zoneTranslations[zoneId]?.[lang] ?? zoneId}
                  </span>
                  <span className="text-slate-light">
                    {mark === "blocked" ? t("doNotMassage", lang) : t("focusHere", lang)}
                  </span>
                  {zoneNotes[zoneId] && (
                    <span className="text-slate-light italic">„{zoneNotes[zoneId]}"</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {p?.generalNote && (
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-oatmeal/40 p-3 text-sm text-charcoal">
              {p.generalNote}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-oatmeal/40 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-light">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-charcoal" title={value}>
        {value}
      </div>
    </div>
  );
}
