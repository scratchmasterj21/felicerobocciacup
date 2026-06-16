import type { QualifyingMatchData, StandingRow } from "./types";
import {
  alternateDivisionSeeds,
  qualificationCountForDivision,
  topKFromStandings,
} from "./qualification";
import { rankStandings, type RankStandingsOptions } from "./standings";
import type { LeagueId } from "./leagueSplit";
import {
  effectiveLeagueCount,
  partitionTeamsIntoLeaguesFromSaved,
} from "./leagueSplit";

function mergeLeagueStandings(
  l1: StandingRow[],
  l2: StandingRow[],
  useFairPlay: boolean
): StandingRow[] {
  return [...l1, ...l2].sort((a, b) => {
    if (useFairPlay && a.totalScore != null && b.totalScore != null) {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    }
    if (b.leaguePoints !== a.leaguePoints) return b.leaguePoints - a.leaguePoints;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamId.localeCompare(b.teamId);
  });
}

/**
 * Single combined qualifying league (all teams in division A). Seeds are top K by rank
 * (1st, 2nd, …) for best-first bracket placement.
 */
export function computeSeedsForGradeUnified(
  gradeId: string,
  teamIds: string[],
  allQualifyingMatches: QualifyingMatchData[],
  standingsOptions?: RankStandingsOptions
): { k: number; seeds: string[] } {
  const matches = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === "A"
  );
  const stand = rankStandings(teamIds, matches, standingsOptions);
  const k = qualificationCountForDivision(teamIds.length);
  const rows = topKFromStandings(stand, k);
  const seeds = rows.map((r) => r.teamId);
  return { k, seeds };
}

export function computeSeedsForGrade(
  gradeId: string,
  teamIdsByDivision: { A: string[]; B: string[] },
  allQualifyingMatches: QualifyingMatchData[],
  standingsOptions?: RankStandingsOptions
): { kA: number; kB: number; seeds: string[] } {
  const matchesA = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === "A"
  );
  const matchesB = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === "B"
  );
  const standA = rankStandings(teamIdsByDivision.A, matchesA, standingsOptions);
  const standB = rankStandings(teamIdsByDivision.B, matchesB, standingsOptions);
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
  leagueAssignment?: Record<string, LeagueId> | undefined,
  standingsOptions?: RankStandingsOptions
): { k: number; seeds: string[] } {
  const matchesInDivision = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === divisionId
  );
  const leagueCount = effectiveLeagueCount(requestedLeagueCount, teamIds.length);
  const useFairPlay = Boolean(standingsOptions?.fairPlayByTeamId);
  let standings: StandingRow[];
  if (leagueCount === 1) {
    standings = rankStandings(teamIds, matchesInDivision, standingsOptions);
  } else {
    const leagues = partitionTeamsIntoLeaguesFromSaved(teamIds, leagueAssignment);
    const l1 = rankStandings(
      leagues.L1,
      matchesInDivision.filter((m) => m.leagueId === "L1"),
      standingsOptions
    );
    const l2 = rankStandings(
      leagues.L2,
      matchesInDivision.filter((m) => m.leagueId === "L2"),
      standingsOptions
    );
    standings = mergeLeagueStandings(l1, l2, useFairPlay);
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
  leagueAssignment?: Record<string, LeagueId> | undefined,
  standingsOptions?: RankStandingsOptions
): StandingRow[] {
  const matchesInDivision = allQualifyingMatches.filter(
    (m) => m.gradeId === gradeId && m.divisionId === divisionId
  );
  const leagueCount = effectiveLeagueCount(requestedLeagueCount, teamIds.length);
  const useFairPlay = Boolean(standingsOptions?.fairPlayByTeamId);
  if (leagueCount === 1) {
    return rankStandings(teamIds, matchesInDivision, standingsOptions);
  }
  const leagues = partitionTeamsIntoLeaguesFromSaved(teamIds, leagueAssignment);
  const l1 = rankStandings(
    leagues.L1,
    matchesInDivision.filter((m) => m.leagueId === "L1"),
    standingsOptions
  );
  const l2 = rankStandings(
    leagues.L2,
    matchesInDivision.filter((m) => m.leagueId === "L2"),
    standingsOptions
  );
  return mergeLeagueStandings(l1, l2, useFairPlay);
}
