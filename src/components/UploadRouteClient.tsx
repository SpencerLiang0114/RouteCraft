"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Upload } from "lucide-react";
import { parseGpxRoute } from "@/lib/gpxParser";
import { parseKmlRoute } from "@/lib/kmlParser";
import { useRouteStore } from "@/store/routeStore";

export function UploadRouteClient() {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setResults = useRouteStore((state) => state.setResults);
  const router = useRouter();

  async function processFile(file: File) {
    setFileName(file.name);
    setError(null);
    setIsParsing(true);

    try {
      const text = await file.text();
      const ext = file.name.split(".").pop()?.toLowerCase();

      let route;
      if (ext === "gpx") {
        route = parseGpxRoute(text, file.name.replace(/\.gpx$/i, ""));
      } else if (ext === "kml") {
        route = parseKmlRoute(text, file.name.replace(/\.kml$/i, ""));
      } else {
        throw new Error("Only .gpx and .kml files are supported.");
      }

      setResults([route], route.id);
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse route file.");
      setIsParsing(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    void processFile(files[0]);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <p className="font-semibold text-emerald-800">Import a route</p>
      <h1 className="mt-2 text-4xl font-semibold text-stone-950">Upload GPX or KML</h1>
      <p className="mt-4 text-base leading-7 text-stone-600">
        Import a route exported from Garmin Connect, AllTrails, Strava, or any GPS device.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`mt-8 flex min-h-52 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-8 transition ${
          isDragging
            ? "border-emerald-600 bg-emerald-50"
            : "border-stone-300 bg-white hover:border-emerald-500 hover:bg-emerald-50/40"
        }`}
      >
        <div className="grid size-14 place-items-center rounded-xl bg-stone-100">
          <FileUp size={26} className="text-stone-500" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-stone-950">
            {fileName ?? "Drop your file here"}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {fileName ? "Parsing…" : "or click to browse — .gpx and .kml supported"}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,.kml"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      {isParsing && !error && (
        <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-stone-600">
          <Upload size={16} className="animate-bounce" />
          Parsing route…
        </div>
      )}
    </div>
  );
}
