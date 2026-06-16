import {
  fairPlayBand,
  fairPlayBandForShare,
  type FairPlayBand,
} from "@/lib/tournament/fairPlay";

const bandClass: Record<FairPlayBand, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-red-400",
};

export function FairPlayBandBadge({
  points,
  initialShare,
  compact,
}: {
  points: number;
  /** When set, band colors scale to the student's starting share. */
  initialShare?: number;
  /** Smaller layout for dense standings tables. */
  compact?: boolean;
}) {
  const band =
    typeof initialShare === "number" && initialShare > 0
      ? fairPlayBandForShare(points, initialShare)
      : fairPlayBand(points);
  return (
    <span
      className={`inline-flex items-center font-semibold tabular-nums ${bandClass[band]} ${
        compact ? "gap-1 text-xs justify-end" : "gap-1.5"
      }`}
    >
      <span
        className={`rounded-full shrink-0 ${
          compact ? "h-1.5 w-1.5" : "h-2 w-2"
        } ${
          band === "green"
            ? "bg-emerald-400"
            : band === "yellow"
              ? "bg-amber-400"
              : "bg-red-400"
        }`}
        aria-hidden
      />
      {typeof initialShare === "number" ? `${points}/${initialShare}` : points}
    </span>
  );
}

export function fairPlayBandLabel(band: FairPlayBand): string {
  if (band === "green") return "13–15";
  if (band === "yellow") return "8–12";
  return "0–7";
}
