"use client";

import { useState } from "react";
import { Bookmark, Copy, Download, ExternalLink } from "lucide-react";
import { createGoogleMapsDirectionsUrl } from "@/lib/googleMapsExport";
import { routeToGpx } from "@/lib/gpxExport";
import { routeToKml } from "@/lib/kmlExport";
import { slugify } from "@/lib/geoUtils";
import { useRouteStore } from "@/store/routeStore";
import type { RouteCandidate } from "@/types/route";

export function ExportButtons({
  route,
  compact = false,
}: {
  route: RouteCandidate;
  compact?: boolean;
}) {
  // TODO: Add direct Strava/Garmin export and mobile-app deep links once provider APIs are configured.
  const saveRoute = useRouteStore((state) => state.saveRoute);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
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
        onClick={() => downloadFile(`${slugify(route.name)}.kml`, routeToKml(route), "application/vnd.google-earth.kml+xml")}
        className={buttonClass}
      >
        <Download size={17} />
        KML
      </button>
      <button
        type="button"
        onClick={() => {
          saveRoute(route);
          setSaved(true);
        }}
        className={buttonClass}
      >
        <Bookmark size={17} />
        {saved ? "Saved" : "Save route"}
      </button>
      <button
        type="button"
        onClick={async () => {
          const url = `${window.location.origin}/results?route=${encodeURIComponent(route.id)}`;
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
        className={buttonClass}
      >
        <Copy size={17} />
        {copied ? "Copied" : "Share link"}
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
