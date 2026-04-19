import type { BracketSlot, GeneratedFirstRound } from "./types";

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Seeds ordered best-first. Pad with byes at the end (lowest seed slots).
 * First round pairs seed[i] with seed[S-1-i].
 */
export function buildFirstRoundSingleElim(
  seedsOrdered: string[]
): GeneratedFirstRound {
  const m = seedsOrdered.length;
  const s = nextPowerOfTwo(Math.max(1, m));
  const padded: BracketSlot[] = seedsOrdered.map((id) => ({
    kind: "team",
    teamId: id,
  }));
  while (padded.length < s) padded.push({ kind: "bye" });
  const matches: GeneratedFirstRound["matches"] = [];
  const half = s / 2;
  for (let i = 0; i < half; i++) {
    const slotA = padded[i];
    const slotB = padded[s - 1 - i];
    matches.push({ matchIndex: i, slotA, slotB });
  }
  return { bracketSize: s, matches };
}

export function resolveFirstRoundWinner(
  slotA: BracketSlot,
  slotB: BracketSlot
): string | undefined {
  const a = slotA.kind === "team" ? slotA.teamId : undefined;
  const b = slotB.kind === "team" ? slotB.teamId : undefined;
  if (a && b) return undefined;
  if (a && !b) return a;
  if (b && !a) return b;
  return undefined;
}

/** Round count: log2(bracketSize). */
export function totalRounds(bracketSize: number): number {
  let r = 0;
  let x = bracketSize;
  while (x > 1) {
    x >>= 1;
    r += 1;
  }
  return r;
}
