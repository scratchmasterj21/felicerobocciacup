import type { FinalMatchData, QualifyingMatchData } from "@/lib/tournament/types";

export function compareQualifyingByScheduleThenRound(
  a: QualifyingMatchData,
  b: QualifyingMatchData
): number {
  const at = a.schedule?.startAt;
  const bt = b.schedule?.startAt;
  if (at != null && bt != null && at !== bt) return at - bt;
  if (at != null && bt == null) return -1;
  if (at == null && bt != null) return 1;
  return a.round - b.round || a.teamAId.localeCompare(b.teamAId);
}

export function compareFinalByScheduleThenSlot(
  a: FinalMatchData,
  b: FinalMatchData
): number {
  const at = a.schedule?.startAt;
  const bt = b.schedule?.startAt;
  if (at != null && bt != null && at !== bt) return at - bt;
  if (at != null && bt == null) return -1;
  if (at == null && bt != null) return 1;
  return a.roundIndex - b.roundIndex || a.slotInRound - b.slotInRound;
}

/** Flat admin list: bracket round first, then start time within the round, then slot. */
export function compareFinalByRoundThenScheduleThenSlot(
  a: FinalMatchData,
  b: FinalMatchData
): number {
  if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex;
  const at = a.schedule?.startAt;
  const bt = b.schedule?.startAt;
  if (at != null && bt != null && at !== bt) return at - bt;
  if (at != null && bt == null) return -1;
  if (at == null && bt != null) return 1;
  return a.slotInRound - b.slotInRound;
}
