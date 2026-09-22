"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStravaConnectUrl, getStravaStatus } from "@/lib/api-client/auth";
import { useAuthStore } from "@/store/authStore";

export function StravaConnectBanner() {
  const authStatus = useAuthStore((state) => state.status);
  const [connected, setConnected] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          setStatusLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setConnected(false);
          setStatusLoaded(true);
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
        and connect Strava to load live segments for your account.
      </div>
    );
  }

  if (!statusLoaded) {
    return (
      <div className="mb-6 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
        Checking Strava connection…
      </div>
    );
  }

  if (connected) {
    return (
      <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        Strava is connected for this account. Live segments use your OAuth token.
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
      <p>Connect Strava to replace mock segments with live explore results.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            const url = await getStravaConnectUrl();
            window.location.href = url;
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not start Strava connect.");
            setBusy(false);
          }
        }}
        className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
      >
        {busy ? "Redirecting…" : "Connect Strava"}
      </button>
      {message ? <p className="w-full text-orange-800">{message}</p> : null}
    </div>
  );
}
