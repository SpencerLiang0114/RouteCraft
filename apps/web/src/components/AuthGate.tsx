"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

function sanitizeNext(pathname: string | null): string {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("..")) {
    return "/saved";
  }
  return pathname;
}

export function AuthGate({ children }: { children: ReactNode }) {
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
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(sanitizeNext(pathname))}`);
    }
  }, [pathname, router, status]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-semibold text-emerald-800">Checking session…</p>
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-semibold text-emerald-800">Redirecting to login…</p>
        <Link href="/login" className="mt-4 inline-block font-semibold text-stone-700 underline">
          Continue to login
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
