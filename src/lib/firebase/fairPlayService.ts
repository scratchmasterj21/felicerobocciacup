import { get, push, ref, update, onValue, type Unsubscribe } from "firebase/database";
import type { FairPlayIncident } from "@/lib/tournament/types";
import type {
  StudentRecord,
  TeamRecord,
  TournamentMeta,
} from "@/lib/firebase/tournamentService";
import { paths } from "@/lib/firebase/schema";
import { getDb, getFirebaseAuth } from "@/lib/firebase/config";
import {
  FAIR_PLAY_CATEGORY_MANUAL,
  clampStudentFairPlayPoints,
  isFairPlayEnabled,
  isFairPlayLockedForGrade,
  isJapanCupEligible,
  reverseFairPlayDelta,
  splitFairPlayPool,
  studentsOnTeam,
  sumFairPlayForTeam,
  teamHasInitializedFairPlay,
} from "@/lib/tournament/fairPlay";

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

export function subscribeStudents(
  tournamentId: string,
  cb: (students: Record<string, StudentRecord> | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.students(tournamentId));
  return onValue(r, (snap) => {
    cb(snap.val() as Record<string, StudentRecord> | null);
  });
}

export function subscribeFairPlayIncidents(
  tournamentId: string,
  cb: (incidents: Record<string, FairPlayIncident> | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.fairPlayIncidents(tournamentId));
  return onValue(r, (snap) => {
    cb(snap.val() as Record<string, FairPlayIncident> | null);
  });
}

import type { FinalsGradeMeta } from "@/lib/tournament/japanCupChallenge";

export function subscribeFinalsGradeMeta(
  tournamentId: string,
  gradeId: string,
  cb: (meta: FinalsGradeMeta | null) => void
): Unsubscribe {
  const r = ref(getDb(), paths.finalsGradeMeta(tournamentId, gradeId));
  return onValue(r, (snap) => {
    cb(snap.val() as FinalsGradeMeta | null);
  });
}

async function loadMeta(tournamentId: string): Promise<TournamentMeta | null> {
  const snap = await get(ref(getDb(), paths.tournamentMeta(tournamentId)));
  return snap.val() as TournamentMeta | null;
}

async function loadTeam(
  tournamentId: string,
  teamId: string
): Promise<TeamRecord | null> {
  const snap = await get(ref(getDb(), paths.team(tournamentId, teamId)));
  return snap.val() as TeamRecord | null;
}

async function loadStudent(
  tournamentId: string,
  studentId: string
): Promise<StudentRecord | null> {
  const snap = await get(ref(getDb(), paths.student(tournamentId, studentId)));
  return snap.val() as StudentRecord | null;
}

async function loadAllStudents(
  tournamentId: string
): Promise<Record<string, StudentRecord> | null> {
  const snap = await get(ref(getDb(), paths.students(tournamentId)));
  return snap.val() as Record<string, StudentRecord> | null;
}

async function loadFinalsGradeMeta(
  tournamentId: string,
  gradeId: string
): Promise<{ generatedAt?: number } | null> {
  const snap = await get(ref(getDb(), paths.finalsGradeMeta(tournamentId, gradeId)));
  return snap.val() as { generatedAt?: number } | null;
}

async function assertFairPlayTournament(tournamentId: string): Promise<TournamentMeta> {
  const meta = await loadMeta(tournamentId);
  if (!meta) throw new Error("Tournament meta not found.");
  if (!isFairPlayEnabled(meta)) {
    throw new Error("Fair Play is only available for within-school tournaments.");
  }
  return meta;
}

async function assertFairPlayUnlockedForTeam(
  tournamentId: string,
  team: TeamRecord
): Promise<void> {
  const finalsMeta = await loadFinalsGradeMeta(tournamentId, team.gradeId);
  if (isFairPlayLockedForGrade(finalsMeta)) {
    throw new Error(
      `Fair Play is locked for ${team.gradeId} (finals bracket generated).`
    );
  }
}

function teamFairPlaySumUpdates(
  tournamentId: string,
  teamId: string,
  students: Record<string, StudentRecord> | null
): Record<string, unknown> {
  const sum = sumFairPlayForTeam(students, teamId);
  return { [`${paths.team(tournamentId, teamId)}/fairPlayPoints`]: sum };
}

