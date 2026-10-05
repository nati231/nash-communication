import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({
  label,
  error,
  className = "",
  id,
  children,
  ...props
}: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="mb-2 block text-sm font-medium text-zinc-300"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={id}
          className={`h-11 w-full appearance-none rounded-xl border bg-white/[0.025] px-3.5 pr-10 text-sm text-zinc-200 outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            error
              ? "border-red-500/40 focus:border-red-500/60"
              : "border-white/[0.08] focus:border-violet-500/40 focus:bg-white/[0.04]"
          } ${className}`}
          {...props}
        >
          {children}
        </select>

        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
        />
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}