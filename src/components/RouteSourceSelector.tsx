import Link from "next/link";
import { Bike, Footprints, Mountain, Route } from "lucide-react";

const options = [
  {
    href: "/strava",
    title: "Choose from Strava",
    body: "Select one of your saved Strava routes and analyze it with RouteCraft.",
    icon: Bike,
    accent: "bg-orange-500",
  },
  {
    href: "/alltrails",
    title: "Choose from AllTrails",
    body: "Choose or upload an AllTrails route and analyze distance, elevation, shade, parks, and safety.",
    icon: Mountain,
    accent: "bg-emerald-700",
  },
  {
    href: "/wizard",
    title: "Generate a new route",
    body: "Create a new personalized route from your preferences.",
    icon: Route,
    accent: "bg-cyan-700",
  },
];

export function RouteSourceSelector() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {options.map((option) => {
        const Icon = option.icon;

        return (
          <Link
            href={option.href}
            key={option.title}
            className="group flex min-h-72 flex-col justify-between rounded-lg border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-emerald-700 hover:shadow-xl"
          >
            <div>
              <div
                className={`mb-8 grid size-14 place-items-center rounded-lg ${option.accent} text-white`}
              >
                <Icon size={25} />
              </div>
              <h2 className="text-2xl font-semibold text-stone-950">{option.title}</h2>
              <p className="mt-4 text-base leading-7 text-stone-600">{option.body}</p>
            </div>
            <div className="mt-8 inline-flex items-center gap-2 font-semibold text-emerald-900">
              Start here
              <Footprints size={18} className="transition group-hover:translate-x-1" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
