"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Route } from "lucide-react";
import { ActivitySelector } from "./ActivitySelector";
import { DepartureTimeSelector } from "./DepartureTimeSelector";
import { PreferenceSliders } from "./PreferenceSliders";
import { RouteGoalSelector } from "./RouteGoalSelector";
import { RouteStyleSelector } from "./RouteStyleSelector";
import { RouteSummary } from "./RouteSummary";
import { StartPointPicker } from "./StartPointPicker";
import { generateRoutes as generateRoutesRequest } from "@/lib/api-client/routing";
import { useRouteStore } from "@/store/routeStore";
import type { UserPreferences } from "@/types/route";

const initialPreferences: UserPreferences = {
  activity: "running",
  routeType: "out_and_back",
  targetDistanceKm: 5,
  parkPreference: 3,
  shadePreference: 2,
  elevationPreference: 1,
  safetyPreference: 3,
  explorationPreference: 2,
  departureTime: "Afternoon",
  routeStyle: "park_heavy",
};

const stepTitles = [
  "Choose activity type",
  "Choose start point",
  "Choose route goal",
  "Choose route style",
  "Adjust preferences",
  "Choose departure time",
  "Review before generating",
];

export function WizardClient() {
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<UserPreferences>(initialPreferences);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);
  const setResults = useRouteStore((state) => state.setResults);
  const router = useRouter();
  const progress = useMemo(() => Math.round(((step + 1) / stepTitles.length) * 100), [step]);
  const cannotContinue =
    (step === 1 && !preferences.startPoint) ||
    (step === 2 && preferences.routeType === "point_to_point" && !preferences.endPoint);

  async function generateRoutes() {
    setIsGenerating(true);
    setGenerationMessage(null);

    try {
      const { routes: candidates, message } = await generateRoutesRequest(preferences);

      setResults(candidates, candidates[0]?.id);
      setGenerationMessage(message ?? null);
      router.push("/results");
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : "Could not generate routes.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="font-semibold text-emerald-800">Step {step + 1} of {stepTitles.length}</p>
        <h1 className="mt-2 text-4xl font-semibold text-stone-950">{stepTitles[step]}</h1>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full bg-emerald-800 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="min-h-[420px]">
        {step === 0 && (
          <ActivitySelector
            value={preferences.activity}
            onChange={(activity) => setPreferences({ ...preferences, activity })}
          />
        )}
        {step === 1 && (
          <StartPointPicker
            value={preferences.startPoint}
            onChange={(startPoint) => setPreferences({ ...preferences, startPoint })}
          />
        )}
        {step === 2 && (
          <RouteGoalSelector preferences={preferences} onChange={setPreferences} />
        )}
        {step === 3 && (
          <RouteStyleSelector
            value={preferences.routeStyle}
            onChange={(routeStyle) => setPreferences({ ...preferences, routeStyle })}
          />
        )}
        {step === 4 && <PreferenceSliders value={preferences} onChange={setPreferences} />}
        {step === 5 && (
          <DepartureTimeSelector
            value={preferences.departureTime}
            onChange={(departureTime) => setPreferences({ ...preferences, departureTime })}
          />
        )}
        {step === 6 && <RouteSummary preferences={preferences} />}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 px-5 py-3 font-semibold text-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        {step < stepTitles.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((current) => Math.min(stepTitles.length - 1, current + 1))}
            disabled={cannotContinue}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-stone-950 px-5 py-3 font-semibold text-white hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
            <ArrowRight size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={generateRoutes}
            disabled={isGenerating}
            aria-busy={isGenerating}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 py-3 font-semibold text-white hover:bg-stone-950 disabled:cursor-wait disabled:opacity-70"
          >
            {isGenerating ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <Route size={18} aria-hidden="true" />
            )}
            {isGenerating ? "Generating..." : "Generate Routes"}
          </button>
        )}
      </div>
      {generationMessage && (
        <p className="mt-4 text-sm font-semibold text-amber-800" role="status">
          {generationMessage}
        </p>
      )}
    </div>
  );
}
