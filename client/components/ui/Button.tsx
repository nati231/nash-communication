import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-white text-black shadow-[0_8px_30px_rgba(255,255,255,0.08)] hover:bg-zinc-200",

  secondary:
    "border border-white/[0.09] bg-white/[0.025] text-zinc-300 hover:bg-white/[0.06] hover:text-white",

  ghost:
    "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200",

  danger:
    "bg-red-500/10 text-red-400 hover:bg-red-500/15",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}