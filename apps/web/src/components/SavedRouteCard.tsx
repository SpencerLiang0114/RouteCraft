"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Copy,
  Folder,
  Globe2,
  Lock,
  QrCode,
  RotateCcw,
  CopyPlus,
  Trash2,
  X,
} from "lucide-react";
import { ExportButtons } from "./ExportButtons";
import { createShare } from "@/lib/api-client/shares";
import { formatActivity, formatSource } from "@/lib/geoUtils";
import { useRouteStore } from "@/store/routeStore";
import type { SavedRoute } from "@/types/route";

export function SavedRouteCard({ route }: { route: SavedRoute }) {
  const router = useRouter();
  const updateRoute = useRouteStore((state) => state.updateRoute);
  const deleteRoute = useRouteStore((state) => state.deleteRoute);
  const duplicateRoute = useRouteStore((state) => state.duplicateRoute);
  const setResults = useRouteStore((state) => state.setResults);

  const [name, setName] = useState(route.name);
  const [notes, setNotes] = useState(route.notes ?? "");
  const [tagsInput, setTagsInput] = useState((route.tags ?? []).join(", "));
  const [folder, setFolder] = useState(route.folder ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const visibility = route.visibility ?? "private";
  const savedDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(route.savedAt));

  const tags = useMemo(
    () =>
      tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [tagsInput],
  );

  async function persistPatch(patch: Parameters<typeof updateRoute>[1]) {
    setBusy(true);
    setMessage(null);
    try {
      await updateRoute(route.id, patch);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveMeta(event: FormEvent) {
    event.preventDefault();
    await persistPatch({
      name: name.trim() || route.name,
      notes: notes.trim() || undefined,
      tags,
      folder: folder.trim() || null,
    });
  }

  async function onToggleVisibility() {
    await persistPatch({
      visibility: visibility === "public" ? "private" : "public",
    });
  }

  async function onDuplicate() {
    setBusy(true);
    setMessage(null);
    try {
      await duplicateRoute(route.id);
      setMessage("Duplicated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Delete “${route.name}”?`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await deleteRoute(route.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
      setBusy(false);
    }
  }

  async function onShare() {
    setBusy(true);
    setMessage(null);
    try {
      const share = await createShare(route.id);
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${share.urlPath.startsWith("/") ? share.urlPath : `/share/${share.token}`}`
          : share.urlPath;
      setShareUrl(url);
      setShareOpen(true);
      setShareCopied(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Share failed");
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
              aria-label="Route name"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Notes"
              className="w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 text-sm text-stone-800 outline-none focus:border-emerald-700"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Tags
                </span>
                <input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="trail, lunch loop"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 text-sm outline-none focus:border-emerald-700"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Folder
                </span>
                <input
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                  placeholder="Favorites"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-[#f7f5ee] px-3 py-2 text-sm outline-none focus:border-emerald-700"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              Save details
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-3 text-sm text-stone-600">
            <span>{route.distanceKm} km</span>
            <span>{route.elevationGainM} m gain</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={15} />
              Saved {savedDate}
            </span>
            {route.folder ? (
              <span className="inline-flex items-center gap-1">
                <Folder size={15} />
                {route.folder}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              {visibility === "public" ? <Globe2 size={15} /> : <Lock size={15} />}
              {visibility}
            </span>
          </div>
          {(route.tags ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(route.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {message ? <p className="mt-2 text-sm font-semibold text-emerald-800">{message}</p> : null}
        </div>

        <div className="flex flex-col gap-2 md:w-44">
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
            onClick={() => {
              void onToggleVisibility();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          >
            {visibility === "public" ? <Lock size={16} /> : <Globe2 size={16} />}
            {visibility === "public" ? "Make private" : "Make public"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void onShare();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          >
            <QrCode size={16} />
            Share
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void onDuplicate();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:border-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          >
            <CopyPlus size={16} />
            Duplicate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void onDelete();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>

      <div className="mt-5">
        <ExportButtons route={route} compact />
      </div>

      {shareOpen && shareUrl ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-stone-950">Share route</h3>
                <p className="mt-1 text-sm text-stone-600">Anyone with the link can view this route.</p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {/* External QR API; next/image not needed for this ephemeral modal asset. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`}
              alt="QR code for share link"
              width={160}
              height={160}
              className="mx-auto mt-5 rounded-md border border-stone-200"
            />
            <p className="mt-4 break-all rounded-lg bg-[#f7f5ee] px-3 py-2 text-xs text-stone-700">
              {shareUrl}
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setShareCopied(true);
              }}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white hover:bg-stone-950"
            >
              <Copy size={17} />
              {shareCopied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
