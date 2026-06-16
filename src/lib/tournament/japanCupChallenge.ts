import type { FinalMatchData, QualifyingMatchData } from "@/lib/tournament/types";
import {
  buildJapanCupChallengeMatch,
  findGradeChampionshipMatch,
  findJapanCupChallengeMatch,
} from "@/lib/tournament/bracketMatches";

export interface JapanCupChallengeMeta {
  enabled: boolean;
  /** Dedicated team id (not from regular pool), e.g. G1__JC */
  championTeamId: string;
  championName: string;
  matchId?: string;
}

export interface FinalsGradeMeta {
  generatedAt?: number;
  seeds?: string[] | { A: string[]; B: string[] };
  japanCupChallenge?: JapanCupChallengeMeta;
  trueGradeChampionTeamId?: string;
}

export function japanCupChampionTeamIdForGrade(gradeId: string): string {
  return `${gradeId}__JC`;
}

export function isRegularPoolTeam(team: object): boolean {
  return !(team as { japanCupChampionOnly?: boolean }).japanCupChampionOnly;
}

export function getJapanCupChampionTeamId(
  meta: FinalsGradeMeta | null | undefined,
  gradeId?: string
): string | undefined {
  const jc = meta?.japanCupChallenge;
  if (!jc?.enabled) return undefined;
  if (jc.championTeamId?.trim()) return jc.championTeamId.trim();
  if (gradeId) return japanCupChampionTeamIdForGrade(gradeId);
  return undefined;
}

export function excludeJapanCupChampion(
  teamIds: string[],
  championTeamId: string | undefined
): string[] {
  if (!championTeamId) return teamIds;
  return teamIds.filter((id) => id !== championTeamId);
}

export function teamIsJapanCupChampion(
  teamId: string,
  meta: FinalsGradeMeta | null | undefined,
  gradeId?: string
): boolean {
  const champion = getJapanCupChampionTeamId(meta, gradeId);
  return Boolean(champion && champion === teamId);
}

export function stripJapanCupChampionFromSeeds(
  seeds: string[] | { A: string[]; B: string[] },
  championTeamId: string | undefined
): string[] | { A: string[]; B: string[] } {
  if (!championTeamId) return seeds;
  if (Array.isArray(seeds)) {
    return excludeJapanCupChampion(seeds, championTeamId);
  }
  return {
    A: excludeJapanCupChampion(seeds.A, championTeamId),
    B: excludeJapanCupChampion(seeds.B, championTeamId),
  };
}

export function teamInQualifyingForGrade(
  teamId: string,
  gradeId: string,
  matches: Record<string, QualifyingMatchData> | null | undefined
): boolean {
  if (!matches) return false;
  for (const m of Object.values(matches)) {
    if (m.gradeId !== gradeId) continue;
    if (m.teamAId === teamId || m.teamBId === teamId) return true;
  }
  return false;
}

export function teamInFinalsForGrade(
  teamId: string,
  gradeId: string,
  matches: Record<string, FinalMatchData> | null | undefined
): boolean {
  if (!matches) return false;
  for (const m of Object.values(matches)) {
    if (m.gradeId !== gradeId) continue;
    if (m.matchKind === "japanCupChallenge") continue;
    if (m.teamAId === teamId || m.teamBId === teamId) return true;
  }
  return false;
}

export function validateJapanCupChampionNotInBracket(
  championTeamId: string,
  gradeId: string,
  qMatches: Record<string, QualifyingMatchData> | null | undefined,
  fMatches: Record<string, FinalMatchData> | null | undefined
): string | null {
  if (teamInQualifyingForGrade(championTeamId, gradeId, qMatches)) {
    return "This team already has preliminary matches. Delete/regenerate prelims without this team, or pick another team.";
  }
  if (teamInFinalsForGrade(championTeamId, gradeId, fMatches)) {
    return "This team is already in the finals bracket. Delete finals or pick another team.";
  }
  return null;
}

export function resolveJapanCupChallengeDisplayMatch(
  matches: FinalMatchData[],
  meta: FinalsGradeMeta | null | undefined,
  gradeId: string
): FinalMatchData | undefined {
  if (!meta?.japanCupChallenge?.enabled) return undefined;
  const existing = findJapanCupChallengeMatch(matches);
  if (existing) return existing;
  const championTeamId = getJapanCupChampionTeamId(meta, gradeId);
  if (!championTeamId) return undefined;
  const gradeFinal = findGradeChampionshipMatch(matches);
  if (gradeFinal) {
    return buildJapanCupChallengeMatch(
      gradeId,
      gradeFinal,
      championTeamId,
      gradeFinal.status === "COMPLETED" ? gradeFinal.winnerTeamId : undefined
    );
  }
  return {
    id: `${gradeId}_JC_PREVIEW`,
    gradeId,
    bracketGroup: "U",
    matchKind: "japanCupChallenge",
    roundIndex: 0,
    slotInRound: 0,
    teamBId: championTeamId,
    status: "SCHEDULED",
  };
}

export function resolveTrueGradeChampion(
  matches: FinalMatchData[],
  meta: FinalsGradeMeta | null | undefined
): string | undefined {
  const challenge = findJapanCupChallengeMatch(matches);
  if (meta?.japanCupChallenge?.enabled) {
    if (challenge?.status === "COMPLETED" && challenge.winnerTeamId) {
      return challenge.winnerTeamId;
    }
    if (meta.trueGradeChampionTeamId) return meta.trueGradeChampionTeamId;
    return undefined;
  }
  const gradeFinal = findGradeChampionshipMatch(matches);
  if (gradeFinal?.status === "COMPLETED" && gradeFinal.winnerTeamId) {
    return gradeFinal.winnerTeamId;
  }
  return undefined;
}

export function isGradeChampionshipMatch(m: FinalMatchData): boolean {
  return (
    (m.bracketGroup ?? "U") === "U" &&
    m.matchKind !== "japanCupChallenge" &&
    Boolean(m.feedsFromA && m.feedsFromB)
  );
}

export function gradeChampionshipComplete(
  matches: FinalMatchData[]
): boolean {
  const gf = findGradeChampionshipMatch(matches);
  return gf?.status === "COMPLETED" && Boolean(gf.winnerTeamId);
}

export { buildJapanCupChallengeMatch, findGradeChampionshipMatch, findJapanCupChallengeMatch };
