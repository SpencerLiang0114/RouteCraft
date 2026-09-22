"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Share2 } from "lucide-react";
import { ElevationChart } from "./ElevationChart";
import { ExportButtons } from "./ExportButtons";
import { RouteMap } from "./RouteMap";
import { loadShare, type SharedRoutePayload } from "@/lib/api-client/shares";
import { formatActivity, formatSource } from "@/lib/geoUtils";

export function ShareRouteClient({
  token,
  initialShare = null,
}: {
  token: string;
  initialShare?: SharedRoutePayload | null;
}) {
  const [share, setShare] = useState<SharedRoutePayload | null>(initialShare);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    initialShare ? "ready" : "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialShare) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      setStatus("loading");
      setError(null);
      try {
        const payload = await loadShare(token);
        if (cancelled) return;
        setShare(payload);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not load shared route.");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [initialShare, token]);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="font-semibold text-emerald-800">Loading shared route…</p>
      </div>
    );
  }

  if (status === "error" || !share) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-4xl font-semibold text-stone-950">Share unavailable</h1>
        <p className="mt-4 text-lg leading-8 text-stone-600">
          {error ?? "This share link may have expired or been removed."}
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-stone-950"
        >
          <ArrowLeft size={18} />
          Back to RouteCraft
        </Link>
      </div>
    );
  }

  const route = share.route;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="inline-flex items-center gap-2 font-semibold text-emerald-800">
          <Share2 size={18} />
          Shared route
          {share.sharedByDisplayName ? ` · ${share.sharedByDisplayName}` : ""}
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">{route.name}</h1>
        <p className="mt-3 text-stone-600">
          {formatSource(route.source)} · {formatActivity(route.activity)} · {route.distanceKm} km ·{" "}
          {route.elevationGainM} m gain
        </p>
        {route.notes ? <p className="mt-3 max-w-3xl text-stone-700">{route.notes}</p> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div>
          <RouteMap routes={[route]} selectedRouteId={route.id} />
          {route.elevationProfile && route.elevationProfile.length >= 2 ? (
            <ElevationChart profile={route.elevationProfile} />
          ) : null}
          <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <ExportButtons route={route} allowSave={false} />
          </div>
        </div>

        <aside className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-emerald-800">Route metrics</p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-3 border-b border-stone-100 pb-2">
              <dt className="text-stone-500">Distance</dt>
              <dd className="font-semibold text-stone-950">{route.distanceKm} km</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-stone-100 pb-2">
              <dt className="text-stone-500">Elevation gain</dt>
              <dd className="font-semibold text-stone-950">{route.elevationGainM} m</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-stone-100 pb-2">
              <dt className="text-stone-500">Duration</dt>
              <dd className="font-semibold text-stone-950">{route.estimatedDurationMin} min</dd>
            </div>
            {route.difficulty ? (
              <div className="flex justify-between gap-3 border-b border-stone-100 pb-2">
                <dt className="text-stone-500">Difficulty</dt>
                <dd className="font-semibold text-stone-950">{route.difficulty}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-b border-stone-100 pb-2">
              <dt className="text-stone-500">Total score</dt>
              <dd className="font-semibold text-stone-950">{route.metrics.totalScore}</dd>
            </div>
          </dl>
          <p className="mt-5 leading-7 text-stone-600">{route.explanation}</p>
          {(route.tags ?? []).length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {(route.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
