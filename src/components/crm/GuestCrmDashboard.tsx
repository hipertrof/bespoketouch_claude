import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Search, Star, Tag as TagIcon, Trash2, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { supabase } from "../../lib/supabase";
import {
  addCrmNote,
  assignCrmTag,
  createCrmTag,
  deleteCrmNote,
  exportCrmGuest,
  forgetCrmGuest,
  getCrmGuest,
  listCrmGuests,
  listCrmTags,
  unassignCrmTag,
  type CrmGuestDetail,
  type CrmGuestListItem,
  type CrmTag,
} from "../../lib/crm";
import { t, tf } from "../../i18n/translations";
import { Button } from "../Button";
import { DashboardShell } from "../DashboardShell";
import { SubscriptionBanner } from "../billing/SubscriptionBanner";

// Guest 360 dashboard (/guests). Manager-and-up only — enforced twice: this
// route gates on canManage (cosmetic), and /api/crm re-checks the caller's
// owner/manager membership per request (the real boundary; every CRM table is
// service-role-only). Anonymous (hash-only) rows appear without a name — they
// are real guests who declined the marketing tier, and their visit history and
// preferences are still owner-visible data.

interface AccountLite {
  id: string;
  name: string;
}

export function GuestCrmDashboard() {
  const { user, loading, canManage, rolesReady } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState("");
  const [guests, setGuests] = useState<CrmGuestListItem[]>([]);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);
  useEffect(() => {
    if (rolesReady && !canManage) navigate("/queue");
  }, [rolesReady, canManage, navigate]);

  // Accounts the caller can see (RLS-scoped read, same approach as /reports'
  // locations query). Managers usually have exactly one.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("accounts")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          return;
        }
        const all = (data as AccountLite[]) ?? [];
        setAccounts(all);
        if (all.length > 0) setAccountId((prev) => prev || all[0].id);
      });
  }, [user]);

  const load = useCallback(async (acct: string, q: string) => {
    setBusy(true);
    setError(null);
    try {
      const [g, tg] = await Promise.all([
        listCrmGuests(acct, { search: q || undefined }),
        listCrmTags(acct),
      ]);
      setGuests(g);
      setTags(tg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (accountId) load(accountId, search);
    // search is applied via the button/enter, not on each keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, load]);

  const visible = useMemo(
    () => (tagFilter ? guests.filter((g) => g.tagIds.includes(tagFilter)) : guests),
    [guests, tagFilter],
  );

  if (loading || !rolesReady) {
    return <div className="flex min-h-screen items-center justify-center bg-cream text-slate">{t("loading", lang)}</div>;
  }
  if (!user) return null;

  return (
    <DashboardShell title={t("guestsTitle", lang)} width="max-w-5xl">
      <SubscriptionBanner />
      {error && <p className="mb-4 text-sm text-rose-dark">{error}</p>}

      {accounts.length > 1 && (
        <div className="mb-4">
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setSelectedId(null);
            }}
            className="rounded-xl border border-sand bg-white px-3 py-2 text-sm text-charcoal"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {selectedId ? (
        <GuestDetailPanel
          accountId={accountId}
          guestId={selectedId}
          tags={tags}
          lang={lang}
          onBack={() => {
            setSelectedId(null);
            load(accountId, search);
          }}
          onTagsChanged={() => listCrmTags(accountId).then(setTags).catch(() => {})}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-sand bg-white px-3">
              <Search size={16} className="text-slate-light" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(accountId, search)}
                placeholder={t("guestsSearchPlaceholder", lang)}
                className="min-h-10 w-56 bg-transparent text-sm text-charcoal outline-none"
              />
            </div>
            <Button variant="secondary" onClick={() => load(accountId, search)} disabled={busy}>
              {t("guestsSearch", lang)}
            </Button>
            {tags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="min-h-10 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal"
              >
                <option value="">{t("guestsAllTags", lang)}</option>
                {tags.map((tg) => (
                  <option key={tg.id} value={tg.id}>{tg.name}</option>
                ))}
              </select>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="text-slate">{busy ? t("loading", lang) : t("guestsEmpty", lang)}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => setSelectedId(g.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-sand bg-white p-4 text-left shadow-soft transition-colors hover:border-clay"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
                        <UserRound size={20} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-charcoal">
                          {g.name ?? t("guestsAnonymous", lang)}
                        </span>
                        <span className="block text-xs text-slate-light">
                          {tf("guestsVisitCount", lang, { count: String(g.visitCount) })}
                          {g.lastVisitAt ? ` · ${new Date(g.lastVisitAt).toLocaleDateString()}` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {g.tagIds.map((id) => {
                        const tg = tags.find((x) => x.id === id);
                        return tg ? (
                          <span key={id} className="rounded-full bg-oatmeal px-2 py-0.5 text-xs text-charcoal">
                            {tg.name}
                          </span>
                        ) : null;
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </DashboardShell>
  );
}

function GuestDetailPanel({
  accountId,
  guestId,
  tags,
  lang,
  onBack,
  onTagsChanged,
}: {
  accountId: string;
  guestId: string;
  tags: CrmTag[];
  lang: Parameters<typeof t>[1];
  onBack: () => void;
  onTagsChanged: () => void;
}) {
  const [detail, setDetail] = useState<CrmGuestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [newTag, setNewTag] = useState("");
  const [forgetConfirm, setForgetConfirm] = useState("");
  const [showForget, setShowForget] = useState(false);

  const load = useCallback(() => {
    getCrmGuest(accountId, guestId).then(setDetail).catch((e) => setError(e.message));
  }, [accountId, guestId]);
  useEffect(load, [load]);

  if (error) return <p className="text-sm text-rose-dark">{error}</p>;
  if (!detail) return <p className="text-slate">{t("loading", lang)}</p>;

  const { guest, visits, notes, surveys, stats } = detail;
  const guestTagIds = new Set(detail.tags.map((tg) => tg.id));
  const displayName = guest.name ?? t("guestsAnonymous", lang);

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    try {
      await addCrmNote(accountId, guestId, text);
      setNoteText("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportCrmGuest(accountId, guestId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `guest-export-${guestId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const handleForget = async () => {
    if (forgetConfirm.trim() !== displayName) return;
    try {
      await forgetCrmGuest(accountId, guestId);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const consentChip = (label: string, stamp: { version: string | null; at: string | null }) => (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        stamp.version ? "bg-sage-tint text-sage-dark" : "bg-oatmeal text-slate-light"
      }`}
      title={stamp.at ? new Date(stamp.at).toLocaleString() : undefined}
    >
      {label}
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          {t("backButton", lang)}
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExport}>
            <Download size={16} />
            {t("guestsExport", lang)}
          </Button>
          <Button variant="secondary" onClick={() => setShowForget((v) => !v)}>
            <Trash2 size={16} />
            {t("guestsForget", lang)}
          </Button>
        </div>
      </div>

      {showForget && (
        <div className="rounded-2xl border border-rose-dark/40 bg-white p-4">
          <p className="mb-2 text-sm text-rose-dark">
            {tf("guestsForgetConfirm", lang, { name: displayName })}
          </p>
          <div className="flex gap-2">
            <input
              value={forgetConfirm}
              onChange={(e) => setForgetConfirm(e.target.value)}
              className="min-h-10 flex-1 rounded-xl border border-sand bg-white px-3 text-sm text-charcoal outline-none"
            />
            <Button onClick={handleForget} disabled={forgetConfirm.trim() !== displayName}>
              {t("guestsForget", lang)}
            </Button>
          </div>
        </div>
      )}

      {/* Header card: identity + stats + consent chips */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-charcoal">{displayName}</h2>
            <p className="mt-1 text-sm text-slate-light">
              {guest.contactPhone ?? ""}
              {guest.contactEmail ? ` · ${guest.contactEmail}` : ""}
              {guest.birthday ? ` · ${guest.birthday}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {consentChip(t("guestsConsentBase", lang), guest.consent.base)}
            {consentChip(t("guestsConsentHealth", lang), guest.consent.health)}
            {consentChip(t("guestsConsentMarketing", lang), guest.consent.marketing)}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("guestsStatVisits", lang)} value={String(stats.visitCount)} />
          <Stat
            label={t("guestsStatSpend", lang)}
            value={stats.totalSpend > 0 ? `${stats.totalSpend} zł` : "—"}
          />
          <Stat label={t("guestsStatTherapist", lang)} value={stats.favoriteTherapist ?? "—"} />
          <Stat label={t("guestsStatTreatment", lang)} value={stats.favoriteTreatment ?? "—"} />
        </div>
      </div>

      {/* Tags */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
          <TagIcon size={16} />
          {t("guestsTags", lang)}
        </h3>
        <div className="flex flex-wrap gap-2">
          {tags.map((tg) => {
            const active = guestTagIds.has(tg.id);
            return (
              <button
                key={tg.id}
                onClick={() =>
                  (active
                    ? unassignCrmTag(accountId, guestId, tg.id)
                    : assignCrmTag(accountId, guestId, tg.id)
                  )
                    .then(load)
                    .catch((e) => setError(e.message))
                }
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? "border-clay bg-clay/10 text-charcoal"
                    : "border-sand bg-white text-slate-light hover:border-clay"
                }`}
              >
                {tg.name}
              </button>
            );
          })}
          <span className="flex items-center gap-1">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder={t("guestsNewTag", lang)}
              className="min-h-9 w-36 rounded-full border border-dashed border-sand bg-white px-3 text-sm text-charcoal outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  createCrmTag(accountId, newTag.trim())
                    .then((tg) => {
                      setNewTag("");
                      onTagsChanged();
                      if (tg) return assignCrmTag(accountId, guestId, tg.id).then(load);
                    })
                    .catch((e2) => setError(e2.message));
                }
              }}
            />
          </span>
        </div>
      </div>

      {/* Visit timeline */}
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft">
        <h3 className="mb-3 text-sm font-semibold text-charcoal">{t("guestsVisits", lang)}</h3>
        {visits.length === 0 ? (
          <p className="text-sm text-slate-light">{t("guestsNoVisits", lang)}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-sand/60 pb-2 text-sm last:border-b-0">
                <span className="font-medium text-charcoal">
                  {new Date(v.visited_at).toLocaleDateString()}
                </span>
                <span className="text-charcoal">{v.treatment_name ?? t("guestsVisitPending", lang)}</span>
                {v.duration_min ? <span className="text-slate-light">{v.duration_min} min</span> : null}
                {v.treatment_price ? <span className="text-slate-light">{v.treatment_price} zł</span> : null}
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
                <span className="font-medium text-charcoal">{new Date(s.created_at).toLocaleDateString()}</span>
                {s.csat_stars !== null && (
                  <span className="flex items-center gap-0.5 text-amber-600">
                    <Star size={14} fill="currentColor" />
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
            rows={2}
            maxLength={2000}
            className="flex-1 rounded-xl border border-sand bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-clay"
          />
          <Button onClick={handleAddNote} disabled={!noteText.trim()}>
            {t("guestsAddNote", lang)}
          </Button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-light">{t("guestsNoNotes", lang)}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl bg-oatmeal/40 p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-light">
                  <span>
                    {n.author_name} · {new Date(n.created_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() =>
                      deleteCrmNote(accountId, n.id).then(load).catch((e) => setError(e.message))
                    }
                    className="text-rose-dark hover:underline"
                  >
                    {t("guestsDeleteNote", lang)}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-charcoal">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-oatmeal/40 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-light">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-charcoal">{value}</div>
    </div>
  );
}
