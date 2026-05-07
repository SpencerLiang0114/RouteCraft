import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StravaRoutePicker } from "@/components/StravaRoutePicker";

export default function StravaPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href="/route-source" className="inline-flex items-center gap-2 font-semibold text-stone-700 hover:text-emerald-900">
        <ArrowLeft size={18} />
        Route source
      </Link>
      <div className="mb-8 mt-6 max-w-3xl">
        <p className="font-semibold text-orange-600">Strava route map</p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">Explore existing routes near you</h1>
        <p className="mt-4 text-lg leading-8 text-stone-600">
          MVP data is mocked and centered on your browser location when available. Real saved routes and
          nearby Strava segments can be wired in through Strava OAuth/API later.
        </p>
      </div>
      <StravaRoutePicker />
    </main>
  );
}
