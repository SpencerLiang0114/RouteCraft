"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bookmark, Compass, LogOut, Map } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export function AppHeader() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const loadMe = useAuthStore((state) => state.loadMe);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (status === "idle") {
      void loadMe();
    }
  }, [loadMe, status]);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f7f5ee]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 font-semibold text-stone-950">
          <span className="grid size-10 place-items-center rounded-lg bg-emerald-950 text-white shadow-sm">
            <Compass size={21} />
          </span>
          <span className="text-xl">RouteCraft</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <Link
            href="/route-source"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-emerald-100 hover:text-emerald-950"
          >
            <Map size={17} />
            Create
          </Link>
          <Link
            href="/saved"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-emerald-100 hover:text-emerald-950"
          >
            <Bookmark size={17} />
            Saved
          </Link>
          {status === "authenticated" && user ? (
            <>
              <span className="hidden max-w-[12rem] truncate px-2 text-stone-500 sm:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => {
                  void logout();
                }}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-emerald-100 hover:text-emerald-950"
              >
                <LogOut size={17} />
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-white hover:bg-stone-950"
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
