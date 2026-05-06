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
        <p className="font-semibold text-orange-600">Mock Strava picker</p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">Choose one of your Strava routes</h1>
        <p className="mt-4 text-lg leading-8 text-stone-600">
          MVP data is mocked. The adapter boundary is ready for real Strava OAuth and route import later.
        </p>
      </div>
      <StravaRoutePicker />
    </main>
  );
}
