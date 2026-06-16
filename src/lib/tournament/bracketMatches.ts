import {
  buildFirstRoundSingleElim,
  resolveFirstRoundWinner,
  totalRounds,
} from "./bracket";
import type { FinalMatchData, ResurrectionPoolGroup } from "./types";

function matchId(gradeId: string, roundIndex: number, slotInRound: number): string {
  return `${gradeId}_R${roundIndex}_M${slotInRound}`;
}

function groupedMatchId(
  gradeId: string,
  roundIndex: number,
  slotInRound: number,
  bracketGroup?: "A" | "B" | "U"
): string {
  if (!bracketGroup || bracketGroup === "U") {
    return matchId(gradeId, roundIndex, slotInRound);
  }
  return `${gradeId}_${bracketGroup}_R${roundIndex}_M${slotInRound}`;
}

/** IDs under resurrection RTDB path only; avoids collisions with finals match ids. */
export function resurrectionMatchId(
  gradeId: string,
  poolGroup: ResurrectionPoolGroup,
  roundIndex: number,
  slotInRound: number
): string {
  return `${gradeId}_RES_${poolGroup}_R${roundIndex}_M${slotInRound}`;
}

/**
 * Single-elim resurrection bracket; same tree logic as finals with RES-prefixed ids.
 */
export function buildResurrectionBracketMatchTree(
  gradeId: string,
  poolGroup: ResurrectionPoolGroup,
  seedsOrdered: string[]
): FinalMatchData[] {
  const fr = buildFirstRoundSingleElim(seedsOrdered);
  const bracketSize = fr.bracketSize;
  const roundCount = totalRounds(bracketSize);
  const matches: FinalMatchData[] = [];

  for (let r = 0; r < roundCount; r++) {
    const matchesInRound = bracketSize >> (r + 1);
    for (let m = 0; m < matchesInRound; m++) {
      const id = resurrectionMatchId(gradeId, poolGroup, r, m);
      let teamAId: string | undefined;
      let teamBId: string | undefined;
      let status: FinalMatchData["status"] = "SCHEDULED";
      let winnerTeamId: string | undefined;
      let feedsFromA: string | undefined;
      let feedsFromB: string | undefined;

      if (r === 0) {
        const p = fr.matches[m];
        const auto = resolveFirstRoundWinner(p.slotA, p.slotB);
        teamAId = p.slotA.kind === "team" ? p.slotA.teamId : undefined;
        teamBId = p.slotB.kind === "team" ? p.slotB.teamId : undefined;
        if (auto) {
          winnerTeamId = auto;
          status = "COMPLETED";
        }
      } else {
        feedsFromA = resurrectionMatchId(gradeId, poolGroup, r - 1, m * 2);
        feedsFromB = resurrectionMatchId(gradeId, poolGroup, r - 1, m * 2 + 1);
      }

      let nextMatchId: string | undefined;
      if (r < roundCount - 1) {
        nextMatchId = resurrectionMatchId(
          gradeId,
          poolGroup,
          r + 1,
          Math.floor(m / 2)
        );
      }

      matches.push({
        id,
        gradeId,
        bracketGroup: poolGroup === "U" ? "U" : poolGroup,
        matchKind: "resurrection",
        roundIndex: r,
        slotInRound: m,
        teamAId,
        teamBId,
        status,
        winnerTeamId,
        nextMatchId,
        feedsFromA,
        feedsFromB,
      });
    }
  }

  const byId = new Map(matches.map((x) => [x.id, x] as const));
  for (const mm of matches) {
    if (!mm.winnerTeamId || !mm.nextMatchId) continue;
    const nxt = byId.get(mm.nextMatchId);
    if (!nxt) continue;
    if (mm.slotInRound % 2 === 0) nxt.teamAId = mm.winnerTeamId;
    else nxt.teamBId = mm.winnerTeamId;
  }

  return matches;
}

/** Max finalists per pool for ladder-style bracket (top seed plays one league match). */
const CASCADE_LADDER_MAX_SEEDS = 6;

export type FinalsBracketFormat = "ladder" | "singleElim";

