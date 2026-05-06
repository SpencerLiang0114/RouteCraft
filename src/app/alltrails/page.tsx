import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AllTrailsRoutePicker } from "@/components/AllTrailsRoutePicker";
import { AllTrailsUpload } from "@/components/AllTrailsUpload";

export default function AllTrailsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href="/route-source" className="inline-flex items-center gap-2 font-semibold text-stone-700 hover:text-emerald-900">
        <ArrowLeft size={18} />
        Route source
      </Link>
      <div className="mb-8 mt-6 max-w-3xl">
        <p className="font-semibold text-emerald-800">Mock AllTrails picker / upload</p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">Choose or upload an AllTrails route</h1>
        <p className="mt-4 text-lg leading-8 text-stone-600">
          Pick from mock trails, or upload a GPX/KML file exported from another route planner.
        </p>
      </div>
      <div className="grid gap-8">
        <AllTrailsRoutePicker />
        <AllTrailsUpload />
      </div>
    </main>
  );
}
