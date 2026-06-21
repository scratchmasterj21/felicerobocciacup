import type { PracticeMatchData, QualifyingMatchData } from "./types";
import { getQualifyingFixturePairings } from "./roundRobin";

/**
 * Next `order` value to use when appending practice matches: one past the
 * current maximum, so new rows always sort after existing ones.
 */
export function nextPracticeOrder(
  existing: Record<string, PracticeMatchData> | PracticeMatchData[]
): number {
  const list = Array.isArray(existing) ? existing : Object.values(existing);
  let max = 0;
  for (const m of list) {
    if (typeof m.order === "number" && m.order > max) max = m.order;
  }
  return max + 1;
}

/**
 * Pick up to `count` round-robin pairings for a practice session. Builds the
 * full round-robin order first (circle method spreads teams evenly across
 * rounds), then keeps the first `count` so a partial count still gives every
 * team roughly equal early play. Never produces duplicate pairings.
 */
export function selectPracticePairings(
  teamIds: string[],
  count: number
): Array<{ round: number; teamA: string; teamB: string }> {
  if (count <= 0 || teamIds.length < 2) return [];
  return getQualifyingFixturePairings(teamIds).slice(0, count);
}

/**
 * Map a practice match to the `QualifyingMatchData` shape so it can feed
 * `rankStandings` (preliminary-style points). `round` is a placeholder.
 */
export function practiceMatchToQualifying(
  m: PracticeMatchData
): QualifyingMatchData {
  return {
    id: m.id,
    gradeId: m.gradeId,
    divisionId: m.divisionId,
    round: 0,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    status: m.status,
    ...(m.regulation ? { regulation: m.regulation } : {}),
    ...(m.outcome ? { outcome: m.outcome } : {}),
  };
}

export function practiceMatchesToQualifying(
  matches: PracticeMatchData[]
): QualifyingMatchData[] {
  return matches.map(practiceMatchToQualifying);
}
