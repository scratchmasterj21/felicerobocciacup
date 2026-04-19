import type { DivisionId, StandingRow } from "./types";

export function qualificationCountForDivision(teamCount: number): number {
  if (teamCount <= 0) return 0;
  return Math.floor((2 * teamCount) / 3);
}

/**
 * Top K from division standings (already ranked).
 */
export function topKFromStandings(
  standings: StandingRow[],
  k: number
): StandingRow[] {
  if (k <= 0) return [];
  return [...standings].sort((a, b) => a.rank - b.rank).slice(0, k);
}

/**
 * Build seed list: A1, B1, A2, B2, ... until one division exhausted, then append remainder.
 */
export function alternateDivisionSeeds(
  divisionA: StandingRow[],
  divisionB: StandingRow[],
  kA: number,
  kB: number
): string[] {
  const a = topKFromStandings(divisionA, kA).sort((x, y) => x.rank - y.rank);
  const b = topKFromStandings(divisionB, kB).sort((x, y) => x.rank - y.rank);
  const out: string[] = [];
  let ia = 0;
  let ib = 0;
  while (ia < a.length || ib < b.length) {
    if (ia < a.length) {
      out.push(a[ia].teamId);
      ia += 1;
    }
    if (ib < b.length) {
      out.push(b[ib].teamId);
      ib += 1;
    }
  }
  return out;
}

export function computeQualificationForGrade(
  standingsByDivision: Record<DivisionId, StandingRow[]>,
  teamCounts: Record<DivisionId, number>
): { kA: number; kB: number; seeds: string[] } {
  const kA = qualificationCountForDivision(teamCounts.A);
  const kB = qualificationCountForDivision(teamCounts.B);
  const seeds = alternateDivisionSeeds(
    standingsByDivision.A,
    standingsByDivision.B,
    kA,
    kB
  );
  return { kA, kB, seeds };
}
