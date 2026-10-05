import type { TextareaHTMLAttributes } from "react";

interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({
  label,
  error,
  className = "",
  id,
  ...props
}: TextareaProps) {
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

      <textarea
        id={id}
        className={`min-h-28 w-full resize-y rounded-xl border bg-white/[0.025] px-3.5 py-3 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 ${
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