import type { UserPreferences } from "@/types/route";

const preferences = [
  ["parkPreference", "Park preference"],
  ["shadePreference", "Shade preference"],
  ["elevationPreference", "Elevation difficulty"],
  ["safetyPreference", "Safety priority"],
  ["explorationPreference", "Exploration / novelty"],
] as const;

const labels = ["Low", "Medium", "High"];

export function PreferenceSliders({
  value,
  onChange,
}: {
  value: UserPreferences;
  onChange: (value: UserPreferences) => void;
}) {
  return (
    <div className="grid gap-4">
      {preferences.map(([key, label]) => {
        const level = value[key];

        return (
          <div key={key} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold text-stone-950">{label}</span>
              <span className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">
                {labels[level - 1]}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 rounded-lg bg-stone-100 p-1">
              {[1, 2, 3].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange({ ...value, [key]: option })}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    level === option ? "bg-emerald-950 text-white" : "text-stone-600 hover:bg-white"
                  }`}
                >
                  {labels[option - 1]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
