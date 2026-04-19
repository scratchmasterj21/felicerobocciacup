import type { QualifyingMatchData, StandingRow } from "./types";
import {
  alternateDivisionSeeds,
  qualificationCountForDivision,
  topKFromStandings,
} from "./qualification";
import { rankStandings } from "./standings";
import type { LeagueId } from "./leagueSplit";
import {
  effectiveLeagueCount,
  partitionTeamsIntoLeaguesFromSaved,
} from "./leagueSplit";

/**
 * Single combined qualifying league (all teams in division A). Seeds are top K by rank
 * (1st, 2nd, …) for best-first bracket placement.
 */
export function computeSeedsForGradeUnified(
  gradeId: string,
  teamIds: string[],
  allQualifyingMatches: QualifyingMatchData[]
): { k: number; seeds: string[] } {
  const matches = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === "A"
  );
  const stand = rankStandings(teamIds, matches);
  const k = qualificationCountForDivision(teamIds.length);
  const rows = topKFromStandings(stand, k);
  const seeds = rows.map((r) => r.teamId);
  return { k, seeds };
}

export function computeSeedsForGrade(
  gradeId: string,
  teamIdsByDivision: { A: string[]; B: string[] },
  allQualifyingMatches: QualifyingMatchData[]
): { kA: number; kB: number; seeds: string[] } {
  const matchesA = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === "A"
  );
  const matchesB = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === "B"
  );
  const standA = rankStandings(teamIdsByDivision.A, matchesA);
  const standB = rankStandings(teamIdsByDivision.B, matchesB);
  const kA = qualificationCountForDivision(teamIdsByDivision.A.length);
  const kB = qualificationCountForDivision(teamIdsByDivision.B.length);
  const seeds = alternateDivisionSeeds(standA, standB, kA, kB);
  return { kA, kB, seeds };
}

/**
 * Compute finals seeds for one specific pool/division in a grade.
 */
export function computeSeedsForGradeDivision(
  gradeId: string,
  divisionId: "A" | "B",
  teamIds: string[],
  allQualifyingMatches: QualifyingMatchData[],
  requestedLeagueCount: 1 | 2 = 1,
  leagueAssignment?: Record<string, LeagueId> | undefined
): { k: number; seeds: string[] } {
  const matchesInDivision = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === divisionId
  );
  const leagueCount = effectiveLeagueCount(requestedLeagueCount, teamIds.length);
  let standings: StandingRow[];
  if (leagueCount === 1) {
    standings = rankStandings(teamIds, matchesInDivision);
  } else {
    const leagues = partitionTeamsIntoLeaguesFromSaved(teamIds, leagueAssignment);
    const l1 = rankStandings(
      leagues.L1,
      matchesInDivision.filter((m) => m.leagueId === "L1")
    );
    const l2 = rankStandings(
      leagues.L2,
      matchesInDivision.filter((m) => m.leagueId === "L2")
    );
    standings = [...l1, ...l2].sort((a, b) => {
      if (b.leaguePoints !== a.leaguePoints) return b.leaguePoints - a.leaguePoints;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamId.localeCompare(b.teamId);
    });
  }
  const k = qualificationCountForDivision(teamIds.length);
  const seeds =
    leagueCount === 1
      ? topKFromStandings(standings, k).map((row) => row.teamId)
      : standings.slice(0, k).map((row) => row.teamId);
  return { k, seeds };
}

/** Standings row order used for qualification and below-cut lists (split-league merge matches computeSeedsForGradeDivision). */
export function mergedStandingsForDivision(
  gradeId: string,
  divisionId: "A" | "B",
  teamIds: string[],
  allQualifyingMatches: QualifyingMatchData[],
  requestedLeagueCount: 1 | 2 = 1,
  leagueAssignment?: Record<string, LeagueId> | undefined
): StandingRow[] {
  const matchesInDivision = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === divisionId
  );
  const leagueCount = effectiveLeagueCount(requestedLeagueCount, teamIds.length);
  if (leagueCount === 1) {
    return rankStandings(teamIds, matchesInDivision);
  }
  const leagues = partitionTeamsIntoLeaguesFromSaved(teamIds, leagueAssignment);
  const l1 = rankStandings(
    leagues.L1,
    matchesInDivision.filter((m) => m.leagueId === "L1")
  );
  const l2 = rankStandings(
    leagues.L2,
    matchesInDivision.filter((m) => m.leagueId === "L2")
  );
  return [...l1, ...l2].sort((a, b) => {
    if (b.leaguePoints !== a.leaguePoints) return b.leaguePoints - a.leaguePoints;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamId.localeCompare(b.teamId);
  });
}
