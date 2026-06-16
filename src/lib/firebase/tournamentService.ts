import {
  ref,
  set,
  get,
  update,
  push,
  remove,
  onValue,
  runTransaction,
  type Unsubscribe,
} from "firebase/database";
import { getDb } from "./config";
import { paths } from "./schema";
import type {
  FinalMatchData,
  MatchSchedule,
  QualifyingMatchData,
  RegulationScores,
  ResurrectionMeta,
  ResurrectionPoolGroup,
} from "@/lib/tournament/types";
import {
  regulationTotals,
  qualifyingOutcomeFromTotals,
  getQualifyingFixturePairings,
} from "@/lib/tournament/roundRobin";
import type { LeagueId } from "@/lib/tournament/leagueSplit";
import {
  divisionLeagueKey,
  effectiveLeagueCount,
  hasAnySavedForTeams,
  partitionTeamsIntoLeaguesFromSaved,
  shuffleTeamsIntoLeagues,
} from "@/lib/tournament/leagueSplit";
import {
  applyExtraEightComplete,
  applyRegulationComplete,
  applySuddenDeathCloser,
} from "@/lib/tournament/finalMatch";
import type { Closer } from "@/lib/tournament/types";
import {
  buildFinalBracketMatchTree,
  buildSplitFinalBracketWithGradeChampionship,
  buildResurrectionBracketMatchTree,
  buildJapanCupChallengeMatch,
  findGradeChampionshipMatch,
  findJapanCupChallengeMatch,
  type FinalsBracketFormat,
} from "@/lib/tournament/bracketMatches";
import { snapshotJapanCupEligibilityForGrade } from "@/lib/firebase/fairPlayService";
import { isFairPlayEnabled } from "@/lib/tournament/fairPlay";
import {
  getJapanCupChampionTeamId,
  gradeChampionshipComplete,
  japanCupChampionTeamIdForGrade,
  stripJapanCupChampionFromSeeds,
  validateJapanCupChampionNotInBracket,
  type FinalsGradeMeta,
} from "@/lib/tournament/japanCupChallenge";
import { resolveTeamId, type ResolveTeamIdOptions } from "@/lib/tournament/teamResolve";
import {
  finalMatchHasScores,
  pickJapanCupChallengeOnRegenerate,
} from "@/lib/tournament/finalMatchProgress";

function stripDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map(stripDeep).filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const sv = stripDeep(v);
      if (sv !== undefined) o[k] = sv;
    }
    return o;
  }
  return value;
}

async function loadQualifyingMatchesRecord(
  tournamentId: string
): Promise<Record<string, QualifyingMatchData>> {
  const snap = await get(ref(getDb(), paths.qualifyingMatches(tournamentId)));
  return (snap.val() as Record<string, QualifyingMatchData> | null) ?? {};
}

async function assertJapanCupChallengeScoringAllowed(
  tournamentId: string,
  gradeId: string,
  match: FinalMatchData
): Promise<void> {
  if (match.matchKind !== "japanCupChallenge") return;
  const all = await loadFinalMatchesForGrade(tournamentId, gradeId);
  if (!gradeChampionshipComplete(all)) {
    throw new Error(
      "Complete the grade championship final before scoring the Japan Cup challenge."
    );
  }
}

export type QualifyingMode = "twoPools" | "unified";

/** Set once at tournament creation; not mutable via partial meta updates. */
export type TournamentKind = "intraSchool" | "interSchool";

export interface TournamentMeta {
  name: string;
  schoolYear: number;
  createdAt?: number;
  /**
   * Within-school vs school-vs-school. Omit in legacy DB = treat as within-school.
   * Immutable after create (change via new tournament ID or delete meta).
   */
  tournamentKind?: TournamentKind;
  /** Optional UI label for preliminary pool A (e.g. host school name). */
  divisionLabelA?: string;
  /** Optional UI label for preliminary pool B (e.g. partner school name). */
  divisionLabelB?: string;
  /**
   * `twoPools` (default): divisions A and B each have their own RR, then alternate seeds.
   * `unified`: single combined RR in pool A only; top K by rank go to finals best-first.
   */
  qualifyingMode?: QualifyingMode;
  /**
   * Optional per grade/division league-count map.
   * Key format: `${gradeId}_${divisionId}` (e.g. `G1_A`), value: 1 or 2.
   */
  qualifyingLeagueCountByDivision?: Record<string, 1 | 2>;
  /**
   * Saved L1/L2 roster per grade/division pool. Key: `${gradeId}_${divisionId}`.
   */
  qualifyingLeagueAssignmentsByDivision?: Record<string, Record<string, LeagueId>>;
}

export interface SchoolRecord {
  name: string;
  shortLabel?: string;
}

export interface TeamRecord {
  gradeId: string;
  divisionId: "A" | "B";
  name: string;
  code?: string;
  /** References `tournaments/.../schools/{schoolId}` when set. */
  schoolId?: string;
  /** Within-school Fair Play balance (default 15 when unset). */
  fairPlayPoints?: number;
  /** Japan Cup defending champion — not in preliminary/finals pools. */
  japanCupChampionOnly?: true;
}

export interface StudentRecord {
  name: string;
  teamId?: string;
  /** Current Fair Play balance (0..fairPlayInitialShare). */
  fairPlayPoints?: number;
  /** Starting slice from team pool of 15. */
  fairPlayInitialShare?: number;
  /** Set when finals bracket is generated for the team's grade. */
  japanCupEligible?: boolean;
}

