import type { ReactNode } from "react";

export function PreferenceCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-sand bg-white p-5 shadow-soft sm:p-6">
      <h3 className="mb-1 text-base font-semibold text-charcoal">{title}</h3>
      {description && (
        <p className="mb-4 text-sm leading-relaxed text-slate-light">
          {description}
        </p>
      )}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  );
}
