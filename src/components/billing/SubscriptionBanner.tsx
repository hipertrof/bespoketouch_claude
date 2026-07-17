import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import {
  billableAccountIds,
  fetchSubscriptions,
  formatEndDate,
  type AccountSubscription,
} from "../../lib/billing";
import { t, tf } from "../../i18n/translations";

// Soft payment-lapse reminder for the manager dashboards. It only ever informs:
// nothing here disables a control, and it is deliberately absent from the kiosk
// and the therapist queue, where it would sit in front of a live guest.
//
// Self-resolving on purpose — it reads the accounts the signed-in user can act
// on from AuthContext, so each dashboard mounts it as <SubscriptionBanner />
// with no wiring. Platform admins see nothing: they have no memberships, and
// they are the ones who set these dates in /admin.

// Dismissal is per-tab and keyed by the end date, so extending a subscription
// (or letting it lapse further) surfaces a fresh reminder.
function dismissKey(accountId: string, end: string): string {
  return `bt_billing_dismissed:${accountId}:${end}`;
}

function isDismissed(accountId: string, end: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(accountId, end)) === "1";
  } catch {
    return false; // private mode / storage disabled — just show it.
  }
}

export function SubscriptionBanner() {
  const { user, rolesReady, memberships } = useAuth();
  const { lang } = useLanguage();
  const [accounts, setAccounts] = useState<AccountSubscription[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  const accountIds = useMemo(() => billableAccountIds(memberships), [memberships]);

  useEffect(() => {
    if (!user || !rolesReady || accountIds.length === 0) {
      setAccounts([]);
      return;
    }
    let active = true;
    fetchSubscriptions(accountIds)
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      // A reminder must never take a dashboard down: on failure, say nothing.
      .catch(() => {
        if (active) setAccounts([]);
      });
    return () => {
      active = false;
    };
  }, [user, rolesReady, accountIds]);

  const due = accounts.filter((a) => {
    if (!a.status || a.status.state === "ok") return false;
    // A lapsed subscription stays on screen; only the pre-expiry nudge hides.
    if (a.status.state === "lapsed") return true;
    const key = dismissKey(a.id, a.status.end);
    return !hidden.includes(key) && !isDismissed(a.id, a.status.end);
  });

  if (due.length === 0) return null;

  // Worst first: lapsed above ending-soon, then soonest to expire.
  const ordered = [...due].sort((a, b) => (a.status?.days ?? 0) - (b.status?.days ?? 0));

  return (
    <div className="mb-6 flex flex-col gap-3">
      {ordered.map((a) => {
        const status = a.status!;
        const lapsed = status.state === "lapsed";
        const date = formatEndDate(status.end, lang);
        return (
          <div
            key={a.id}
            role="status"
            className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
              lapsed ? "border-rose-light bg-rose-tint" : "border-clay-light bg-clay-tint"
            }`}
          >
            <AlertTriangle
              size={18}
              className={`mt-0.5 shrink-0 ${lapsed ? "text-rose-dark" : "text-clay-dark"}`}
              aria-hidden
            />
            <div className="flex-1">
              <p className={`text-sm font-medium ${lapsed ? "text-rose-dark" : "text-clay-dark"}`}>
                {t(lapsed ? "billingLapsedTitle" : "billingEndingSoonTitle", lang)}
              </p>
              <p className="mt-0.5 text-sm text-slate">
                {tf(lapsed ? "billingLapsedBody" : "billingEndingSoonBody", lang, {
                  account: a.name,
                  date,
                })}
              </p>
            </div>
            {!lapsed && (
              <button
                type="button"
                aria-label={t("billingDismiss", lang)}
                title={t("billingDismiss", lang)}
                onClick={() => {
                  const key = dismissKey(a.id, status.end);
                  try {
                    sessionStorage.setItem(key, "1");
                  } catch {
                    // Storage unavailable — the `hidden` state still hides it here.
                  }
                  setHidden((h) => [...h, key]);
                }}
                className="shrink-0 rounded-lg p-1 text-clay-dark hover:bg-clay-light/40"
              >
                <X size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