export function subscribeTournamentMeta(
  tournamentId: string,
  cb: (meta: TournamentMeta | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.tournamentMeta(tournamentId));
  return onValue(r, (snap) => {
    cb(snap.val() as TournamentMeta | null);
  });
}

export function subscribeTeams(
  tournamentId: string,
  cb: (teams: Record<string, TeamRecord> | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.teams(tournamentId));
  return onValue(r, (snap) => {
    cb(snap.val() as Record<string, TeamRecord> | null);
  });
}

export function subscribeSchools(
  tournamentId: string,
  cb: (schools: Record<string, SchoolRecord> | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.schools(tournamentId));
  return onValue(r, (snap) => {
    cb(snap.val() as Record<string, SchoolRecord> | null);
  });
}

export function subscribeQualifyingMatches(
  tournamentId: string,
  cb: (matches: Record<string, QualifyingMatchData> | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.qualifyingMatches(tournamentId));
  return onValue(r, (snap) => {
    cb(snap.val() as Record<string, QualifyingMatchData> | null);
  });
}

export function subscribeFinalMatches(
  tournamentId: string,
  gradeId: string,
  cb: (matches: Record<string, FinalMatchData> | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.finalsMatches(tournamentId, gradeId));
  return onValue(r, (snap) => {
    const raw = snap.val() as Record<string, Omit<FinalMatchData, "id"> & { id?: string }> | null;
    if (!raw) {
      cb(null);
      return;
    }
    const hydrated: Record<string, FinalMatchData> = {};
    for (const [id, value] of Object.entries(raw)) {
      hydrated[id] = {
        ...(value as FinalMatchData),
        id,
      };
    }
    cb(hydrated);
  });
}

export function subscribeResurrectionMatches(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  cb: (matches: Record<string, FinalMatchData> | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.resurrectionMatches(tournamentId, gradeId, group));
  return onValue(r, (snap) => {
    const raw = snap.val() as Record<
      string,
      Omit<FinalMatchData, "id"> & { id?: string }
    > | null;
    if (!raw) {
      cb(null);
      return;
    }
    const hydrated: Record<string, FinalMatchData> = {};
    for (const [id, value] of Object.entries(raw)) {
      hydrated[id] = {
        ...(value as FinalMatchData),
        id,
      };
    }
    cb(hydrated);
  });
}

export function subscribeResurrectionMeta(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  cb: (meta: ResurrectionMeta | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.resurrectionMeta(tournamentId, gradeId, group));
  return onValue(r, (snap) => {
    cb(snap.val() as ResurrectionMeta | null);
  });
}

export async function deleteResurrectionGroup(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup
): Promise<void> {
  await remove(
    ref(getDb(), paths.resurrectionGroupRoot(tournamentId, gradeId, group))
  );
}

export async function generateResurrectionBracket(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  entrantTeamIds: string[]
): Promise<void> {
  if (entrantTeamIds.length === 0) {
    throw new Error("Redemption needs at least one entrant below the cut.");
  }
  await remove(
    ref(getDb(), paths.resurrectionGroupRoot(tournamentId, gradeId, group))
  );
  if (entrantTeamIds.length === 1) {
    const meta: ResurrectionMeta = {
      generatedAt: Date.now(),
      entrantTeamIds: [...entrantTeamIds],
      completedWinnerTeamId: entrantTeamIds[0],
    };
    await set(
      ref(getDb(), paths.resurrectionMeta(tournamentId, gradeId, group)),
      stripDeep(meta)
    );
    return;
  }
  const tree = buildResurrectionBracketMatchTree(gradeId, group, entrantTeamIds);
  const meta: ResurrectionMeta = {
    generatedAt: Date.now(),
    entrantTeamIds: [...entrantTeamIds],
  };
  const updates: Record<string, unknown> = {
    [paths.resurrectionMeta(tournamentId, gradeId, group)]: stripDeep(meta),
  };
  for (const m of tree) {
    const { id, ...rest } = m;
    updates[paths.resurrectionMatch(tournamentId, gradeId, group, id)] =
      stripDeep(rest);
  }
  await update(ref(getDb()), updates);
}

export async function createTournament(
  tournamentId: string,
  meta: TournamentMeta
): Promise<void> {
  await set(ref(getDb(), paths.tournamentMeta(tournamentId)), stripDeep(meta));
}

/** Merge or clear tournament meta fields. Pass `null` for division labels to remove them. `tournamentKind` cannot be changed here. */
export async function updateTournamentMetaPartial(
  tournamentId: string,
  partial: Partial<{
    name: string;
    schoolYear: number;
    divisionLabelA: string | null;
    divisionLabelB: string | null;
    /** Pass `null` to remove key (default behavior = twoPools). */
    qualifyingMode: QualifyingMode | null;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(partial)) {
    if (k === "tournamentKind") continue;
    if (v === null) payload[k] = null;
    else if (v !== undefined) payload[k] = v;
  }
  if (Object.keys(payload).length === 0) return;
  await update(ref(getDb(), paths.tournamentMeta(tournamentId)), payload);
}

export function getDivisionLeagueCount(
  meta: TournamentMeta | null | undefined,
  gradeId: string,
  divisionId: "A" | "B"
): 1 | 2 {
  const key = divisionLeagueKey(gradeId, divisionId);
  const v = meta?.qualifyingLeagueCountByDivision?.[key];
  return v === 2 ? 2 : 1;
}

