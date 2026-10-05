"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const benefits = [
  "HD video meetings with your team",
  "Real-time chat and collaboration",
  "Shared files and collaborative whiteboards",
];

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        {/* Brand panel */}
        <section className="relative hidden overflow-hidden border-r border-white/[0.06] lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(124,58,237,0.18),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(79,70,229,0.12),transparent_32%)]" />

          <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-violet-600/[0.08] blur-3xl" />

          <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-indigo-600/[0.08] blur-3xl" />

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
                <Sparkles size={21} strokeWidth={1.7} />
              </div>

              <h1 className="max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white xl:text-5xl">
                Bring your
                <br />
                team together.
              </h1>

              <p className="mt-5 max-w-md text-sm leading-7 text-zinc-500">
                Create your Nash workspace and bring meetings, conversations,
                files, and ideas together.
              </p>

              <div className="mt-8 space-y-4">
                {benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-center gap-3 text-sm text-zinc-400"
                  >
                    <CheckCircle2
                      size={17}
                      className="shrink-0 text-violet-400"
                      strokeWidth={1.7}
                    />

                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <p className="text-[11px] text-zinc-700">
              © 2026 Nash. Built for better communication.
            </p>
          </div>
        </section>

        {/* Signup panel */}
        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[420px]">
            {/* Mobile logo */}
            <div className="mb-10 lg:hidden">
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
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-violet-400">
                Get started
              </p>

              <h2 className="text-3xl font-semibold tracking-[-0.035em]">
                Create your account
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Start building better conversations with Nash.
              </p>
            </div>

            <form className="space-y-4">
              <Input
                id="name"
                name="name"
                type="text"
                label="Full name"
                placeholder="Natnael Bekele"
                autoComplete="name"
                required
              />

              <Input
                id="email"
                name="email"
                type="email"
                label="Email address"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />

              {/* Password */}
              <div>
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  label="Password"
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  required
                  className="pr-11"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  className="relative float-right -mt-8 mr-3 text-zinc-600 transition hover:text-zinc-300"
                >
                  {showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>

              {/* Confirm password */}
              <div>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  label="Confirm password"
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                  className="pr-11"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword((current) => !current)
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  className="relative float-right -mt-8 mr-3 text-zinc-600 transition hover:text-zinc-300"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                <p className="text-[11px] leading-5 text-zinc-600">
                  Your password should contain at least 8 characters. We&apos;ll
                  add stronger validation when authentication is connected.
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="h-12 w-full justify-center rounded-xl"
              >
                Create account
                <ArrowRight size={16} />
              </Button>
            </form>

            <p className="mt-7 text-center text-sm text-zinc-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-zinc-200 transition hover:text-white"
              >
                Sign in
              </Link>
            </p>

            <p className="mt-8 text-center text-[10px] leading-5 text-zinc-700">
              By creating an account, you agree to Nash&apos;s terms of service
              and privacy policy.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}