export async function initializeFairPlayForTeam(
  tournamentId: string,
  teamId: string
): Promise<number> {
  await assertFairPlayTournament(tournamentId);
  const team = await loadTeam(tournamentId, teamId);
  if (!team) throw new Error("Team not found.");
  const students = await loadAllStudents(tournamentId);
  const roster = studentsOnTeam(students, teamId);
  if (roster.length === 0) {
    throw new Error("No students on this team. Register students with teamId first.");
  }
  const split = splitFairPlayPool(roster.map((s) => s.id));
  const updates: Record<string, unknown> = {};
  for (const [studentId, slice] of split) {
    updates[`${paths.student(tournamentId, studentId)}/fairPlayPoints`] = slice.points;
    updates[`${paths.student(tournamentId, studentId)}/fairPlayInitialShare`] =
      slice.initialShare;
    updates[`${paths.student(tournamentId, studentId)}/japanCupEligible`] = null;
  }
  Object.assign(updates, teamFairPlaySumUpdates(tournamentId, teamId, students));
  for (const [studentId, slice] of split) {
    if (students?.[studentId]) {
      students[studentId] = {
        ...students[studentId],
        fairPlayPoints: slice.points,
        fairPlayInitialShare: slice.initialShare,
      };
    }
  }
  updates[`${paths.team(tournamentId, teamId)}/fairPlayPoints`] = sumFairPlayForTeam(
    students,
    teamId
  );
  await update(ref(getDb()), updates);
  return roster.length;
}

export async function initializeFairPlayForAllTeams(
  tournamentId: string
): Promise<number> {
  await assertFairPlayTournament(tournamentId);
  const [teamsSnap, students] = await Promise.all([
    get(ref(getDb(), paths.teams(tournamentId))),
    loadAllStudents(tournamentId),
  ]);
  const teams = teamsSnap.val() as Record<string, TeamRecord> | null;
  if (!teams) return 0;
  let teamCount = 0;
  for (const teamId of Object.keys(teams)) {
    if (teamHasInitializedFairPlay(students, teamId)) continue;
    const roster = studentsOnTeam(students, teamId);
    if (roster.length === 0) continue;
    await initializeFairPlayForTeam(tournamentId, teamId);
    teamCount += 1;
  }
  return teamCount;
}

export async function snapshotJapanCupEligibilityForGrade(
  tournamentId: string,
  gradeId: string
): Promise<number> {
  const [teamsSnap, students] = await Promise.all([
    get(ref(getDb(), paths.teams(tournamentId))),
    loadAllStudents(tournamentId),
  ]);
  const teams = teamsSnap.val() as Record<string, TeamRecord> | null;
  if (!teams || !students) return 0;
  const updates: Record<string, unknown> = {};
  let count = 0;
  for (const [studentId, student] of Object.entries(students)) {
    if (!student.teamId) continue;
    const team = teams[student.teamId];
    if (!team || team.gradeId !== gradeId) continue;
    const eligible = isJapanCupEligible(student.fairPlayPoints);
    updates[`${paths.student(tournamentId, studentId)}/japanCupEligible`] = eligible;
    count += 1;
  }
  if (count > 0) await update(ref(getDb()), updates);
  return count;
}

export interface RecordFairPlayIncidentInput {
  teamId: string;
  studentId: string;
  teacherName: string;
  category: string;
  deduction: number;
  notes?: string;
}

export async function recordFairPlayIncident(
  tournamentId: string,
  input: RecordFairPlayIncidentInput
): Promise<string> {
  await assertFairPlayTournament(tournamentId);
  const team = await loadTeam(tournamentId, input.teamId);
  if (!team) throw new Error("Team not found.");
  await assertFairPlayUnlockedForTeam(tournamentId, team);
  const student = await loadStudent(tournamentId, input.studentId);
  if (!student) throw new Error("Student not found.");
  if (student.teamId !== input.teamId) {
    throw new Error("Student is not on the selected team.");
  }
  if (typeof student.fairPlayInitialShare !== "number") {
    throw new Error(
      "Fair Play not initialized for this student. Ask admin to initialize the team."
    );
  }
  const deduction = Math.round(input.deduction);
  if (!Number.isFinite(deduction) || deduction <= 0) {
    throw new Error("Deduction must be a positive number.");
  }
  const delta = -deduction;
  const current = student.fairPlayPoints ?? student.fairPlayInitialShare;
  const next = clampStudentFairPlayPoints(
    current + delta,
    student.fairPlayInitialShare
  );
  const incidentRef = push(ref(getDb(), paths.fairPlayIncidents(tournamentId)));
  const id = incidentRef.key;
  if (!id) throw new Error("Failed to create incident id.");
  const uid = getFirebaseAuth().currentUser?.uid;
  const incident: FairPlayIncident = {
    id,
    teamId: input.teamId,
    studentId: input.studentId,
    studentName: student.name,
    teacherName: input.teacherName.trim(),
    category: input.category,
    deduction,
    delta,
    kind: "incident",
    createdAt: Date.now(),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(uid ? { createdByUid: uid } : {}),
  };
  const students = await loadAllStudents(tournamentId);
  const updates: Record<string, unknown> = {
    [paths.fairPlayIncident(tournamentId, id)]: stripDeep(incident),
    [`${paths.student(tournamentId, input.studentId)}/fairPlayPoints`]: next,
  };
  if (students?.[input.studentId]) {
    students[input.studentId] = { ...students[input.studentId], fairPlayPoints: next };
  }
  Object.assign(updates, teamFairPlaySumUpdates(tournamentId, input.teamId, students));
  await update(ref(getDb()), updates);
  return id;
}