export async function updateDivisionLeagueCount(
  tournamentId: string,
  gradeId: string,
  divisionId: "A" | "B",
  leagueCount: 1 | 2
): Promise<void> {
  const key = divisionLeagueKey(gradeId, divisionId);
  await update(ref(getDb(), paths.tournamentMeta(tournamentId)), {
    [`qualifyingLeagueCountByDivision/${key}`]: leagueCount,
  });
}

export function getQualifyingLeagueAssignment(
  meta: TournamentMeta | null | undefined,
  gradeId: string,
  divisionId: "A" | "B"
): Record<string, LeagueId> | undefined {
  const key = divisionLeagueKey(gradeId, divisionId);
  return meta?.qualifyingLeagueAssignmentsByDivision?.[key];
}

export async function setQualifyingLeagueAssignment(
  tournamentId: string,
  gradeId: string,
  divisionId: "A" | "B",
  assignment: Record<string, LeagueId>
): Promise<void> {
  const key = divisionLeagueKey(gradeId, divisionId);
  await update(ref(getDb(), paths.tournamentMeta(tournamentId)), {
    [`qualifyingLeagueAssignmentsByDivision/${key}`]: stripDeep(assignment),
  });
}

function leagueBucketsToAssignment(leagues: {
  L1: string[];
  L2: string[];
}): Record<string, LeagueId> {
  const out: Record<string, LeagueId> = {};
  for (const id of leagues.L1) out[id] = "L1";
  for (const id of leagues.L2) out[id] = "L2";
  return out;
}

/** Removes only the meta node. Teams, matches, and finals under the tournament id are unchanged. */
export async function deleteTournamentMeta(tournamentId: string): Promise<void> {
  await remove(ref(getDb(), paths.tournamentMeta(tournamentId)));
}

export async function pushSchool(
  tournamentId: string,
  school: SchoolRecord
): Promise<string> {
  const r = ref(getDb(), paths.schools(tournamentId));
  const newRef = push(r);
  const id = newRef.key;
  if (!id) throw new Error("push failed");
  const payload: Record<string, unknown> = { name: school.name.trim() };
  if (school.shortLabel?.trim()) payload.shortLabel = school.shortLabel.trim();
  await set(newRef, stripDeep(payload));
  return id;
}

export async function deleteSchool(
  tournamentId: string,
  schoolId: string
): Promise<void> {
  await remove(ref(getDb(), paths.school(tournamentId, schoolId)));
}

export async function updateTeamSchool(
  tournamentId: string,
  teamId: string,
  schoolId: string | null
): Promise<void> {
  await update(ref(getDb(), paths.team(tournamentId, teamId)), {
    schoolId: schoolId ?? null,
  });
}

export async function addTeam(
  tournamentId: string,
  teamId: string,
  team: TeamRecord
): Promise<void> {
  const payload: Record<string, unknown> = {
    gradeId: team.gradeId,
    divisionId: team.divisionId,
    name: team.name,
    fairPlayPoints: team.fairPlayPoints ?? 15,
  };
  if (team.code !== undefined && team.code !== "")
    payload.code = team.code;
  if (team.schoolId) payload.schoolId = team.schoolId;
  await set(ref(getDb(), paths.team(tournamentId, teamId)), payload);
}

export async function pushTeam(
  tournamentId: string,
  team: TeamRecord
): Promise<string> {
  const r = ref(getDb(), paths.teams(tournamentId));
  const newRef = push(r);
  const id = newRef.key;
  if (!id) throw new Error("push failed");
  await set(newRef, {
    gradeId: team.gradeId,
    divisionId: team.divisionId,
    name: team.name,
    fairPlayPoints: team.fairPlayPoints ?? 15,
    ...(team.code ? { code: team.code } : {}),
    ...(team.schoolId ? { schoolId: team.schoolId } : {}),
  });
  return id;
}

export async function saveQualifyingMatches(
  tournamentId: string,
  matches: Record<string, QualifyingMatchData>
): Promise<void> {
  const updates: Record<string, unknown> = {};
  for (const [id, m] of Object.entries(matches)) {
    updates[paths.qualifyingMatch(tournamentId, id)] = stripDeep(m);
  }
  await update(ref(getDb()), updates);
}

/**
 * Generate and write qualifying fixtures for one division (idempotent keys by pairing).
 * If every team has a `schoolId` and exactly two schools appear in this pool,
 * schedules **only** cross-school games (each team vs every team from the other school).
 * Otherwise uses a full round-robin.
 */
