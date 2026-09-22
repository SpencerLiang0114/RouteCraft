"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export function AuthGate({
  children,
  mode = "redirect",
}: {
  children: ReactNode;
  mode?: "redirect" | "banner";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const loadMe = useAuthStore((state) => state.loadMe);

  useEffect(() => {
    if (status === "idle") {
      void loadMe();
    }
  }, [loadMe, status]);

  useEffect(() => {
    if (mode === "redirect" && status === "anonymous") {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [mode, pathname, router, status]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-semibold text-emerald-800">Checking session…</p>
      </div>
    );
  }

  if (status === "anonymous") {
    if (mode === "banner") {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="rounded-lg border border-stone-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-stone-950">Sign in to continue</h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-stone-600">
              Saved routes and library features require an account.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={`/login?next=${encodeURIComponent(pathname || "/saved")}`}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-stone-950"
              >
                Log in
              </Link>
              <Link
                href={`/register?next=${encodeURIComponent(pathname || "/saved")}`}
                className="inline-flex items-center justify-center rounded-lg border border-stone-300 px-5 py-3 font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50"
              >
                Create account
              </Link>
            </div>
          </section>
          {children}
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-semibold text-emerald-800">Redirecting to login…</p>
      </div>
    );
  }

  return <>{children}</>;
}