/**
 * Ladder bracket: lowest seeds play first; each higher seed waits for the winner below.
 * #1 only plays the last round (one game before grade championship), including when a
 * redemption champion is appended as the lowest seed (K+1).
 *
 * n=3: s2 vs s3 → s1 vs winner
 * n=4: s3 vs s4 → s2 vs w → s1 vs w
 * n=5: s4 vs s5 → s3 vs w → s2 vs w → s1 vs w
 */
function buildCascadeLadderBracketTree(
  gradeId: string,
  seedsOrdered: string[],
  bracketGroup?: "A" | "B" | "U"
): FinalMatchData[] {
  const n = seedsOrdered.length;
  const roundCount = n - 1;
  const matches: FinalMatchData[] = [];

  for (let r = 0; r < roundCount; r++) {
    const id = groupedMatchId(gradeId, r, 0, bracketGroup);
    const prevId =
      r > 0 ? groupedMatchId(gradeId, r - 1, 0, bracketGroup) : undefined;
    const nextId =
      r < roundCount - 1
        ? groupedMatchId(gradeId, r + 1, 0, bracketGroup)
        : undefined;

    if (r === 0) {
      matches.push({
        id,
        gradeId,
        bracketGroup,
        roundIndex: r,
        slotInRound: 0,
        teamAId: seedsOrdered[n - 2],
        teamBId: seedsOrdered[n - 1],
        status: "SCHEDULED",
        nextMatchId: nextId,
      });
    } else {
      matches.push({
        id,
        gradeId,
        bracketGroup,
        roundIndex: r,
        slotInRound: 0,
        teamAId: seedsOrdered[n - 2 - r],
        status: "SCHEDULED",
        feedsFromB: prevId,
        nextMatchId: nextId,
      });
    }
  }

  return matches;
}

function useCascadeLadderForFinals(seedCount: number): boolean {
  return seedCount >= 2 && seedCount <= CASCADE_LADDER_MAX_SEEDS;
}

/**
 * Build full single-elim tree match records. Round 0 = first round.
 * Bye winners are marked COMPLETED with winnerTeamId; feeder matches link via feedsFromA/B.
 */
export function buildFinalBracketMatchTree(
  gradeId: string,
  seedsOrdered: string[],
  bracketGroup?: "A" | "B" | "U",
  format: FinalsBracketFormat = "ladder"
): FinalMatchData[] {
  if (format === "ladder" && useCascadeLadderForFinals(seedsOrdered.length)) {
    return buildCascadeLadderBracketTree(gradeId, seedsOrdered, bracketGroup);
  }
  const fr = buildFirstRoundSingleElim(seedsOrdered);
  const bracketSize = fr.bracketSize;
  const roundCount = totalRounds(bracketSize);
  const matches: FinalMatchData[] = [];

  for (let r = 0; r < roundCount; r++) {
    const matchesInRound = bracketSize >> (r + 1);
    for (let m = 0; m < matchesInRound; m++) {
      const id = groupedMatchId(gradeId, r, m, bracketGroup);
      let teamAId: string | undefined;
      let teamBId: string | undefined;
      let status: FinalMatchData["status"] = "SCHEDULED";
      let winnerTeamId: string | undefined;
      let feedsFromA: string | undefined;
      let feedsFromB: string | undefined;

      if (r === 0) {
        const p = fr.matches[m];
        const auto = resolveFirstRoundWinner(p.slotA, p.slotB);
        teamAId = p.slotA.kind === "team" ? p.slotA.teamId : undefined;
        teamBId = p.slotB.kind === "team" ? p.slotB.teamId : undefined;
        if (auto) {
          winnerTeamId = auto;
          status = "COMPLETED";
        }
      } else {
        feedsFromA = groupedMatchId(gradeId, r - 1, m * 2, bracketGroup);
        feedsFromB = groupedMatchId(gradeId, r - 1, m * 2 + 1, bracketGroup);
      }

      let nextMatchId: string | undefined;
      if (r < roundCount - 1) {
        nextMatchId = groupedMatchId(gradeId, r + 1, Math.floor(m / 2), bracketGroup);
      }

      matches.push({
        id,
        gradeId,
        bracketGroup,
        roundIndex: r,
        slotInRound: m,
        teamAId,
        teamBId,
        status,
        winnerTeamId,
        nextMatchId,
        feedsFromA,
        feedsFromB,
      });
    }
  }

  // Propagate first-round bye winners into the next round (denormalized team ids).
  const byId = new Map(matches.map((x) => [x.id, x] as const));
  for (const mm of matches) {
    if (!mm.winnerTeamId || !mm.nextMatchId) continue;
    const nxt = byId.get(mm.nextMatchId);
    if (!nxt) continue;
    if (mm.slotInRound % 2 === 0) nxt.teamAId = mm.winnerTeamId;
    else nxt.teamBId = mm.winnerTeamId;
  }

  return matches;
}

