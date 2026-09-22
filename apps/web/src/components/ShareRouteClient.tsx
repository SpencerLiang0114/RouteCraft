"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { loadShare, type SharedRoutePayload } from "@/lib/api-client/shares";
import { formatDistance, formatElevation } from "@/lib/units";
import { ExportButtons } from "./ExportButtons";

const RouteMap = dynamic(() => import("./RouteMap").then((mod) => mod.RouteMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-80 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600">
      Loading map…
    </div>
  ),
});

export function ShareRouteClient({
  token,
  initialShare,
}: {
  token: string;
  initialShare: SharedRoutePayload | null;
}) {
  const [share, setShare] = useState(initialShare);
  const [error, setError] = useState<string | null>(initialShare ? null : "Share not found or expired.");

  useEffect(() => {
    if (initialShare) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadShare(token);
        if (!cancelled) {
          setShare(loaded);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Share not found or expired.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialShare, token]);

  if (error || !share) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-3xl font-semibold text-stone-950">Shared route unavailable</h1>
        <p className="mt-3 text-stone-600">{error ?? "This link may have expired."}</p>
      </main>
    );
  }

  const route = share.route;
  const expiresLabel = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(share.expiresAt));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="font-semibold text-emerald-800">Shared route</p>
      <h1 className="mt-2 text-4xl font-semibold text-stone-950">{route.name}</h1>
      <p className="mt-3 text-stone-600">
        {formatDistance(route.distanceKm)} · {formatElevation(route.elevationGainM)} gain · expires {expiresLabel}
      </p>
      {route.notes ? <p className="mt-4 max-w-2xl text-stone-700">{route.notes}</p> : null}
      <div className="mt-8 overflow-hidden rounded-lg border border-stone-200">
        <RouteMap routes={[route]} selectedRouteId={route.id} />
      </div>
      <div className="mt-6">
        <ExportButtons route={route} allowSave={false} />
      </div>
    </main>
  );
}
