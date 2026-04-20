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
  projectionMode,
}: {
  title: string;
  matches: QualifyingMatchData[];
  nameById: Map<string, string>;
  projector?: boolean;
  projectionMode?: boolean;
}) {
  const large = Boolean(projectionMode || projector);
  const arena = Boolean(projectionMode);

  const sorted = useMemo(
    () => [...matches].sort(compareQualifyingByScheduleThenRound),
    [matches]
  );

  const h3 = arena
    ? "font-displayWide text-xl md:text-2xl font-semibold mb-2 text-slate-50 border-l-4 border-cup-signal pl-3 tracking-wide"
    : large
      ? "font-display text-xl md:text-2xl font-semibold mb-2"
      : "font-display text-base font-semibold mb-2";

  const emptyP = arena
    ? "text-base text-slate-400"
    : large
      ? "text-base text-cup-muted"
      : "text-sm text-cup-muted";

  if (sorted.length === 0) {
    return (
      <div>
        <h3 className={h3}>{title}</h3>
        <p className={emptyP}>No matches.</p>
      </div>
    );
  }

  const liBase = arena
    ? "rounded-xl border border-cup-stageBorder bg-cup-stageElevated/90 px-4 py-3 shadow-md shadow-black/15"
    : large
      ? "rounded-lg border border-cup-line bg-white px-4 py-3"
      : "rounded-lg border border-cup-line bg-white px-3 py-2";

  const winTone = (w: "Win" | "Loss" | "Draw" | null) => {
    if (!w) return arena ? "text-slate-400" : "text-cup-muted";
    if (arena) {
      if (w === "Win") return "text-cup-winBright";
      if (w === "Loss") return "text-cup-lossBright";
      return "text-cup-drawBright";
    }
    if (w === "Win") return "text-cup-win";
    if (w === "Loss") return "text-cup-loss";
    return "text-cup-draw";
  };

  return (
    <div>
      <h3 className={h3}>{title}</h3>
      <ul className={large ? "space-y-3 text-base" : "space-y-2 text-sm"}>
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
          const toneA = winTone(resultA);
          const toneB = winTone(resultB);
          const muted = arena ? "text-slate-400" : "text-cup-muted";
          const ink = arena ? "text-slate-100" : "text-cup-ink";
          const borderT = arena ? "border-cup-stageBorder" : "border-cup-line/70";

          return (
            <li key={m.id} className={liBase}>
              <div>
                <span className={`font-medium ${ink}`}>{teamA}</span>
                <span className={`${muted} mx-1`}>vs</span>
                <span className={`font-medium ${ink}`}>{teamB}</span>
                <span
                  className={
                    large ? `${muted} text-sm ml-2` : `${muted} text-xs ml-2`
                  }
                >
                  R{m.round}
                </span>
              </div>
              <div
                className={
                  large ? `text-sm ${muted} mt-1.5` : `text-xs ${muted} mt-1`
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
                    large
                      ? `mt-2 border-t ${borderT} pt-2 text-sm`
                      : `mt-1.5 border-t ${borderT} pt-1.5 text-xs`
                  }
                >
                  <div className={`font-medium ${ink}`}>
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
