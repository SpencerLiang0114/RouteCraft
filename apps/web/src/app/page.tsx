import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Bike, Footprints, Mountain, Route } from "lucide-react";

export default function Home() {
  return (
    <main>
      <section className="relative isolate min-h-[78vh] overflow-hidden bg-emerald-950 px-4 py-20 text-white sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[#163d32]" />
        <div className="absolute inset-0 -z-10 opacity-70">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:56px_56px]" />
          <svg viewBox="0 0 1200 780" className="size-full">
            <path
              d="M76 606 C 226 452, 374 508, 486 352 S 760 170, 1024 284"
              fill="none"
              stroke="#f2c14e"
              strokeLinecap="round"
              strokeWidth="18"
            />
            <path
              d="M150 214 C 290 284, 360 176, 512 234 S 742 434, 1090 372"
              fill="none"
              stroke="#7fb069"
              strokeLinecap="round"
              strokeWidth="10"
              opacity="0.78"
            />
            <path
              d="M226 680 C 372 612, 452 634, 600 548 S 806 472, 1058 612"
              fill="none"
              stroke="#52a2a3"
              strokeLinecap="round"
              strokeWidth="12"
              opacity="0.7"
            />
            <circle cx="76" cy="606" r="22" fill="#fff" />
            <circle cx="1024" cy="284" r="22" fill="#b45309" />
          </svg>
        </div>
        <div className="mx-auto flex min-h-[58vh] max-w-7xl flex-col justify-center">
          <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-lg bg-white/12 px-4 py-2 font-semibold text-emerald-50 ring-1 ring-white/20">
            <Route size={18} />
            RouteCraft
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.05] text-white">
            Plan smarter running, hiking, and cycling routes.
          </h1>
          <p className="mt-6 max-w-3xl text-xl leading-8 text-emerald-50">
            Choose a route from Strava, or generate a personalized route based on parks,
            shade, elevation, safety, and exploration preferences.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/route-source"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#f2c14e] px-6 py-4 font-semibold text-stone-950 hover:bg-white"
            >
              Create a Route
              <ArrowRight size={19} />
            </Link>
            <Link
              href="/saved"
              className="inline-flex items-center justify-center rounded-lg border border-white/35 px-6 py-4 font-semibold text-white hover:bg-white/10"
            >
              View saved routes
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.7fr)] lg:px-8">
        <figure className="overflow-hidden rounded-lg border border-stone-200 bg-background p-2 shadow-sm">
          <Image
            src="/routecraft2.png"
            alt="RouteCraft route recommendation demo with a map, elevation profile, and route score"
            width={1129}
            height={803}
            sizes="(max-width: 1024px) 100vw, 68vw"
            loading="eager"
            className="h-full w-full rounded-md object-contain"
          />
        </figure>

        <div className="grid gap-4">
          <Feature icon={<Footprints size={24} />} title="Running" text="Distance accuracy, parks, safety, and fewer complex crossings." />
          <Feature icon={<Mountain size={24} />} title="Hiking" text="Trail feel, scenery, elevation profile, and natural shade." />
          <Feature icon={<Bike size={24} />} title="Cycling" text="Bike-friendly corridors, safer roads, surfaces, and manageable climbs." />
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <div className="grid size-12 place-items-center rounded-lg bg-emerald-100 text-emerald-900">{icon}</div>
      <h2 className="mt-5 text-2xl font-semibold text-stone-950">{title}</h2>
      <p className="mt-3 leading-7 text-stone-600">{text}</p>
    </article>
  );
}
