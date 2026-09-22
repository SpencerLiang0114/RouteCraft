"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Copy, Download, ExternalLink } from "lucide-react";
import { createShare } from "@/lib/api-client/shares";
import { createGoogleMapsDirectionsUrl } from "@/lib/googleMapsExport";
import { routeToGpx } from "@/lib/gpxExport";
import { routeToKml } from "@/lib/kmlExport";
import { slugify } from "@/lib/geoUtils";
import { useAuthStore } from "@/store/authStore";
import { useRouteStore } from "@/store/routeStore";
import type { RouteCandidate, SavedRoute } from "@/types/route";

function isSavedRoute(route: RouteCandidate): route is SavedRoute {
  return "savedAt" in route && typeof (route as SavedRoute).savedAt === "string";
}

export function ExportButtons({
  route,
  compact = false,
  allowSave = true,
}: {
  route: RouteCandidate;
  compact?: boolean;
  allowSave?: boolean;
}) {
  const saveRoute = useRouteStore((state) => state.saveRoute);
  const savedRoutes = useRouteStore((state) => state.savedRoutes);
  const authStatus = useAuthStore((state) => state.status);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareError, setShareError] = useState(false);
  const savedMatch = isSavedRoute(route)
    ? route
    : savedRoutes.find((entry) => entry.id === route.id);

  const buttonClass = compact
    ? "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50"
    : "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-3 font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50";

  return (
    <div className={`grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-3 xl:grid-cols-5"}`}>
      <a
        href={createGoogleMapsDirectionsUrl(route)}
        target="_blank"
        rel="noreferrer"
        className={buttonClass}
      >
        <ExternalLink size={17} />
        Google Maps
      </a>
      <button
        type="button"
        onClick={() => downloadFile(`${slugify(route.name)}.gpx`, routeToGpx(route), "application/gpx+xml")}
        className={buttonClass}
      >
        <Download size={17} />
        GPX
      </button>
      <button
        type="button"
        onClick={() =>
          downloadFile(`${slugify(route.name)}.kml`, routeToKml(route), "application/vnd.google-earth.kml+xml")
        }
        className={buttonClass}
      >
        <Download size={17} />
        KML
      </button>
      {allowSave ? (
        <button
          type="button"
          onClick={async () => {
            setSaveError(null);
            if (authStatus !== "authenticated") {
              setSaveError("Sign in to save");
              return;
            }
            try {
              await saveRoute(route);
              setSaved(true);
            } catch {
              setSaveError("Save failed");
            }
          }}
          className={buttonClass}
        >
          <Bookmark size={17} />
          {saveError ?? (saved ? "Saved" : "Save route")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={async () => {
          setShareError(false);
          try {
            let url: string;
            if (savedMatch && authStatus === "authenticated") {
              const share = await createShare(savedMatch.id, 168);
              url = `${window.location.origin}${share.urlPath}`;
            } else {
              url = `${window.location.origin}/results?route=${encodeURIComponent(route.id)}`;
            }
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setShareError(true);
          }
        }}
        className={buttonClass}
      >
        <Copy size={17} />
        {shareError ? "Share failed" : copied ? "Copied" : "Share link"}
      </button>
      {allowSave && authStatus !== "authenticated" ? (
        <p className="sm:col-span-full text-sm text-stone-600">
          <Link href="/login" className="font-semibold text-emerald-900 underline">
            Log in
          </Link>{" "}
          to save routes to your account.
        </p>
      ) : null}
    </div>
  );
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
