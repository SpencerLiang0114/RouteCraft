"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, RotateCcw, Trash2 } from "lucide-react";
import { ExportButtons } from "./ExportButtons";
import { createShare } from "@/lib/api-client/shares";
import { formatActivity, formatSource } from "@/lib/geoUtils";
import { formatDistance, formatElevation } from "@/lib/units";
import { useRouteStore } from "@/store/routeStore";
import type { SavedRoute } from "@/types/route";

export function SavedRouteCard({ route }: { route: SavedRoute }) {
  const router = useRouter();
  const setResults = useRouteStore((state) => state.setResults);
  const updateRoute = useRouteStore((state) => state.updateRoute);
  const deleteRoute = useRouteStore((state) => state.deleteRoute);
  const [name, setName] = useState(route.name);
  const [notes, setNotes] = useState(route.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const savedDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(route.savedAt));

  async function onSaveMeta(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await updateRoute(route.id, {
        name: name.trim() || route.name,
        notes: notes.trim() || null,
      });
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-emerald-800">
            {formatSource(route.source)} · {formatActivity(route.activity)}
          </p>
          <form onSubmit={onSaveMeta} className="mt-2 space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 text-2xl font-semibold text-stone-950 outline-none focus:border-emerald-700"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 text-sm text-stone-800 outline-none focus:border-emerald-700"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold hover:border-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                Save details
              </button>
              {message ? <span className="self-center text-sm text-stone-600">{message}</span> : null}
            </div>
          </form>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-stone-600">
            <span>{formatDistance(route.distanceKm)}</span>
            <span>{formatElevation(route.elevationGainM)} gain</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={15} />
              Saved {savedDate}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setResults([route], route.id);
              router.push("/results");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 py-3 font-semibold text-white hover:bg-emerald-950"
          >
            <RotateCcw size={17} />
            Reopen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              try {
                const share = await createShare(route.id, 168);
                const url = `${window.location.origin}${share.urlPath}`;
                setShareUrl(url);
                await navigator.clipboard.writeText(url);
                setMessage("Share link copied (7 days)");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Share failed");
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-3 font-semibold hover:border-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          >
            <Copy size={17} />
            Share (7d)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Delete “${route.name}”?`)) {
                return;
              }
              setBusy(true);
              try {
                await deleteRoute(route.id);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Delete failed");
                setBusy(false);
              }
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-3 font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 size={17} />
            Delete
          </button>
        </div>
      </div>
      {shareUrl ? (
        <p className="mt-4 break-all rounded-lg bg-[#f7f5ee] px-3 py-2 text-xs text-stone-700">{shareUrl}</p>
      ) : null}
      <div className="mt-5">
        <ExportButtons route={route} compact />
      </div>
    </article>
  );
}
