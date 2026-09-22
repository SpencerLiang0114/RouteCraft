"use client";

import { useState } from "react";
import { Bookmark, Copy, Download, ExternalLink } from "lucide-react";
import { createShare } from "@/lib/api-client/shares";
import { createGoogleMapsDirectionsUrl } from "@/lib/googleMapsExport";
import { routeToGpx } from "@/lib/gpxExport";
import { routeToKml } from "@/lib/kmlExport";
import { slugify } from "@/lib/geoUtils";
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
  // TODO: Add direct Strava/Garmin export and mobile-app deep links once provider APIs are configured.
  const saveRoute = useRouteStore((state) => state.saveRoute);
  const savedRoutes = useRouteStore((state) => state.savedRoutes);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [shareError, setShareError] = useState(false);
  const savedMatch = isSavedRoute(route)
    ? route
    : savedRoutes.find((entry) => entry.id === route.id);
  const buttonClass = compact
    ? "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50"
    : "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-3 font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50";

  const gridClass = compact
    ? allowSave
      ? "sm:grid-cols-2"
      : "sm:grid-cols-2"
    : allowSave
      ? "sm:grid-cols-3 xl:grid-cols-5"
      : "sm:grid-cols-2 xl:grid-cols-4";

  return (
    <div className={`grid gap-2 ${gridClass}`}>
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
        onClick={() => downloadFile(`${slugify(route.name)}.kml`, routeToKml(route), "application/vnd.google-earth.kml+xml")}
        className={buttonClass}
      >
        <Download size={17} />
        KML
      </button>
      {allowSave ? (
        <button
          type="button"
          onClick={async () => {
            setSaveError(false);
            try {
              await saveRoute(route);
              setSaved(true);
            } catch {
              setSaveError(true);
            }
          }}
          className={buttonClass}
        >
          <Bookmark size={17} />
          {saveError ? "Save failed" : saved ? "Saved" : "Save route"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={async () => {
          setShareError(false);
          try {
            let url: string;
            if (savedMatch) {
              const share = await createShare(savedMatch.id);
              url = `${window.location.origin}${
                share.urlPath.startsWith("/") ? share.urlPath : `/share/${share.token}`
              }`;
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
