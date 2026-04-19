import type { QualifyingMatchData } from "./types";
import { qualificationCountForDivision } from "./qualification";
import { rankStandings } from "./standings";
import { mergedStandingsForDivision } from "./gradeSeeds";
import type { LeagueId } from "./leagueSplit";
import { effectiveLeagueCount } from "./leagueSplit";

/**
 * Teams below the qualifying cut, best-of-rest first (same ordering as finals seeds, then remainder in order).
 */
export function belowCutTeamIdsForDivision(
  gradeId: string,
  divisionId: "A" | "B",
  teamIds: string[],
  allQualifyingMatches: QualifyingMatchData[],
  requestedLeagueCount: 1 | 2,
  leagueAssignment?: Record<string, LeagueId> | undefined
): string[] {
  const k = qualificationCountForDivision(teamIds.length);
  const leagueCount = effectiveLeagueCount(requestedLeagueCount, teamIds.length);
  const matchesInDivision = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === divisionId
  );
  if (leagueCount === 1) {
    const standings = rankStandings(teamIds, matchesInDivision);
    const sorted = [...standings].sort((a, b) => a.rank - b.rank);
    return sorted.slice(k).map((r) => r.teamId);
  }
  const merged = mergedStandingsForDivision(
    gradeId,
    divisionId,
    teamIds,
    allQualifyingMatches,
    requestedLeagueCount,
    leagueAssignment
  );
  return merged.slice(k).map((r) => r.teamId);
}

export function belowCutTeamIdsForUnified(
  gradeId: string,
  teamIds: string[],
  allQualifyingMatches: QualifyingMatchData[]
): string[] {
  const matches = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === "A"
  );
  const standings = rankStandings(teamIds, matches);
  const k = qualificationCountForDivision(teamIds.length);
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  return sorted.slice(k).map((r) => r.teamId);
}

/** Single-period regulation scores for resurrection (3 min): only round1 counts; round2 zeroed for storage compatibility. */
export function resurrectionRegulationFromSinglePeriod(scoreA: number, scoreB: number) {
  return {
    round1: { scoreA, scoreB },
    round2: { scoreA: 0, scoreB: 0 },
  };
}
