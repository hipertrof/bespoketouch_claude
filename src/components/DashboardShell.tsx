import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { t } from "../i18n/translations";
import { Logo } from "./Logo";
import { LanguageSelector } from "./LanguageSelector";
import { Button } from "./Button";

// Shared chrome for every login-gated staff dashboard. Before this, each screen
// hand-rolled its own header with an ad-hoc set of text-link nav items (varying
// order, varying labels, no active state, no brand). This centralises that into
// one sticky bar with brand + role-scoped nav + language + sign-out, so the five
// account screens (queue/offer/staff/kiosks/reports) and /admin all match and
// the current page is always highlighted.
//
// Screens keep their own body; they pass a page `title` (+ optional `subtitle`,
// defaulting to the signed-in email) and a content `width` matching their old
// container so nothing reflows.

const NAV_ITEMS = [
  { to: "/queue", labelKey: "queueNav" },
  { to: "/manage", labelKey: "offer" },
  { to: "/staff", labelKey: "staffNav" },
  { to: "/kiosks", labelKey: "kiosksNav" },
  { to: "/reports", labelKey: "surveyNav" },
] as const;

export function DashboardShell({
  title,
  subtitle,
  width = "max-w-4xl",
  children,
}: {
  title: string;
  subtitle?: string;
  /** Tailwind max-width class for the content column (match the screen's prior container). */
  width?: string;
  children: ReactNode;
}) {
  const { user, canManage, isPlatformAdmin, signOut } = useAuth();
  const { lang } = useLanguage();
  const { pathname } = useLocation();

  // Managers/owners/platform-admins get the full account nav; a pure therapist
  // only has the queue. Platform admins additionally get a link back to /admin,
  // which otherwise has no inbound route from the account screens.
  const navItems = canManage ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.to === "/queue");
  const items = isPlatformAdmin
    ? [...navItems, { to: "/admin", labelKey: "adminNav" as const }]
    : navItems;

  const navLink = (to: string, label: string, compact = false) => {
    const active = pathname === to;
    return (
      <Link
        key={to}
        to={to}
        aria-current={active ? "page" : undefined}
        className={`${compact ? "shrink-0" : ""} rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
          active ? "bg-sage-dark text-cream" : "text-slate hover:bg-oatmeal"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 border-b border-sand/70 bg-(--color-cream)/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/queue" className="shrink-0" aria-label="BespokeTouch">
            <Logo compact lang={lang} />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => navLink(item.to, t(item.labelKey, lang)))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSelector />
            <Button variant="ghost" onClick={() => signOut()}>
              {t("signOut", lang)}
            </Button>
          </div>
        </div>
        {/* Mobile: the nav can't fit beside the brand, so it drops to a scrollable row. */}
        {items.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
            {items.map((item) => navLink(item.to, t(item.labelKey, lang), true))}
          </nav>
        )}
      </header>

      <main className={`mx-auto ${width} px-6 py-8 lg:px-8`}>
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-charcoal">{title}</h1>
          {(subtitle ?? user?.email) && (
            <p className="text-sm text-slate">{subtitle ?? user?.email}</p>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}
