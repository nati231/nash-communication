import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({
  label,
  error,
  className = "",
  id,
  ...props
}: InputProps) {
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

      <input
        id={id}
        className={`h-11 w-full rounded-xl border bg-white/[0.025] px-3.5 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600 ${
          error
            ? "border-red-500/40 focus:border-red-500/60"
            : "border-white/[0.08] focus:border-violet-500/40 focus:bg-white/[0.04]"
        } ${className}`}
        {...props}
      />

      {error && (
        <p className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}