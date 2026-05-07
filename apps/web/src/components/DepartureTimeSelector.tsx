import { Clock3, Moon, Sunrise, SunMedium, TimerReset } from "lucide-react";

const times = [
  { value: "Now", icon: TimerReset },
  { value: "Morning", icon: Sunrise },
  { value: "Afternoon", icon: SunMedium },
  { value: "Evening", icon: Moon },
  { value: "Custom time", icon: Clock3 },
];

export function DepartureTimeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      {times.map((time) => {
        const Icon = time.icon;
        const selected = value === time.value;

        return (
          <button
            key={time.value}
            type="button"
            onClick={() => onChange(time.value)}
            className={`min-h-28 rounded-lg border p-4 text-left ${
              selected
                ? "border-emerald-800 bg-emerald-950 text-white"
                : "border-stone-200 bg-white hover:border-emerald-700"
            }`}
          >
            <Icon size={22} />
            <span className="mt-5 block font-semibold">{time.value}</span>
          </button>
        );
      })}
    </div>
  );
}
