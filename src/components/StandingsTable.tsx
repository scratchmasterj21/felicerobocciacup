import type { StandingRow } from "@/lib/tournament/types";
import { FairPlayBandBadge } from "@/components/FairPlayBandBadge";

export function StandingsTable({
  standings,
  nameById,
  highlightTeamId,
  projector,
  projectionMode,
  showFairPlay,
}: {
  standings: StandingRow[];
  nameById: Map<string, string>;
  /** When set, that row gets a subtle background (e.g. team viewer). */
  highlightTeamId?: string;
  /** Larger type for live / projector display (`?display=1`). */
  projector?: boolean;
  /** Dark “arena” table skin for live projection (`?display=1`). */
  projectionMode?: boolean;
  /** Show match pts, fair play, and total columns (within-school). */
  showFairPlay?: boolean;
}) {
  const large = Boolean(projectionMode || projector);
  const arena = Boolean(projectionMode);

  if (standings.length === 0) {
    return (
      <p
        className={
          large
            ? arena
              ? "text-base text-slate-400 py-5 border border-dashed border-cup-stageBorder rounded-lg px-4 bg-cup-stageElevated/50"
              : "text-base text-cup-muted py-5 border border-dashed border-cup-line rounded-lg px-4"
            : "text-sm text-cup-muted py-4 border border-dashed border-cup-line rounded-lg px-4"
        }
      >
        No teams or standings yet.
      </p>
    );
  }

  const wrap = arena
    ? "overflow-x-auto rounded-xl border border-cup-stageBorder bg-cup-stageElevated shadow-lg shadow-black/20"
    : "overflow-x-auto rounded-lg border border-cup-line bg-white shadow-sm";

  const thRow = arena
    ? "bg-black/35 text-left text-cup-signal uppercase text-sm tracking-widest"
    : large
      ? "bg-cup-ink/5 text-left text-cup-muted uppercase text-sm tracking-wide"
      : "bg-cup-ink/5 text-left text-cup-muted uppercase text-xs tracking-wide";

  const cell = large ? "px-4 py-3" : "px-3 py-2";
  const tableText = large ? "min-w-full text-base" : "min-w-full text-sm";

  return (
    <div className={wrap}>
      <table className={tableText}>
        <thead>
          <tr className={thRow}>
            <th className={cell}>Rank</th>
            <th className={cell}>Team</th>
            <th className={`${cell} text-right`}>
              {showFairPlay ? "Match" : "Pts"}
            </th>
            {showFairPlay ? (
              <>
                <th className={`${cell} text-right`} title="Sum of student Fair Play points">
                  Fair Play
                </th>
                <th className={`${cell} text-right`}>Total</th>
              </>
            ) : null}
            <th className={`${cell} text-right`}>W</th>
            <th className={`${cell} text-right`}>D</th>
            <th className={`${cell} text-right`}>L</th>
            <th className={`${cell} text-right`}>GF</th>
            <th className={`${cell} text-right`}>GA</th>
            <th className={`${cell} text-right`}>GD</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const hi = highlightTeamId === s.teamId;
            let rowClass = "border-t ";
            if (hi) {
              rowClass += arena
                ? "border-amber-400/50 bg-amber-500/15"
                : "border-cup-line bg-amber-50/90";
            } else {
              rowClass += arena ? "border-cup-stageBorder " : "border-cup-line ";
              if (arena) rowClass += i % 2 === 0 ? "bg-black/14" : "bg-black/22";
            }
            const textMain = arena ? "text-slate-100" : "";
            const textMuted = arena ? "text-slate-400" : "";
            return (
              <tr key={s.teamId} className={rowClass.trim()}>
                <td className={`${cell} font-mono ${textMuted}`}>{s.rank}</td>
                <td className={`${cell} font-medium ${textMain}`}>
                  {nameById.get(s.teamId) ?? s.teamId}
                </td>
                <td
                  className={`${cell} text-right font-semibold ${
                    arena && !showFairPlay ? "text-cup-signal" : ""
                  }`}
                >
                  {s.leaguePoints}
                </td>
                {showFairPlay ? (
                  <>
                    <td className={`${cell} text-right`}>
                      <FairPlayBandBadge points={s.fairPlayPoints ?? 15} />
                    </td>
                    <td
                      className={`${cell} text-right font-bold tabular-nums ${
                        arena ? "text-cup-signal" : "text-cup-ink"
                      }`}
                    >
                      {s.totalScore ?? s.leaguePoints}
                    </td>
                  </>
                ) : null}
                <td
                  className={`${cell} text-right ${
                    arena ? "text-cup-winBright" : "text-cup-ink"
                  }`}
                >
                  {s.wins}
                </td>
                <td
                  className={`${cell} text-right ${
                    arena ? "text-cup-drawBright" : "text-cup-ink"
                  }`}
                >
                  {s.draws}
                </td>
                <td
                  className={`${cell} text-right ${
                    arena ? "text-cup-lossBright" : "text-cup-ink"
                  }`}
                >
                  {s.losses}
                </td>
                <td className={`${cell} text-right ${textMain}`}>{s.goalsFor}</td>
                <td className={`${cell} text-right ${textMain}`}>{s.goalsAgainst}</td>
                <td className={`${cell} text-right ${textMain}`}>{s.goalDiff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
