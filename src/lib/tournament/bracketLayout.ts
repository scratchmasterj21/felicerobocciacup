import type { FinalMatchData } from "./types";

export type BracketGroupId = "A" | "B" | "U";

function matchesInGroup(matches: FinalMatchData[], groupId: BracketGroupId): FinalMatchData[] {
  return matches.filter((m) => (m.bracketGroup ?? "U") === groupId);
}

/**
 * True when a bracket group is a cascade ladder: one match per round, all in slot 0.
 */
export function isCascadeLadderGroup(
  matches: FinalMatchData[],
  groupId: BracketGroupId
): boolean {
  const groupMatches = matchesInGroup(matches, groupId);
  if (groupMatches.length < 2) return false;
  if (!groupMatches.every((m) => m.slotInRound === 0)) return false;
  const roundIndices = groupMatches.map((m) => m.roundIndex).sort((a, b) => a - b);
  for (let i = 0; i < roundIndices.length; i++) {
    if (roundIndices[i] !== i) return false;
  }
  return true;
}

/**
 * Use compact vertical-column layout when ladder structure allows narrower canvas.
 */
export function useCompactLadderLayout(
  matches: FinalMatchData[],
  splitChampionMode: boolean
): boolean {
  if (splitChampionMode) {
    return isCascadeLadderGroup(matches, "A") && isCascadeLadderGroup(matches, "B");
  }
  return isCascadeLadderGroup(matches, "U");
}
