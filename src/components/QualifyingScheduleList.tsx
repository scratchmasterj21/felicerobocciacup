import type { QualifyingMatchData } from "@/lib/tournament/types";
import { compareQualifyingByScheduleThenRound } from "@/lib/schedule/matchSort";
import { formatScheduleTokyo } from "@/lib/schedule/tokyo";
import { regulationTotals } from "@/lib/tournament/roundRobin";
import { useMemo } from "react";

export function QualifyingScheduleList({
  title,
  matches,
  nameById,
  projector,
}: {
  title: string;
  matches: QualifyingMatchData[];
  nameById: Map<string, string>;
  projector?: boolean;
}) {
  const sorted = useMemo(
    () => [...matches].sort(compareQualifyingByScheduleThenRound),
    [matches]
  );

  if (sorted.length === 0) {
    return (
      <div>
        <h3
          className={
            projector
              ? "font-display text-xl md:text-2xl font-semibold mb-2"
              : "font-display text-base font-semibold mb-2"
          }
        >
          {title}
        </h3>
        <p className={projector ? "text-base text-cup-muted" : "text-sm text-cup-muted"}>
          No matches.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3
        className={
          projector
            ? "font-display text-xl md:text-2xl font-semibold mb-2"
            : "font-display text-base font-semibold mb-2"
        }
      >
        {title}
      </h3>
      <ul className={projector ? "space-y-3 text-base" : "space-y-2 text-sm"}>
        {sorted.map((m) => {
          const teamA = nameById.get(m.teamAId) ?? m.teamAId;
          const teamB = nameById.get(m.teamBId) ?? m.teamBId;
          const isCompleted =
            m.status === "COMPLETED" &&
            Boolean(m.regulation) &&
            Boolean(m.outcome);
          const totals = m.regulation ? regulationTotals(m.regulation) : null;
          const resultA =
            m.outcome === "WIN_A"
              ? "Win"
              : m.outcome === "WIN_B"
                ? "Loss"
                : m.outcome === "DRAW"
                  ? "Draw"
                  : null;
          const resultB =
            m.outcome === "WIN_B"
              ? "Win"
              : m.outcome === "WIN_A"
                ? "Loss"
                : m.outcome === "DRAW"
                  ? "Draw"
                  : null;
          const toneA =
            resultA === "Win"
              ? "text-cup-win"
              : resultA === "Loss"
                ? "text-cup-loss"
                : resultA === "Draw"
                  ? "text-cup-draw"
                  : "text-cup-muted";
          const toneB =
            resultB === "Win"
              ? "text-cup-win"
              : resultB === "Loss"
                ? "text-cup-loss"
                : resultB === "Draw"
                  ? "text-cup-draw"
                  : "text-cup-muted";

          return (
            <li
              key={m.id}
              className={
                projector
                  ? "rounded-lg border border-cup-line bg-white px-4 py-3"
                  : "rounded-lg border border-cup-line bg-white px-3 py-2"
              }
            >
              <div>
                <span className="font-medium">{teamA}</span>
                <span className="text-cup-muted mx-1">vs</span>
                <span className="font-medium">{teamB}</span>
                <span
                  className={
                    projector ? "text-cup-muted text-sm ml-2" : "text-cup-muted text-xs ml-2"
                  }
                >
                  R{m.round}
                </span>
              </div>
              <div
                className={
                  projector ? "text-sm text-cup-muted mt-1.5" : "text-xs text-cup-muted mt-1"
                }
              >
                {m.schedule?.startAt != null ? (
                  formatScheduleTokyo(m.schedule.startAt, {
                    durationRegulationMinutes: m.schedule.durationRegulationMinutes,
                    court: m.schedule.court,
                  })
                ) : (
                  <>Time TBD · 16 min (reg.)</>
                )}
              </div>
              {isCompleted && totals ? (
                <div
                  className={
                    projector
                      ? "mt-2 border-t border-cup-line/70 pt-2 text-sm"
                      : "mt-1.5 border-t border-cup-line/70 pt-1.5 text-xs"
                  }
                >
                  <div className="font-medium text-cup-ink">
                    Final score: {totals.totalA}-{totals.totalB}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className={toneA}>
                      {teamA}: {resultA}
                    </span>
                    <span className={toneB}>
                      {teamB}: {resultB}
                    </span>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
