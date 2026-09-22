"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

function sanitizeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("..") || raw.includes("://")) {
    return "/saved";
  }
  return raw;
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNext(searchParams.get("next"));
  const status = useAuthStore((state) => state.status);
  const register = useAuthStore((state) => state.register);
  const loadMe = useAuthStore((state) => state.loadMe);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") {
      void loadMe();
    }
  }, [loadMe, status]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextPath);
    }
  }, [nextPath, router, status]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      router.replace(nextPath);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not register.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <p className="inline-flex items-center gap-2 font-semibold text-emerald-800">
        <UserPlus size={18} />
        Create account
      </p>
      <h1 className="mt-2 text-4xl font-semibold text-stone-950">Register</h1>
      <p className="mt-3 text-stone-600">Save routes to your account and share them with a link.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-semibold text-stone-700">Display name</span>
          <input
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-3 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-stone-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-3 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-stone-700">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-3 outline-none focus:border-emerald-700"
          />
        </label>
        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white hover:bg-stone-950 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-stone-600">
        Already registered?{" "}
        <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-emerald-900 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