/**
 * Build split League A/B finals and connect both league champions
 * into a single grade championship final.
 */
export function buildSplitFinalBracketWithGradeChampionship(
  gradeId: string,
  seedsA: string[],
  seedsB: string[],
  format: FinalsBracketFormat = "ladder"
): FinalMatchData[] {
  const treeA = buildFinalBracketMatchTree(gradeId, seedsA, "A", format);
  const treeB = buildFinalBracketMatchTree(gradeId, seedsB, "B", format);

  const finalA = [...treeA].sort((x, y) => y.roundIndex - x.roundIndex)[0];
  const finalB = [...treeB].sort((x, y) => y.roundIndex - x.roundIndex)[0];
  if (!finalA || !finalB) return [...treeA, ...treeB];

  const championshipRound = Math.max(finalA.roundIndex, finalB.roundIndex) + 1;
  const championshipId = groupedMatchId(gradeId, championshipRound, 0, "U");

  const linkedA = treeA.map((m) =>
    m.id === finalA.id ? { ...m, nextMatchId: championshipId } : m
  );
  const linkedB = treeB.map((m) =>
    m.id === finalB.id ? { ...m, nextMatchId: championshipId } : m
  );

  const championship: FinalMatchData = {
    id: championshipId,
    gradeId,
    bracketGroup: "U",
    roundIndex: championshipRound,
    slotInRound: 0,
    teamAId: finalA.winnerTeamId,
    teamBId: finalB.winnerTeamId,
    status: "SCHEDULED",
    feedsFromA: finalA.id,
    feedsFromB: finalB.id,
  };

  return [...linkedA, ...linkedB, championship];
}

/** Grade championship final (split: fed by both leagues; unified: top U-bracket final before challenge). */
export function findGradeChampionshipMatch(
  matches: FinalMatchData[]
): FinalMatchData | undefined {
  const splitFinal = matches.find(
    (m) =>
      (m.bracketGroup ?? "U") === "U" &&
      m.matchKind !== "japanCupChallenge" &&
      m.feedsFromA &&
      m.feedsFromB
  );
  if (splitFinal) return splitFinal;
  const uMatches = matches.filter(
    (m) =>
      (m.bracketGroup ?? "U") === "U" && m.matchKind !== "japanCupChallenge"
  );
  if (uMatches.length === 0) return undefined;
  return uMatches.sort((a, b) => b.roundIndex - a.roundIndex)[0];
}

export function findJapanCupChallengeMatch(
  matches: FinalMatchData[]
): FinalMatchData | undefined {
  return matches.find((m) => m.matchKind === "japanCupChallenge");
}

export function japanCupChallengeMatchId(
  gradeId: string,
  gradeFinalRoundIndex: number
): string {
  return groupedMatchId(gradeId, gradeFinalRoundIndex + 1, 0, "U");
}

/** Optional super-final after grade championship: grade final winner vs admin Japan Cup champion. */
export function buildJapanCupChallengeMatch(
  gradeId: string,
  gradeFinalMatch: FinalMatchData,
  championTeamId: string,
  gradeFinalWinnerId?: string
): FinalMatchData {
  const id = japanCupChallengeMatchId(gradeId, gradeFinalMatch.roundIndex);
  return {
    id,
    gradeId,
    bracketGroup: "U",
    matchKind: "japanCupChallenge",
    roundIndex: gradeFinalMatch.roundIndex + 1,
    slotInRound: 0,
    teamAId: gradeFinalWinnerId,
    teamBId: championTeamId,
    status: "SCHEDULED",
    feedsFromA: gradeFinalMatch.id,
  };
}
