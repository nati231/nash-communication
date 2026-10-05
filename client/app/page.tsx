import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Plus,
  Sparkles,
  Video,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";

const upcomingMeetings = [
  {
    title: "Product Design Review",
    time: "10:30 AM",
    date: "Today",
    participants: 4,
    duration: "45 min",
    color: "from-violet-500/20 to-indigo-500/5",
  },
  {
    title: "Frontend Team Sync",
    time: "2:00 PM",
    date: "Today",
    participants: 7,
    duration: "30 min",
    color: "from-blue-500/20 to-cyan-500/5",
  },
  {
    title: "Project Planning",
    time: "9:00 AM",
    date: "Tomorrow",
    participants: 5,
    duration: "60 min",
    color: "from-emerald-500/15 to-teal-500/5",
  },
];

export default function Home() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-7 lg:px-10">
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#101012]">
          <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-violet-600/10 blur-3xl" />

          <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-indigo-600/[0.06] blur-3xl" />

          <div className="relative flex flex-col justify-between gap-8 p-7 sm:p-9 lg:flex-row lg:items-center lg:p-10">
            <div className="max-w-xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/15 bg-violet-400/[0.06] px-3 py-1.5 text-[11px] font-medium text-violet-300">
                <Sparkles size={13} />
                Your workspace is ready
              </div>

              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                Good afternoon, Natnael.
              </h1>

              <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-500 sm:text-[15px]">
                Everything you need to connect with your team, run meetings,
                and turn ideas into progress.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Button variant="primary" className="group font-semibold">
                  <Plus size={17} />

                  <span>New meeting</span>

                  <ArrowUpRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </Button>

                <Button variant="secondary">
                  <Video size={17} />

                  <span>Join meeting</span>
                </Button>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="relative h-36 w-52">
                <div className="absolute right-2 top-2 h-24 w-24 rounded-2xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-xl" />

                <div className="absolute bottom-0 left-2 h-28 w-28 rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl" />

                <div className="absolute left-12 top-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-violet-400/20 bg-violet-500/10 shadow-[0_0_60px_rgba(139,92,246,0.12)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-600 text-lg font-bold text-white shadow-xl shadow-violet-500/20">
                    N
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600">
                Schedule
              </p>

              <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                Upcoming meetings
              </h2>
            </div>

            <button className="text-xs font-medium text-zinc-500 transition hover:text-white">
              View calendar →
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {upcomingMeetings.map((meeting) => (
              <div
                key={meeting.title}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101012] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-[#131315]"
              >
                <div
                  className={`absolute -right-16 -top-16 h-32 w-32 rounded-full bg-gradient-to-br ${meeting.color} blur-2xl`}
                />

                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                      <Video size={17} className="text-violet-300" />
                    </div>

                    <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[10px] font-medium text-zinc-500">
                      {meeting.date}
                    </span>
                  </div>

                  <h3 className="mt-5 text-sm font-semibold text-zinc-100">
                    {meeting.title}
                  </h3>

                  <div className="mt-3 flex items-center gap-4 text-[11px] text-zinc-600">
                    <span className="flex items-center gap-1.5">
                      <Clock3 size={13} />
                      {meeting.time}
                    </span>

                    <span>{meeting.participants} participants</span>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
                    <span className="text-[11px] text-zinc-600">
                      {meeting.duration}
                    </span>

                    <button className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 transition group-hover:text-white">
                      Details
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-[#101012] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <CalendarDays size={17} />
              </div>

              <div>
                <p className="text-[11px] text-zinc-600">Today</p>

                <p className="text-sm font-semibold text-zinc-200">
                  3 meetings
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#101012] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                <Clock3 size={17} />
              </div>

              <div>
                <p className="text-[11px] text-zinc-600">
                  Time in meetings
                </p>

                <p className="text-sm font-semibold text-zinc-200">
                  2h 15m
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#101012] p-5 md:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                <UsersIcon />
              </div>

              <div>
                <p className="text-[11px] text-zinc-600">Workspace</p>

                <p className="text-sm font-semibold text-zinc-200">
                  12 members
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function UsersIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}