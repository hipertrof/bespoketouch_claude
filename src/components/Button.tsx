import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-sage-dark text-cream shadow-soft hover:bg-sage active:scale-[0.98] disabled:bg-sand disabled:text-slate-light disabled:shadow-none",
  secondary:
    "bg-white text-charcoal border border-sand hover:bg-oatmeal active:scale-[0.98]",
  ghost: "bg-transparent text-slate hover:bg-oatmeal active:scale-[0.98]",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold tracking-tight transition-all duration-300 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
