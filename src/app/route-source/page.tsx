import { RouteSourceSelector } from "@/components/RouteSourceSelector";

export default function RouteSourcePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <p className="font-semibold text-emerald-800">Start a route</p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">
          How do you want to create your route?
        </h1>
      </div>
      <RouteSourceSelector />
    </main>
  );
}
