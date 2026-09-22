"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/saved";
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.error);
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
        Join RouteCraft
      </p>
      <h1 className="mt-2 text-4xl font-semibold text-stone-950">Create account</h1>
      <p className="mt-3 text-stone-600">
        Save routes, organize folders, and share trails with friends.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-semibold text-stone-700">Display name</span>
          <input
            type="text"
            required
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-3 text-stone-950 outline-none focus:border-emerald-700"
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
            className="mt-2 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-3 text-stone-950 outline-none focus:border-emerald-700"
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
            className="mt-2 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-3 text-stone-950 outline-none focus:border-emerald-700"
          />
        </label>

        {(formError || error) && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {formError || error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white hover:bg-stone-950 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          className="font-semibold text-emerald-800 hover:text-stone-950"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