export async function generateQualifyingRoundRobin(
  tournamentId: string,
  gradeId: string,
  divisionId: "A" | "B",
  teamIds: string[],
  schoolIdByTeamId?: Record<string, string | undefined>,
  requestedLeagueCount: 1 | 2 = 1
): Promise<void> {
  const leagueCount = effectiveLeagueCount(requestedLeagueCount, teamIds.length);
  const updates: Record<string, unknown> = {};
  const metaPath = paths.tournamentMeta(tournamentId);
  const assignKey = divisionLeagueKey(gradeId, divisionId);

  if (leagueCount === 1) {
    const pairings = getQualifyingFixturePairings(teamIds, schoolIdByTeamId);
    for (const p of pairings) {
      const id = `${gradeId}_${divisionId}_R${p.round}_${p.teamA}_${p.teamB}`;
      const m: QualifyingMatchData = {
        id,
        gradeId,
        divisionId,
        round: p.round,
        teamAId: p.teamA,
        teamBId: p.teamB,
        status: "SCHEDULED",
      };
      updates[paths.qualifyingMatch(tournamentId, id)] = stripDeep(m);
    }
  } else {
    const metaSnap = await get(ref(getDb(), metaPath));
    const metaVal = metaSnap.val() as TournamentMeta | null;
    const saved = getQualifyingLeagueAssignment(
      metaVal,
      gradeId,
      divisionId
    );
    let leagueTeams: { L1: string[]; L2: string[] };
    let assignmentRecord: Record<string, LeagueId>;
    if (saved && hasAnySavedForTeams(teamIds, saved)) {
      leagueTeams = partitionTeamsIntoLeaguesFromSaved(teamIds, saved);
      assignmentRecord = leagueBucketsToAssignment(leagueTeams);
    } else {
      const shuffled = shuffleTeamsIntoLeagues(teamIds);
      leagueTeams = { L1: shuffled.L1, L2: shuffled.L2 };
      assignmentRecord = shuffled.assignment;
    }
    updates[`${metaPath}/qualifyingLeagueAssignmentsByDivision/${assignKey}`] =
      stripDeep(assignmentRecord);
    for (const leagueId of ["L1", "L2"] as const) {
      const teams = leagueTeams[leagueId];
      const schoolMapScoped: Record<string, string | undefined> = {};
      for (const id of teams) schoolMapScoped[id] = schoolIdByTeamId?.[id];
      const pairings = getQualifyingFixturePairings(teams, schoolMapScoped);
      for (const p of pairings) {
        const id = `${gradeId}_${divisionId}_${leagueId}_R${p.round}_${p.teamA}_${p.teamB}`;
        const m: QualifyingMatchData = {
          id,
          gradeId,
          divisionId,
          leagueId,
          round: p.round,
          teamAId: p.teamA,
          teamBId: p.teamB,
          status: "SCHEDULED",
        };
        updates[paths.qualifyingMatch(tournamentId, id)] = stripDeep(m);
      }
    }
  }
  await update(ref(getDb()), updates);
}

/** Remove a team node. */
export async function deleteTeam(
  tournamentId: string,
  teamId: string
): Promise<void> {
  await remove(ref(getDb(), paths.team(tournamentId, teamId)));
}

/**
 * Delete qualifying match nodes. Uses multi-path update with `null` (RTDB delete primitive).
 */
export async function deleteQualifyingMatchesByIds(
  tournamentId: string,
  matchIds: string[]
): Promise<void> {
  if (matchIds.length === 0) return;
  const updates: Record<string, null> = {};
  for (const id of matchIds) {
    updates[paths.qualifyingMatch(tournamentId, id)] = null;
  }
  await update(ref(getDb()), updates);
}

/** Remove finals matches for one grade; preserves Japan Cup challenge meta and JC team when enabled. */
export async function deleteFinalsForGrade(
  tournamentId: string,
  gradeId: string
): Promise<void> {
  const meta = (await loadFinalsGradeMeta(tournamentId, gradeId)) ?? {};
  await remove(ref(getDb(), paths.finalsMatches(tournamentId, gradeId)));
  const preserved: FinalsGradeMeta = {};
  if (meta.japanCupChallenge?.enabled) {
    preserved.japanCupChallenge = {
      ...meta.japanCupChallenge,
      matchId: undefined,
    };
  }
  if (Object.keys(preserved).length === 0) {
    await remove(ref(getDb(), paths.finalsGradeMeta(tournamentId, gradeId)));
    return;
  }
  await update(ref(getDb(), paths.finalsGradeMeta(tournamentId, gradeId)), {
    generatedAt: null,
    seeds: null,
    trueGradeChampionTeamId: null,
    japanCupChallenge: stripDeep({
      ...preserved.japanCupChallenge,
      matchId: undefined,
    }),
  });
}

export async function completeQualifyingMatch(
  tournamentId: string,
  matchId: string,
  regulation: RegulationScores
): Promise<void> {
  const { totalA, totalB } = regulationTotals(regulation);
  const outcome = qualifyingOutcomeFromTotals(totalA, totalB);
  const r = ref(getDb(), paths.qualifyingMatch(tournamentId, matchId));
  await update(r, {
    status: "COMPLETED",
    regulation,
    outcome,
  });
}

/** Merge schedule on the match node; pass `null` to remove `schedule`. */
export async function updateQualifyingSchedule(
  tournamentId: string,
  matchId: string,
  schedule: MatchSchedule | null
): Promise<void> {
  const r = ref(getDb(), paths.qualifyingMatch(tournamentId, matchId));
  if (schedule === null) {
    await update(r, { schedule: null });
  } else {
    await update(r, { schedule: stripDeep(schedule) });
  }
}

export async function updateFinalSchedule(
  tournamentId: string,
  gradeId: string,
  matchId: string,
  schedule: MatchSchedule | null
): Promise<void> {
  const r = ref(getDb(), paths.finalsMatch(tournamentId, gradeId, matchId));
  if (schedule === null) {
    await update(r, { schedule: null });
  } else {
    await update(r, { schedule: stripDeep(schedule) });
  }
}

export type { FinalsGradeMeta } from "@/lib/tournament/japanCupChallenge";

async function loadFinalsGradeMeta(
  tournamentId: string,
  gradeId: string
): Promise<FinalsGradeMeta | null> {
  const snap = await get(ref(getDb(), paths.finalsGradeMeta(tournamentId, gradeId)));
  return snap.val() as FinalsGradeMeta | null;
}

