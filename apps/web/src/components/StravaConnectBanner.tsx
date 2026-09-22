"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStravaConnectUrl, getStravaStatus } from "@/lib/api-client/auth";
import { useAuthStore } from "@/store/authStore";

export function StravaConnectBanner() {
  const authStatus = useAuthStore((state) => state.status);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await getStravaStatus();
        if (!cancelled) {
          setConnected(status.connected);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setConnected(false);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  if (authStatus !== "authenticated") {
    return (
      <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
        <Link href="/login" className="font-semibold underline">
          Sign in
        </Link>{" "}
        and connect Strava for live segments. Otherwise mock routes are shown.
      </div>
    );
  }

  if (!loaded) {
    return null;
  }

  if (connected) {
    return (
      <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        Strava is connected for this account.
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
      <p>Connect Strava to load live nearby segments with your account token.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            window.location.href = await getStravaConnectUrl();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not start Strava connect.");
            setBusy(false);
          }
        }}
        className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
      >
        Connect Strava
      </button>
      {message ? <p className="w-full text-orange-800">{message}</p> : null}
    </div>
  );
}
