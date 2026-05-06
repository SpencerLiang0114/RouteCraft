"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, LoaderCircle } from "lucide-react";
import { parseGpxRoute } from "@/lib/gpxParser";
import { parseKmlRoute } from "@/lib/kmlParser";
import { useRouteStore } from "@/store/routeStore";

export function AllTrailsUpload() {
  const [message, setMessage] = useState("Export a GPX or KML route file, then upload it here.");
  const [isParsing, setIsParsing] = useState(false);
  const setResults = useRouteStore((state) => state.setResults);
  const router = useRouter();

  async function handleFile(file?: File) {
    if (!file) {
      return;
    }

    setIsParsing(true);
    setMessage("Reading route file...");

    try {
      const text = await file.text();
      const lowerName = file.name.toLowerCase();
      const candidate = lowerName.endsWith(".gpx")
        ? parseGpxRoute(text, file.name.replace(/\.[^.]+$/, ""))
        : parseKmlRoute(text, file.name.replace(/\.[^.]+$/, ""));

      setResults([candidate], candidate.id);
      router.push("/results");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not parse this route file.");
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <section className="rounded-lg border border-dashed border-emerald-700 bg-emerald-50/60 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-stone-950">Upload a route file</h2>
          <p className="mt-2 text-stone-600">{message}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-900">Accepted files: .gpx, .kml</p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-900 px-5 py-3 font-semibold text-white hover:bg-stone-950">
          {isParsing ? <LoaderCircle size={18} className="animate-spin" /> : <FileUp size={18} />}
          Choose file
          <input
            type="file"
            accept=".gpx,.kml"
            className="sr-only"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
      </div>
    </section>
  );
}