async function loadFinalMatchesForGrade(
  tournamentId: string,
  gradeId: string
): Promise<FinalMatchData[]> {
  const snap = await get(ref(getDb(), paths.finalsMatches(tournamentId, gradeId)));
  const val = snap.val() as Record<string, FinalMatchData> | null;
  return val ? Object.values(val) : [];
}

async function maybeSyncJapanCupChallengeAfterFinal(
  tournamentId: string,
  gradeId: string,
  completedMatch: FinalMatchData
): Promise<void> {
  if (completedMatch.status !== "COMPLETED" || !completedMatch.winnerTeamId) return;

  const meta = await loadFinalsGradeMeta(tournamentId, gradeId);
  if (!meta?.japanCupChallenge?.enabled) return;

  if (completedMatch.matchKind === "japanCupChallenge") {
    await update(ref(getDb(), paths.finalsGradeMeta(tournamentId, gradeId)), {
      trueGradeChampionTeamId: completedMatch.winnerTeamId,
    });
    return;
  }

  const allMatches = await loadFinalMatchesForGrade(tournamentId, gradeId);
  const gradeFinal = findGradeChampionshipMatch(allMatches);
  if (!gradeFinal || gradeFinal.id !== completedMatch.id) return;

  const championTeamId =
    getJapanCupChampionTeamId(meta, gradeId) ?? japanCupChampionTeamIdForGrade(gradeId);
  const existingChallenge = findJapanCupChallengeMatch(allMatches);

  if (existingChallenge?.status === "COMPLETED") return;

  if (
    existingChallenge &&
    existingChallenge.id === buildJapanCupChallengeMatch(
      gradeId,
      gradeFinal,
      championTeamId,
      completedMatch.winnerTeamId
    ).id &&
    finalMatchHasScores(existingChallenge)
  ) {
    if (existingChallenge.teamAId !== completedMatch.winnerTeamId) {
      await update(ref(getDb(), paths.finalsMatch(tournamentId, gradeId, existingChallenge.id)), {
        teamAId: completedMatch.winnerTeamId,
      });
    }
    return;
  }

  const built = buildJapanCupChallengeMatch(
    gradeId,
    gradeFinal,
    championTeamId,
    completedMatch.winnerTeamId
  );

  const updates: Record<string, unknown> = {
    [paths.finalsMatch(tournamentId, gradeId, built.id)]: stripDeep(
      (() => {
        const { id: _id, ...rest } = built;
        return rest;
      })()
    ),
    [`${paths.finalsGradeMeta(tournamentId, gradeId)}/japanCupChallenge/matchId`]:
      built.id,
  };

  if (existingChallenge && existingChallenge.id !== built.id) {
    updates[paths.finalsMatch(tournamentId, gradeId, existingChallenge.id)] = null;
  }

  await update(ref(getDb()), updates);
}

export async function setJapanCupChallengeEnabled(
  tournamentId: string,
  gradeId: string,
  enabled: boolean,
  championName?: string
): Promise<void> {
  const metaPath = paths.finalsGradeMeta(tournamentId, gradeId);
  const existing = (await loadFinalsGradeMeta(tournamentId, gradeId)) ?? {};
  const championTeamId =
    existing.japanCupChallenge?.championTeamId ??
    japanCupChampionTeamIdForGrade(gradeId);

  if (!enabled) {
    const matchId = existing.japanCupChallenge?.matchId;
    const updates: Record<string, unknown> = {
      [`${metaPath}/japanCupChallenge`]: null,
      [`${metaPath}/trueGradeChampionTeamId`]: null,
      [paths.team(tournamentId, championTeamId)]: null,
    };
    if (matchId) {
      updates[paths.finalsMatch(tournamentId, gradeId, matchId)] = null;
    }
    await update(ref(getDb()), updates);
    return;
  }

  const name = championName?.trim();
  if (!name) throw new Error("Enter the Japan Cup champion team name.");

  const qMatches = await loadQualifyingMatchesRecord(tournamentId);
  const allMatches = await loadFinalMatchesForGrade(tournamentId, gradeId);
  const teamSnap = await get(ref(getDb(), paths.team(tournamentId, championTeamId)));
  const existingTeam = teamSnap.val() as TeamRecord | null;
  if (
    existingTeam &&
    !existingTeam.japanCupChampionOnly &&
    existingTeam.gradeId === gradeId
  ) {
    throw new Error(
      "The Japan Cup champion team id is already used by a regular pool team. Remove or rename that team first."
    );
  }
  const bracketErr = validateJapanCupChampionNotInBracket(
    championTeamId,
    gradeId,
    qMatches,
    Object.fromEntries(allMatches.map((m) => [m.id, m]))
  );
  if (bracketErr) throw new Error(bracketErr);

  const gradeFinal = findGradeChampionshipMatch(allMatches);
  const existingChallenge = findJapanCupChallengeMatch(allMatches);
  let challengeMatchId = existing.japanCupChallenge?.matchId;
  const nameOnly =
    existing.japanCupChallenge?.enabled &&
    existing.japanCupChallenge.championTeamId === championTeamId &&
    existing.japanCupChallenge.championName !== name;

  const updates: Record<string, unknown> = {
    [paths.team(tournamentId, championTeamId)]: stripDeep({
      gradeId,
      divisionId: "A",
      name,
      japanCupChampionOnly: true,
    }),
  };

  const shouldRebuildMatch =
    gradeFinal &&
    (!existingChallenge ||
      !finalMatchHasScores(existingChallenge) ||
      !nameOnly);

  if (shouldRebuildMatch && gradeFinal) {
    const winner =
      gradeFinal.status === "COMPLETED" ? gradeFinal.winnerTeamId : undefined;
    const built = buildJapanCupChallengeMatch(
      gradeId,
      gradeFinal,
      championTeamId,
      winner
    );
    const { id, ...rest } = built;
    challengeMatchId = id;
    updates[paths.finalsMatch(tournamentId, gradeId, id)] = stripDeep(rest);

    if (existingChallenge && existingChallenge.id !== id) {
      updates[paths.finalsMatch(tournamentId, gradeId, existingChallenge.id)] = null;
    }
  }

  updates[`${metaPath}/japanCupChallenge`] = stripDeep({
    enabled: true,
    championTeamId,
    championName: name,
    matchId: challengeMatchId,
  });

  await update(ref(getDb()), updates);
}

