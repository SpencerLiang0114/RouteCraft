import { Clock, Flag, RotateCw, Route } from "lucide-react";
import type { RouteGoalMode, UserPreferences } from "@/types/route";

const goals: Array<{ value: RouteGoalMode; label: string; icon: typeof Route }> = [
  { value: "distance", label: "By distance", icon: Route },
  { value: "time", label: "By time", icon: Clock },
  { value: "point_to_point", label: "Point-to-point", icon: Flag },
  { value: "loop", label: "Loop route", icon: RotateCw },
];

export function RouteGoalSelector({
  preferences,
  onChange,
}: {
  preferences: UserPreferences;
  onChange: (preferences: UserPreferences) => void;
}) {
  const goalMode = preferences.goalMode ?? "distance";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        {goals.map((goal) => {
          const Icon = goal.icon;
          const selected = goalMode === goal.value;

          return (
            <button
              key={goal.value}
              type="button"
              onClick={() =>
                onChange({
                  ...preferences,
                  goalMode: goal.value,
                  routeType:
                    goal.value === "point_to_point"
                      ? "point_to_point"
                      : goal.value === "loop"
                        ? "loop"
                        : preferences.routeType,
                  endPoint:
                    goal.value === "point_to_point"
                      ? { lat: 40.036, lng: -105.236 }
                      : preferences.endPoint,
                })
              }
              className={`min-h-32 rounded-lg border p-4 text-left ${
                selected
                  ? "border-emerald-800 bg-emerald-950 text-white"
                  : "border-stone-200 bg-white hover:border-emerald-700"
              }`}
            >
              <Icon size={23} />
              <span className="mt-5 block font-semibold">{goal.label}</span>
            </button>
          );
        })}
      </div>

      {goalMode === "distance" && (
        <PresetRow
          label="Distance presets"
          values={[
            { label: "3 km", value: 3 },
            { label: "5 km", value: 5 },
            { label: "10 km", value: 10 },
          ]}
          customValue={preferences.targetDistanceKm ?? 8}
          selectedValue={preferences.targetDistanceKm}
          suffix="km"
          onSelect={(value) =>
            onChange({ ...preferences, targetDistanceKm: value, targetDurationMin: undefined })
          }
          onCustom={(value) =>
            onChange({ ...preferences, targetDistanceKm: value, targetDurationMin: undefined })
          }
        />
      )}

      {goalMode === "time" && (
        <PresetRow
          label="Time presets"
          values={[
            { label: "30 min", value: 30 },
            { label: "60 min", value: 60 },
            { label: "2 hr", value: 120 },
          ]}
          customValue={preferences.targetDurationMin ?? 75}
          selectedValue={preferences.targetDurationMin}
          suffix="min"
          onSelect={(value) =>
            onChange({ ...preferences, targetDurationMin: value, targetDistanceKm: undefined })
          }
          onCustom={(value) =>
            onChange({ ...preferences, targetDurationMin: value, targetDistanceKm: undefined })
          }
        />
      )}
    </div>
  );
}

function PresetRow({
  label,
  values,
  selectedValue,
  customValue,
  suffix,
  onSelect,
  onCustom,
}: {
  label: string;
  values: Array<{ label: string; value: number }>;
  selectedValue?: number;
  customValue: number;
  suffix: string;
  onSelect: (value: number) => void;
  onCustom: (value: number) => void;
}) {
  const isCustom = selectedValue !== undefined && !values.some((item) => item.value === selectedValue);

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="font-semibold text-stone-950">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              selectedValue === item.value
                ? "bg-emerald-950 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-emerald-100"
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onCustom(customValue)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            isCustom ? "bg-emerald-950 text-white" : "bg-stone-100 text-stone-700 hover:bg-emerald-100"
          }`}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <label className="mt-5 block text-sm font-semibold text-stone-700">
          Custom value: {customValue} {suffix}
          <input
            type="range"
            min={suffix === "km" ? 2 : 20}
            max={suffix === "km" ? 40 : 180}
            step={suffix === "km" ? 1 : 5}
            value={customValue}
            onChange={(event) => onCustom(Number(event.target.value))}
            className="mt-3 w-full accent-emerald-800"
          />
        </label>
      )}
    </div>
  );
}
