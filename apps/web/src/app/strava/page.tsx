import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StravaConnectBanner } from "@/components/StravaConnectBanner";
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
          Connect your Strava account after signing in to load live nearby segments; otherwise
          RouteCraft shows local mock routes.
        </p>
      </div>
      <StravaConnectBanner />
      <StravaRoutePicker />
    </main>
  );
}