export type GenerateFinalsOptions = {
  /** Append redemption champion per pool when generating main finals (K+1 seeds). */
  resurrectionWinnerByGroup?: Partial<Record<ResurrectionPoolGroup, string>>;
  /** Stepladder (default) or classic single-elimination per pool. */
  bracketFormat?: FinalsBracketFormat;
};

export async function generateFinalsForGrade(
  tournamentId: string,
  gradeId: string,
  seedsOrdered: string[] | { A: string[]; B: string[] },
  options?: GenerateFinalsOptions
): Promise<void> {
  const meta = await get(ref(getDb(), paths.tournamentMeta(tournamentId))).then((s) =>
    s.val() as TournamentMeta | null
  );
  if (isFairPlayEnabled(meta)) {
    await snapshotJapanCupEligibilityForGrade(tournamentId, gradeId);
  }
  const existingGradeMeta = (await loadFinalsGradeMeta(tournamentId, gradeId)) ?? {};
  const priorMatches = await loadFinalMatchesForGrade(tournamentId, gradeId);
  const priorChallenge = findJapanCupChallengeMatch(priorMatches);
  const championId = getJapanCupChampionTeamId(existingGradeMeta, gradeId);
  const strippedSeeds = stripJapanCupChampionFromSeeds(seedsOrdered, championId);
  const rw = options?.resurrectionWinnerByGroup;
  const mergedSeeds: string[] | { A: string[]; B: string[] } = Array.isArray(
    strippedSeeds
  )
    ? rw?.U
      ? [...strippedSeeds, rw.U]
      : strippedSeeds
    : {
        A: rw?.A ? [...strippedSeeds.A, rw.A] : strippedSeeds.A,
        B: rw?.B ? [...strippedSeeds.B, rw.B] : strippedSeeds.B,
      };
  const bracketFormat = options?.bracketFormat ?? "ladder";
  const trees = Array.isArray(mergedSeeds)
    ? [buildFinalBracketMatchTree(gradeId, mergedSeeds, "U", bracketFormat)]
    : [
        buildSplitFinalBracketWithGradeChampionship(
          gradeId,
          mergedSeeds.A,
          mergedSeeds.B,
          bracketFormat
        ),
      ];
  let allMatches = trees.flat();

  if (existingGradeMeta.japanCupChallenge?.enabled && championId) {
    const gradeFinal = findGradeChampionshipMatch(allMatches);
    if (gradeFinal) {
      allMatches = allMatches.filter((m) => m.matchKind !== "japanCupChallenge");
      const winner =
        gradeFinal.status === "COMPLETED" ? gradeFinal.winnerTeamId : undefined;
      const challenge = buildJapanCupChallengeMatch(
        gradeId,
        gradeFinal,
        championId,
        winner
      );
      allMatches.push(challenge);
      allMatches[allMatches.length - 1] = pickJapanCupChallengeOnRegenerate(
        priorChallenge,
        challenge
      );
      existingGradeMeta.japanCupChallenge = {
        ...existingGradeMeta.japanCupChallenge,
        enabled: true,
        championTeamId: championId,
        matchId: challenge.id,
      };
    }
  }

  const metaPayload: FinalsGradeMeta = {
    generatedAt: Date.now(),
    seeds: mergedSeeds,
    bracketFormat,
    ...(existingGradeMeta.japanCupChallenge
      ? { japanCupChallenge: existingGradeMeta.japanCupChallenge }
      : {}),
    ...(existingGradeMeta.trueGradeChampionTeamId &&
    findJapanCupChallengeMatch(allMatches)?.status === "COMPLETED"
      ? {
          trueGradeChampionTeamId:
            findJapanCupChallengeMatch(allMatches)?.winnerTeamId ??
            existingGradeMeta.trueGradeChampionTeamId,
        }
      : {}),
  };

  const existingMatchSnap = await get(
    ref(getDb(), paths.finalsMatches(tournamentId, gradeId))
  );
  const existingMatchKeys = Object.keys(
    (existingMatchSnap.val() as Record<string, FinalMatchData> | null) ?? {}
  );
  const newMatchIds = new Set(allMatches.map((m) => m.id));

  const updates: Record<string, unknown> = {
    [paths.finalsGradeMeta(tournamentId, gradeId)]: stripDeep(metaPayload),
  };
  for (const m of allMatches) {
    const { id, ...rest } = m;
    updates[paths.finalsMatch(tournamentId, gradeId, id)] = stripDeep(rest);
  }
  for (const id of existingMatchKeys) {
    if (!newMatchIds.has(id)) {
      updates[paths.finalsMatch(tournamentId, gradeId, id)] = null;
    }
  }
  await update(ref(getDb()), updates);
}

