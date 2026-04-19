import type { StandingRow } from "@/lib/tournament/types";

export function StandingsTable({
  standings,
  nameById,
  highlightTeamId,
  projector,
}: {
  standings: StandingRow[];
  nameById: Map<string, string>;
  /** When set, that row gets a subtle background (e.g. team viewer). */
  highlightTeamId?: string;
  /** Larger type for live / projector display (`?display=1`). */
  projector?: boolean;
}) {
  if (standings.length === 0) {
    return (
      <p
        className={
          projector
            ? "text-base text-cup-muted py-5 border border-dashed border-cup-line rounded-lg px-4"
            : "text-sm text-cup-muted py-4 border border-dashed border-cup-line rounded-lg px-4"
        }
      >
        No teams or standings yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-cup-line bg-white shadow-sm">
      <table className={projector ? "min-w-full text-base" : "min-w-full text-sm"}>
        <thead>
          <tr
            className={
              projector
                ? "bg-cup-ink/5 text-left text-cup-muted uppercase text-sm tracking-wide"
                : "bg-cup-ink/5 text-left text-cup-muted uppercase text-xs tracking-wide"
            }
          >
            <th className={projector ? "px-4 py-3" : "px-3 py-2"}>Rank</th>
            <th className={projector ? "px-4 py-3" : "px-3 py-2"}>Team</th>
            <th className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>
              Pts
            </th>
            <th className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>W</th>
            <th className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>D</th>
            <th className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>L</th>
            <th className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>GF</th>
            <th className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>GA</th>
            <th className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>GD</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.teamId}
              className={
                highlightTeamId === s.teamId
                  ? "border-t border-cup-line bg-amber-50/90"
                  : "border-t border-cup-line"
              }
            >
              <td className={projector ? "px-4 py-3 font-mono" : "px-3 py-2 font-mono"}>
                {s.rank}
              </td>
              <td className={projector ? "px-4 py-3 font-medium" : "px-3 py-2 font-medium"}>
                {nameById.get(s.teamId) ?? s.teamId}
              </td>
              <td
                className={
                  projector ? "px-4 py-3 text-right font-semibold" : "px-3 py-2 text-right font-semibold"
                }
              >
                {s.leaguePoints}
              </td>
              <td className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>
                {s.wins}
              </td>
              <td className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>
                {s.draws}
              </td>
              <td className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>
                {s.losses}
              </td>
              <td className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>
                {s.goalsFor}
              </td>
              <td className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>
                {s.goalsAgainst}
              </td>
              <td className={projector ? "px-4 py-3 text-right" : "px-3 py-2 text-right"}>
                {s.goalDiff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