export interface AdjustFairPlayInput {
  teamId: string;
  studentId: string;
  delta: number;
  teacherName: string;
  notes: string;
}

export async function adjustFairPlayPoints(
  tournamentId: string,
  input: AdjustFairPlayInput
): Promise<string> {
  await assertFairPlayTournament(tournamentId);
  const team = await loadTeam(tournamentId, input.teamId);
  if (!team) throw new Error("Team not found.");
  await assertFairPlayUnlockedForTeam(tournamentId, team);
  if (!input.studentId.trim()) {
    throw new Error("Select a student for manual adjustment.");
  }
  const student = await loadStudent(tournamentId, input.studentId);
  if (!student) throw new Error("Student not found.");
  if (student.teamId !== input.teamId) {
    throw new Error("Student is not on the selected team.");
  }
  if (typeof student.fairPlayInitialShare !== "number") {
    throw new Error("Fair Play not initialized for this student.");
  }
  const delta = Math.round(input.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("Adjustment must be a non-zero number.");
  }
  const notes = input.notes.trim();
  if (!notes) throw new Error("Notes are required for manual adjustments.");
  const current = student.fairPlayPoints ?? student.fairPlayInitialShare;
  const next = clampStudentFairPlayPoints(
    current + delta,
    student.fairPlayInitialShare
  );
  const incidentRef = push(ref(getDb(), paths.fairPlayIncidents(tournamentId)));
  const id = incidentRef.key;
  if (!id) throw new Error("Failed to create incident id.");
  const uid = getFirebaseAuth().currentUser?.uid;
  const deduction = Math.abs(delta);
  const incident: FairPlayIncident = {
    id,
    teamId: input.teamId,
    studentId: input.studentId,
    studentName: student.name,
    teacherName: input.teacherName.trim(),
    category: FAIR_PLAY_CATEGORY_MANUAL,
    deduction,
    delta,
    notes,
    kind: "adjustment",
    createdAt: Date.now(),
    ...(uid ? { createdByUid: uid } : {}),
  };
  const students = await loadAllStudents(tournamentId);
  const updates: Record<string, unknown> = {
    [paths.fairPlayIncident(tournamentId, id)]: stripDeep(incident),
    [`${paths.student(tournamentId, input.studentId)}/fairPlayPoints`]: next,
  };
  if (students?.[input.studentId]) {
    students[input.studentId] = { ...students[input.studentId], fairPlayPoints: next };
  }
  Object.assign(updates, teamFairPlaySumUpdates(tournamentId, input.teamId, students));
  await update(ref(getDb()), updates);
  return id;
}

export async function deleteFairPlayIncident(
  tournamentId: string,
  incidentId: string
): Promise<void> {
  await assertFairPlayTournament(tournamentId);
  const snap = await get(
    ref(getDb(), paths.fairPlayIncident(tournamentId, incidentId))
  );
  const incident = snap.val() as FairPlayIncident | null;
  if (!incident) throw new Error("Incident not found.");
  const team = await loadTeam(tournamentId, incident.teamId);
  if (!team) throw new Error("Team not found.");
  await assertFairPlayUnlockedForTeam(tournamentId, team);

  const updates: Record<string, unknown> = {
    [paths.fairPlayIncident(tournamentId, incidentId)]: null,
  };

  const student = await loadStudent(tournamentId, incident.studentId);
  const students = await loadAllStudents(tournamentId);
  if (student && typeof student.fairPlayInitialShare === "number") {
    const current = student.fairPlayPoints ?? student.fairPlayInitialShare;
    const next = reverseFairPlayDelta(
      current,
      incident.delta,
      student.fairPlayInitialShare
    );
    updates[`${paths.student(tournamentId, incident.studentId)}/fairPlayPoints`] =
      next;
    if (students?.[incident.studentId]) {
      students[incident.studentId] = {
        ...students[incident.studentId],
        fairPlayPoints: next,
      };
    }
    Object.assign(
      updates,
      teamFairPlaySumUpdates(tournamentId, incident.teamId, students)
    );
  }

  await update(ref(getDb()), updates);
}