async function finalizeResurrectionMatchAndAdvance(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  match: FinalMatchData
): Promise<void> {
  const payload = stripDeep(match) as Record<string, unknown>;
  const matchPath = paths.resurrectionMatch(
    tournamentId,
    gradeId,
    group,
    match.id
  );
  if (!match.winnerTeamId || !match.nextMatchId) {
    await set(ref(getDb(), matchPath), payload);
    if (match.winnerTeamId && !match.nextMatchId) {
      await update(
        ref(getDb(), paths.resurrectionMeta(tournamentId, gradeId, group)),
        { completedWinnerTeamId: match.winnerTeamId }
      );
    }
    return;
  }
  const parentPath = paths.resurrectionMatch(
    tournamentId,
    gradeId,
    group,
    match.nextMatchId
  );
  const slot: "teamAId" | "teamBId" =
    match.slotInRound % 2 === 0 ? "teamAId" : "teamBId";
  await update(ref(getDb()), {
    [matchPath]: payload,
    [`${parentPath}/${slot}`]: match.winnerTeamId,
  });
}

export async function updateResurrectionSchedule(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  matchId: string,
  schedule: MatchSchedule | null
): Promise<void> {
  const r = ref(
    getDb(),
    paths.resurrectionMatch(tournamentId, gradeId, group, matchId)
  );
  if (schedule === null) {
    await update(r, { schedule: null });
  } else {
    await update(r, { schedule: stripDeep(schedule) });
  }
}

export async function submitResurrectionRegulation(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  current: FinalMatchData,
  round1: { scoreA: number; scoreB: number }
): Promise<void> {
  const regulation: RegulationScores = {
    round1,
    round2: { scoreA: 0, scoreB: 0 },
  };
  const r = ref(
    getDb(),
    paths.resurrectionMatch(tournamentId, gradeId, group, current.id)
  );
  const { snapshot } = await runTransaction(r, (curr) => {
    const base = (curr as FinalMatchData | null) ?? current;
    const updated = applyRegulationComplete(
      {
        ...base,
        id: current.id,
        gradeId: current.gradeId,
        roundIndex: current.roundIndex,
        slotInRound: current.slotInRound,
      },
      regulation
    );
    return stripDeep(updated) as Record<string, unknown>;
  });
  const updated = snapshot.val() as FinalMatchData;
  if (updated.status === "COMPLETED" && updated.winnerTeamId) {
    await finalizeResurrectionMatchAndAdvance(tournamentId, gradeId, group, updated);
  }
}

export async function submitResurrectionExtraEight(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  current: FinalMatchData,
  round: { scoreA: number; scoreB: number }
): Promise<void> {
  const r = ref(
    getDb(),
    paths.resurrectionMatch(tournamentId, gradeId, group, current.id)
  );
  const { snapshot } = await runTransaction(r, (curr) => {
    const base = (curr as FinalMatchData | null) ?? current;
    const updated = applyExtraEightComplete(base, round);
    return stripDeep(updated) as Record<string, unknown>;
  });
  const updated = snapshot.val() as FinalMatchData;
  if (updated.status === "COMPLETED" && updated.winnerTeamId) {
    await finalizeResurrectionMatchAndAdvance(tournamentId, gradeId, group, updated);
  }
}

export async function submitResurrectionSuddenDeathCloser(
  tournamentId: string,
  gradeId: string,
  group: ResurrectionPoolGroup,
  current: FinalMatchData,
  closer: Closer
): Promise<void> {
  const r = ref(
    getDb(),
    paths.resurrectionMatch(tournamentId, gradeId, group, current.id)
  );
  const { snapshot } = await runTransaction(r, (curr) => {
    const base = (curr as FinalMatchData | null) ?? current;
    const updated = applySuddenDeathCloser(base, closer);
    return stripDeep(updated) as Record<string, unknown>;
  });
  const updated = snapshot.val() as FinalMatchData;
  if (updated.status === "COMPLETED" && updated.winnerTeamId) {
    await finalizeResurrectionMatchAndAdvance(tournamentId, gradeId, group, updated);
  }
}

/**
 * When a final match is completed, advance winner into nextMatchId slot.
 */
export async function finalizeFinalMatchAndAdvance(
  tournamentId: string,
  gradeId: string,
  match: FinalMatchData
): Promise<void> {
  const payload = stripDeep(match) as Record<string, unknown>;
  if (!match.winnerTeamId || !match.nextMatchId) {
    await set(
      ref(getDb(), paths.finalsMatch(tournamentId, gradeId, match.id)),
      payload
    );
    await maybeSyncJapanCupChallengeAfterFinal(tournamentId, gradeId, match);
    return;
  }
  const parentPath = paths.finalsMatch(tournamentId, gradeId, match.nextMatchId);
  let slot: "teamAId" | "teamBId" =
    match.slotInRound % 2 === 0 ? "teamAId" : "teamBId";
  try {
    const parentSnap = await get(ref(getDb(), parentPath));
    const parent = parentSnap.val() as FinalMatchData | null;
    if (parent?.feedsFromA === match.id) slot = "teamAId";
    else if (parent?.feedsFromB === match.id) slot = "teamBId";
  } catch {
    // Fallback to legacy parity rule if parent cannot be read.
  }
  await update(ref(getDb()), {
    [paths.finalsMatch(tournamentId, gradeId, match.id)]: payload,
    [`${parentPath}/${slot}`]: match.winnerTeamId,
  });
  await maybeSyncJapanCupChallengeAfterFinal(tournamentId, gradeId, match);
}

