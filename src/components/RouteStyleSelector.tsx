import { ArrowUpRight, Leaf, MountainSnow, Sparkles, SunMedium, Trees } from "lucide-react";
import type { RouteStyle } from "@/types/route";

const styles: Array<{ value: RouteStyle; label: string; icon: typeof Leaf }> = [
  { value: "easy_flat", label: "Easy flat route", icon: Leaf },
  { value: "park_heavy", label: "Park-heavy route", icon: Trees },
  { value: "shaded", label: "Shaded route", icon: SunMedium },
  { value: "scenic", label: "Scenic route", icon: Sparkles },
  { value: "climbing", label: "Climbing route", icon: MountainSnow },
  { value: "exploration", label: "Exploration route", icon: ArrowUpRight },
];

export function RouteStyleSelector({
  value,
  onChange,
}: {
  value?: RouteStyle;
  onChange: (value: RouteStyle) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {styles.map((style) => {
        const Icon = style.icon;
        const selected = value === style.value;

        return (
          <button
            key={style.value}
            type="button"
            onClick={() => onChange(style.value)}
            className={`min-h-32 rounded-lg border p-4 text-left ${
              selected
                ? "border-emerald-800 bg-emerald-950 text-white"
                : "border-stone-200 bg-white hover:border-emerald-700"
            }`}
          >
            <Icon size={23} />
            <span className="mt-5 block font-semibold">{style.label}</span>
          </button>
        );
      })}
    </div>
  );
}
