import { Bike, Footprints, Mountain } from "lucide-react";
import type { ActivityType } from "@/types/route";
import { formatActivity } from "@/lib/geoUtils";

const activities: Array<{ value: ActivityType; icon: typeof Footprints; helper: string }> = [
  { value: "running", icon: Footprints, helper: "Smooth paths, parks, fewer crossings" },
  { value: "hiking", icon: Mountain, helper: "Trails, scenery, elevation profile" },
  { value: "cycling", icon: Bike, helper: "Bike lanes, safer roads, steady grades" },
];

export function ActivitySelector({
  value,
  onChange,
}: {
  value: ActivityType;
  onChange: (value: ActivityType) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {activities.map((activity) => {
        const Icon = activity.icon;
        const selected = value === activity.value;

        return (
          <button
            key={activity.value}
            type="button"
            onClick={() => onChange(activity.value)}
            className={`min-h-44 rounded-lg border p-5 text-left transition ${
              selected
                ? "border-emerald-800 bg-emerald-950 text-white shadow-lg"
                : "border-stone-200 bg-white text-stone-950 hover:border-emerald-700"
            }`}
          >
            <Icon size={26} />
            <span className="mt-6 block text-2xl font-semibold">{formatActivity(activity.value)}</span>
            <span className={`mt-2 block text-sm ${selected ? "text-emerald-50" : "text-stone-600"}`}>
              {activity.helper}
            </span>
          </button>
        );
      })}
    </div>
  );
}
