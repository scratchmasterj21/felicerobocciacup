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
} from "@/lib/tournament/bracketMatches";

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

export type QualifyingMode = "twoPools" | "unified";

/** Set once at tournament creation; not mutable via partial meta updates. */
export type TournamentKind = "intraSchool" | "interSchool";

export interface TournamentMeta {
  name: string;
  schoolYear: number;
  createdAt: number;
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
}

export interface StudentRecord {
  name: string;
  teamId?: string;
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

/** Remove all finals data for one grade (bracket + meta). */
export async function deleteFinalsForGrade(
  tournamentId: string,
  gradeId: string
): Promise<void> {
  await remove(ref(getDb(), paths.finalsGradeRoot(tournamentId, gradeId)));
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

export type GenerateFinalsOptions = {
  /** Append redemption champion per pool when generating main finals (K+1 seeds). */
  resurrectionWinnerByGroup?: Partial<Record<ResurrectionPoolGroup, string>>;
};

export async function generateFinalsForGrade(
  tournamentId: string,
  gradeId: string,
  seedsOrdered: string[] | { A: string[]; B: string[] },
  options?: GenerateFinalsOptions
): Promise<void> {
  const rw = options?.resurrectionWinnerByGroup;
  const mergedSeeds: string[] | { A: string[]; B: string[] } = Array.isArray(
    seedsOrdered
  )
    ? rw?.U
      ? [...seedsOrdered, rw.U]
      : seedsOrdered
    : {
        A: rw?.A ? [...seedsOrdered.A, rw.A] : seedsOrdered.A,
        B: rw?.B ? [...seedsOrdered.B, rw.B] : seedsOrdered.B,
      };
  const trees = Array.isArray(mergedSeeds)
    ? [buildFinalBracketMatchTree(gradeId, mergedSeeds, "U")]
    : [buildSplitFinalBracketWithGradeChampionship(gradeId, mergedSeeds.A, mergedSeeds.B)];
  const allMatches = trees.flat();
  const updates: Record<string, unknown> = {
    [paths.finalsGradeMeta(tournamentId, gradeId)]: stripDeep({
      generatedAt: Date.now(),
      seeds: mergedSeeds,
    }),
  };
  for (const m of allMatches) {
    const { id, ...rest } = m;
    updates[paths.finalsMatch(tournamentId, gradeId, id)] = stripDeep(rest);
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
}

export async function submitFinalRegulation(
  tournamentId: string,
  gradeId: string,
  current: FinalMatchData,
  regulation: RegulationScores
): Promise<void> {
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

export async function addStudent(
  tournamentId: string,
  studentId: string,
  student: StudentRecord
): Promise<void> {
  const payload: Record<string, unknown> = { name: student.name };
  if (student.teamId) payload.teamId = student.teamId;
  await set(ref(getDb(), paths.student(tournamentId, studentId)), payload);
}
