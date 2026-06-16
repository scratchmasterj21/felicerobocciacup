import type { QualifyingMatchData, StandingRow } from "./types";
import {
  POINTS_DRAW,
  POINTS_LOSS,
  POINTS_WIN,
} from "./types";
import { regulationTotals } from "./roundRobin";
import { fairPlayPointsOrDefault } from "./fairPlay";

export interface RankStandingsOptions {
  fairPlayByTeamId?: Map<string, number>;
}

function emptyRow(teamId: string): Omit<StandingRow, "rank"> {
  return {
    teamId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    leaguePoints: 0,
  };
}

function addMatchToRow(
  row: Omit<StandingRow, "rank">,
  gf: number,
  ga: number,
  outcome: "W" | "D" | "L"
): void {
  row.played += 1;
  row.goalsFor += gf;
  row.goalsAgainst += ga;
  row.goalDiff = row.goalsFor - row.goalsAgainst;
  if (outcome === "W") {
    row.wins += 1;
    row.leaguePoints += POINTS_WIN;
  } else if (outcome === "D") {
    row.draws += 1;
    row.leaguePoints += POINTS_DRAW;
  } else {
    row.losses += 1;
    row.leaguePoints += POINTS_LOSS;
  }
}

export function aggregateStandingsFromMatches(
  teamIds: string[],
  matches: QualifyingMatchData[]
): Map<string, Omit<StandingRow, "rank">> {
  const map = new Map<string, Omit<StandingRow, "rank">>();
  for (const id of teamIds) map.set(id, emptyRow(id));
  for (const m of matches) {
    if (m.status !== "COMPLETED" || !m.regulation || !m.outcome) continue;
    const { totalA, totalB } = regulationTotals(m.regulation);
    const rowA = map.get(m.teamAId);
    const rowB = map.get(m.teamBId);
    if (!rowA || !rowB) continue;
    if (m.outcome === "WIN_A") {
      addMatchToRow(rowA, totalA, totalB, "W");
      addMatchToRow(rowB, totalB, totalA, "L");
    } else if (m.outcome === "WIN_B") {
      addMatchToRow(rowA, totalA, totalB, "L");
      addMatchToRow(rowB, totalB, totalA, "W");
    } else {
      addMatchToRow(rowA, totalA, totalB, "D");
      addMatchToRow(rowB, totalB, totalA, "D");
    }
  }
  return map;
}

function attachFairPlay(
  row: Omit<StandingRow, "rank">,
  fairPlayByTeamId: Map<string, number>
): Omit<StandingRow, "rank"> & { fairPlayPoints: number; totalScore: number } {
  const fairPlayPoints = fairPlayPointsOrDefault(fairPlayByTeamId.get(row.teamId));
  return {
    ...row,
    fairPlayPoints,
    totalScore: row.leaguePoints + fairPlayPoints,
  };
}

function primaryCompare(
  a: Omit<StandingRow, "rank">,
  b: Omit<StandingRow, "rank">
): number {
  if (b.leaguePoints !== a.leaguePoints) return b.leaguePoints - a.leaguePoints;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return 0;
}

function primaryCompareWithFairPlay(
  a: Omit<StandingRow, "rank"> & { totalScore: number },
  b: Omit<StandingRow, "rank"> & { totalScore: number }
): number {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  return primaryCompare(a, b);
}

function samePrimaryTie(
  a: Omit<StandingRow, "rank">,
  b: Omit<StandingRow, "rank">,
  fairPlay?: Map<string, number>
): boolean {
  if (fairPlay) {
    const ta = attachFairPlay(a, fairPlay);
    const tb = attachFairPlay(b, fairPlay);
    if (ta.totalScore !== tb.totalScore) return false;
  }
  return (
    a.leaguePoints === b.leaguePoints &&
    a.goalDiff === b.goalDiff &&
    a.goalsFor === b.goalsFor
  );
}

function miniLeagueCompare(
  teamIds: string[],
  matches: QualifyingMatchData[],
  fairPlay?: Map<string, number>
): (x: string, y: string) => number {
  const completed = matches.filter(
    (m) =>
      m.status === "COMPLETED" &&
      m.regulation &&
      m.outcome &&
      teamIds.includes(m.teamAId) &&
      teamIds.includes(m.teamBId)
  );
  const sub = aggregateStandingsFromMatches(teamIds, completed);
  return (x, y) => {
    const rx = sub.get(x)!;
    const ry = sub.get(y)!;
    if (fairPlay) {
      const c = primaryCompareWithFairPlay(
        attachFairPlay(rx, fairPlay),
        attachFairPlay(ry, fairPlay)
      );
      if (c !== 0) return c;
      return x.localeCompare(y);
    }
    const c = primaryCompare(rx, ry);
    if (c !== 0) return c;
    return x.localeCompare(y);
  };
}

/** Tie-break: leaguePts -> GD -> GF -> head-to-head mini-league -> teamId; with Fair Play: totalScore first. */
export function rankStandings(
  teamIds: string[],
  matches: QualifyingMatchData[],
  options?: RankStandingsOptions
): StandingRow[] {
  const fairPlay = options?.fairPlayByTeamId;
  const map = aggregateStandingsFromMatches(teamIds, matches);
  const rows = teamIds.map((id) => map.get(id)!);
  if (fairPlay) {
    rows.sort((a, b) =>
      primaryCompareWithFairPlay(attachFairPlay(a, fairPlay), attachFairPlay(b, fairPlay))
    );
  } else {
    rows.sort(primaryCompare);
  }
  const result: StandingRow[] = [];
  let i = 0;
  let rankCounter = 1;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && samePrimaryTie(rows[i], rows[j], fairPlay)) j++;
    const group = rows.slice(i, j).map((r) => r.teamId);
    const cmp = miniLeagueCompare(group, matches, fairPlay);
    const ordered = [...group].sort(cmp);
    for (const tid of ordered) {
      const base = map.get(tid)!;
      if (fairPlay) {
        const fp = attachFairPlay(base, fairPlay);
        result.push({
          ...base,
          fairPlayPoints: fp.fairPlayPoints,
          totalScore: fp.totalScore,
          rank: rankCounter,
        });
      } else {
        result.push({ ...base, rank: rankCounter });
      }
      rankCounter += 1;
    }
    i = j;
  }
  return result;
}
