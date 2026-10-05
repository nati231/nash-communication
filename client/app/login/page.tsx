import Link from "next/link";
import { ArrowRight, LockKeyhole, Video } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* Brand panel */}
        <section className="relative hidden overflow-hidden border-r border-white/[0.06] lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(124,58,237,0.18),transparent_35%),radial-gradient(circle_at_75%_75%,rgba(79,70,229,0.12),transparent_30%)]" />

          <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-violet-600/[0.08] blur-3xl" />

          <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-indigo-600/[0.08] blur-3xl" />

          <div className="relative flex w-full flex-col justify-between p-10 xl:p-14">
            {/* Logo */}
            <Link href="/" className="flex w-fit items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-black shadow-[0_0_35px_rgba(255,255,255,0.08)]">
                N
              </div>

              <div>
                <p className="text-[15px] font-semibold tracking-tight">
                  Nash
                </p>

                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                  Connect · Collaborate
                </p>
              </div>
            </Link>

            {/* Main message */}
            <div className="max-w-xl">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/15 bg-violet-500/[0.08] text-violet-300">
                <Video size={21} strokeWidth={1.7} />
              </div>

              <h1 className="max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white xl:text-5xl">
                Your team,
                <br />
                in sync.
              </h1>

              <p className="mt-5 max-w-md text-sm leading-7 text-zinc-500">
                Meet, communicate, and collaborate from one focused
                workspace built for modern teams.
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-zinc-500">
                  Video meetings
                </span>

                <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-zinc-500">
                  Real-time chat
                </span>

                <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-zinc-500">
                  Collaboration
                </span>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[11px] text-zinc-700">
              © 2026 Nash. Built for better communication.
            </p>
          </div>
        </section>

        {/* Login panel */}
        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[420px]">
            {/* Mobile logo */}
            <div className="mb-12 lg:hidden">
              <Link href="/" className="inline-flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-black">
                  N
                </div>

                <div>
                  <p className="text-[15px] font-semibold">Nash</p>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
                    Connect · Collaborate
                  </p>
                </div>
              </Link>
            </div>

            <div className="mb-8">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-400">
                <LockKeyhole size={17} strokeWidth={1.7} />
              </div>

              <h2 className="text-3xl font-semibold tracking-[-0.035em]">
                Welcome back
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Sign in to continue to your Nash workspace.
              </p>
            </div>

            <form className="space-y-5">
              <Input
                id="email"
                name="email"
                type="email"
                label="Email address"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-zinc-300"
                  >
                    Password
                  </label>

                  <button
                    type="button"
                    className="text-xs font-medium text-violet-400 transition hover:text-violet-300"
                  >
                    Forgot password?
                  </button>
                </div>

                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="h-12 w-full justify-center rounded-xl"
              >
                Sign in
                <ArrowRight size={16} />
              </Button>
            </form>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/[0.06]" />

              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-700">
                Nash
              </span>

              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>

            <p className="text-center text-sm text-zinc-500">
              Don't have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-zinc-200 transition hover:text-white"
              >
                Create one
              </Link>
            </p>

            <p className="mt-8 text-center text-[10px] leading-5 text-zinc-700">
              By continuing, you agree to Nash's terms of service and
              privacy policy.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}