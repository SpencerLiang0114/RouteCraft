import Link from "next/link";
import { Bookmark, Compass, Map } from "lucide-react";

export function AppHeader() {
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
        </nav>
      </div>
    </header>
  );
}
