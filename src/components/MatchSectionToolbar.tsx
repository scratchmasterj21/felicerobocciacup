import type { GridFilter } from "@/components/MatchScoreGrid";

export function MatchSectionToolbar({
  viewMode,
  onViewModeChange,
  filter,
  onFilterChange,
}: {
  viewMode: "cards" | "quick";
  onViewModeChange: (mode: "cards" | "quick") => void;
  filter: GridFilter;
  onFilterChange: (filter: GridFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4 items-center text-sm">
      <div className="flex items-center gap-2">
        <span className="text-cup-muted font-medium">View</span>
        <button
          type="button"
          className={`px-2 py-1 rounded-md border text-xs font-medium ${
            viewMode === "cards"
              ? "border-cup-ink bg-cup-ink text-cup-paper"
              : "border-cup-line bg-white"
          }`}
          onClick={() => onViewModeChange("cards")}
        >
          Cards
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded-md border text-xs font-medium ${
            viewMode === "quick"
              ? "border-cup-ink bg-cup-ink text-cup-paper"
              : "border-cup-line bg-white"
          }`}
          onClick={() => onViewModeChange("quick")}
        >
          Quick entry
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-cup-muted font-medium">Filter</span>
        {(["all", "unfinished", "completed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`px-2 py-1 rounded-md border text-xs font-medium capitalize ${
              filter === f
                ? "border-cup-ink bg-cup-ink text-cup-paper"
                : "border-cup-line bg-white"
            }`}
            onClick={() => onFilterChange(f)}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}
