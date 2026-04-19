export type LeagueId = "L1" | "L2";

export function divisionLeagueKey(gradeId: string, divisionId: "A" | "B"): string {
  return `${gradeId}_${divisionId}`;
}

export function effectiveLeagueCount(requested: 1 | 2, teamCount: number): 1 | 2 {
  if (requested === 2 && teamCount >= 4) return 2;
  return 1;
}

/**
 * Deterministic balanced partition:
 * sorted team IDs alternate into L1/L2.
 * Prefer `partitionTeamsIntoLeaguesFromSaved` when meta has a saved assignment.
 */
export function partitionTeamsIntoLeagues(teamIds: string[]): Record<LeagueId, string[]> {
  const sorted = [...teamIds].sort((a, b) => a.localeCompare(b));
  const out: Record<LeagueId, string[]> = { L1: [], L2: [] };
  for (let i = 0; i < sorted.length; i++) {
    const lid: LeagueId = i % 2 === 0 ? "L1" : "L2";
    out[lid].push(sorted[i]);
  }
  return out;
}

export function hasAnySavedForTeams(
  teamIds: string[],
  saved: Record<string, LeagueId>
): boolean {
  return teamIds.some((id) => saved[id] === "L1" || saved[id] === "L2");
}

/**
 * Use persisted L1/L2 map when present; roster additions go to the smaller league (tie → L1).
 * If `saved` is empty or has no entries for any current team, falls back to {@link partitionTeamsIntoLeagues}.
 */
export function partitionTeamsIntoLeaguesFromSaved(
  teamIds: string[],
  saved: Record<string, LeagueId> | undefined | null
): Record<LeagueId, string[]> {
  if (!saved || Object.keys(saved).length === 0) {
    return partitionTeamsIntoLeagues(teamIds);
  }
  if (!hasAnySavedForTeams(teamIds, saved)) {
    return partitionTeamsIntoLeagues(teamIds);
  }
  const out: Record<LeagueId, string[]> = { L1: [], L2: [] };
  const assigned = new Set<string>();
  for (const id of teamIds) {
    const lid = saved[id];
    if (lid === "L1" || lid === "L2") {
      out[lid].push(id);
      assigned.add(id);
    }
  }
  const unassigned = teamIds.filter((id) => !assigned.has(id));
  const sortedUnassigned = [...unassigned].sort((a, b) => a.localeCompare(b));
  for (const id of sortedUnassigned) {
    const lid: LeagueId = out.L1.length <= out.L2.length ? "L1" : "L2";
    out[lid].push(id);
  }
  return out;
}

/** Fisher–Yates shuffle then alternate into L1/L2 (balanced sizes). */
export function shuffleTeamsIntoLeagues(teamIds: string[]): {
  L1: string[];
  L2: string[];
  assignment: Record<string, LeagueId>;
} {
  const arr = [...teamIds];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const L1: string[] = [];
  const L2: string[] = [];
  const assignment: Record<string, LeagueId> = {};
  for (let i = 0; i < arr.length; i++) {
    const id = arr[i];
    const lid: LeagueId = i % 2 === 0 ? "L1" : "L2";
    assignment[id] = lid;
    if (lid === "L1") L1.push(id);
    else L2.push(id);
  }
  return { L1, L2, assignment };
}
