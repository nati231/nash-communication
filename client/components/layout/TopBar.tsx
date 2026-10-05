"use client";

import {
  Bell,
  ChevronDown,
  Search,
} from "lucide-react";

export function TopBar() {
  return (
    <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/[0.07] px-5 sm:px-7">
      <div className="flex items-center gap-3">
        <div className="relative hidden w-[280px] sm:block">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
          />

          <input
            type="text"
            placeholder="Search anything..."
            className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600 focus:border-violet-500/30 focus:bg-white/[0.04]"
          />

          <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-zinc-600 md:block">
            /
          </span>
        </div>

        <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 sm:hidden">
          <Search size={17} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200">
          <Bell size={17} />

          <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-violet-400" />
        </button>

        <button className="group flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition hover:border-white/[0.07] hover:bg-white/[0.025]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-semibold text-white shadow-lg shadow-violet-500/10">
            NB
          </div>

          <div className="hidden text-left sm:block">
            <p className="text-xs font-medium text-zinc-200">
              Natnael
            </p>

            <p className="text-[10px] text-zinc-600">
              Personal
            </p>
          </div>

          <ChevronDown
            size={14}
            className="hidden text-zinc-600 transition group-hover:text-zinc-400 sm:block"
          />
        </button>
      </div>
    </header>
  );
}