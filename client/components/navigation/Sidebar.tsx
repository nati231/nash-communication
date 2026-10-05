"use client";

import {
  Bell,
  CalendarDays,
  FileText,
  Home,
  MessageSquare,
  PenTool,
  Settings,
  Users,
  Video,
} from "lucide-react";

const navigation = [
  {
    label: "Overview",
    icon: Home,
    active: true,
  },
  {
    label: "Meetings",
    icon: Video,
  },
  {
    label: "Messages",
    icon: MessageSquare,
  },
  {
    label: "Files",
    icon: FileText,
  },
  {
    label: "Whiteboard",
    icon: PenTool,
  },
];

const secondaryNavigation = [
  {
    label: "Calendar",
    icon: CalendarDays,
  },
  {
    label: "Team",
    icon: Users,
  },
  {
    label: "Notifications",
    icon: Bell,
  },
  {
    label: "Settings",
    icon: Settings,
  },
];

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-[248px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0d0d0f] lg:flex">
      <div className="flex h-[76px] items-center px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-bold text-black shadow-[0_0_30px_rgba(255,255,255,0.08)]">
            N
          </div>

          <div>
            <p className="text-[15px] font-semibold tracking-tight text-white">
              Nash
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Connect · Collaborate
            </p>
          </div>
        </div>
      </div>

      <div className="px-3">
        <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
          Workspace
        </p>

        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                  item.active
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <Icon
                  size={17}
                  strokeWidth={item.active ? 2 : 1.7}
                  className={
                    item.active
                      ? "text-violet-400"
                      : "text-zinc-500 transition-colors group-hover:text-zinc-300"
                  }
                />

                <span>{item.label}</span>

                {item.label === "Messages" && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500/15 px-1.5 text-[10px] font-semibold text-violet-300">
                    4
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-8 px-3">
        <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
          More
        </p>

        <nav className="space-y-1">
          {secondaryNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-500 transition-all hover:bg-white/[0.04] hover:text-zinc-200"
              >
                <Icon
                  size={17}
                  strokeWidth={1.7}
                  className="text-zinc-500 transition-colors group-hover:text-zinc-300"
                />

                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-3">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">
              Workspace
            </span>

            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>

          <p className="truncate text-sm font-medium text-zinc-200">
            Personal Workspace
          </p>

          <p className="mt-1 text-[11px] text-zinc-600">
            Free workspace
          </p>
        </div>
      </div>
    </aside>
  );
}