export async function submitFinalRegulation(
  tournamentId: string,
  gradeId: string,
  current: FinalMatchData,
  regulation: RegulationScores
): Promise<void> {
  await assertJapanCupChallengeScoringAllowed(tournamentId, gradeId, current);
  const r = ref(getDb(), paths.finalsMatch(tournamentId, gradeId, current.id));
  const { snapshot } = await runTransaction(r, (curr) => {
    const base = (curr as FinalMatchData | null) ?? current;
    const updated = applyRegulationComplete(
      {
        ...base,
        id: current.id,
        gradeId: current.gradeId,
        roundIndex: current.roundIndex,
        slotInRound: current.slotInRound,
      },
      regulation
    );
    return stripDeep(updated) as Record<string, unknown>;
  });
  const updated = snapshot.val() as FinalMatchData;
  if (updated.status === "COMPLETED" && updated.winnerTeamId) {
    await finalizeFinalMatchAndAdvance(tournamentId, gradeId, updated);
  }
}

export async function submitFinalExtraEight(
  tournamentId: string,
  gradeId: string,
  current: FinalMatchData,
  round: { scoreA: number; scoreB: number }
): Promise<void> {
  await assertJapanCupChallengeScoringAllowed(tournamentId, gradeId, current);
  const r = ref(getDb(), paths.finalsMatch(tournamentId, gradeId, current.id));
  const { snapshot } = await runTransaction(r, (curr) => {
    const base = (curr as FinalMatchData | null) ?? current;
    const updated = applyExtraEightComplete(base, round);
    return stripDeep(updated) as Record<string, unknown>;
  });
  const updated = snapshot.val() as FinalMatchData;
  if (updated.status === "COMPLETED" && updated.winnerTeamId) {
    await finalizeFinalMatchAndAdvance(tournamentId, gradeId, updated);
  }
}

export async function submitSuddenDeathCloser(
  tournamentId: string,
  gradeId: string,
  current: FinalMatchData,
  closer: Closer
): Promise<void> {
  await assertJapanCupChallengeScoringAllowed(tournamentId, gradeId, current);
  const r = ref(getDb(), paths.finalsMatch(tournamentId, gradeId, current.id));
  const { snapshot } = await runTransaction(r, (curr) => {
    const base = (curr as FinalMatchData | null) ?? current;
    const updated = applySuddenDeathCloser(base, closer);
    return stripDeep(updated) as Record<string, unknown>;
  });
  const updated = snapshot.val() as FinalMatchData;
  if (updated.status === "COMPLETED" && updated.winnerTeamId) {
    await finalizeFinalMatchAndAdvance(tournamentId, gradeId, updated);
  }
}

export type BulkAddStudentRow = {
  line?: number;
  studentId: string;
  name: string;
  teamCodeOrId?: string;
  divisionId?: "A" | "B";
};

export type BulkAddStudentsResult = {
  saved: number;
  errors: Array<{ line?: number; studentId?: string; message: string }>;
};

export async function addStudent(
  tournamentId: string,
  studentId: string,
  student: StudentRecord,
  teams?: Record<string, TeamRecord> | null,
  resolveOptions?: ResolveTeamIdOptions
): Promise<void> {
  const payload: Record<string, unknown> = { name: student.name };
  if (student.teamId?.trim()) {
    let teamId = student.teamId.trim();
    if (teams) {
      const resolved = resolveTeamId(teams, teamId, resolveOptions);
      if (!resolved.ok) throw new Error(resolved.error);
      teamId = resolved.teamId;
    }
    payload.teamId = teamId;
  }
  await set(ref(getDb(), paths.student(tournamentId, studentId)), payload);
}

export async function bulkAddStudents(
  tournamentId: string,
  rows: BulkAddStudentRow[],
  teams: Record<string, TeamRecord>,
  resolveOptions?: ResolveTeamIdOptions
): Promise<BulkAddStudentsResult> {
  const updates: Record<string, unknown> = {};
  const errors: BulkAddStudentsResult["errors"] = [];
  let saved = 0;

  for (const row of rows) {
    const studentId = row.studentId.trim();
    const name = row.name.trim();
    if (!studentId || !name) {
      errors.push({
        line: row.line,
        studentId,
        message: "studentId and name are required.",
      });
      continue;
    }
    let teamId: string | undefined;
    if (row.teamCodeOrId?.trim()) {
      const resolved = resolveTeamId(teams, row.teamCodeOrId, {
        ...resolveOptions,
        divisionId: row.divisionId ?? resolveOptions?.divisionId,
      });
      if (!resolved.ok) {
        errors.push({
          line: row.line,
          studentId,
          message: resolved.error,
        });
        continue;
      }
      teamId = resolved.teamId;
    }
    const payload: Record<string, unknown> = { name };
    if (teamId) payload.teamId = teamId;
    updates[paths.student(tournamentId, studentId)] = payload;
    saved += 1;
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(getDb()), updates);
  }
  return { saved, errors };
}
