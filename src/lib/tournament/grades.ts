export const FELICE_CUP_GRADE_IDS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
export type FeliceCupGradeId = (typeof FELICE_CUP_GRADE_IDS)[number];

export const INTERSCHOOL_GRADE_ID = "IS" as const;
export type InterschoolGradeId = typeof INTERSCHOOL_GRADE_ID;

export type TournamentKind = "intraSchool" | "interSchool" | "practice";

export type GradeMeta = {
  tournamentKind?: TournamentKind;
  divisionLabelA?: string;
  divisionLabelB?: string;
} | null | undefined;

export function isFeliceCupGradeId(id: string): id is FeliceCupGradeId {
  return (FELICE_CUP_GRADE_IDS as readonly string[]).includes(id);
}

export function isInterschoolGradeId(id: string): id is InterschoolGradeId {
  return id === INTERSCHOOL_GRADE_ID;
}

export function isInterSchoolTournament(meta: GradeMeta): boolean {
  return meta?.tournamentKind === "interSchool";
}

export function isPracticeTournament(meta: GradeMeta): boolean {
  return meta?.tournamentKind === "practice";
}

export function workingGradesForTournament(meta: GradeMeta): readonly string[] {
  return isInterSchoolTournament(meta) ? [INTERSCHOOL_GRADE_ID] : FELICE_CUP_GRADE_IDS;
}

export function defaultWorkingGrade(meta: GradeMeta): string {
  return isInterSchoolTournament(meta) ? INTERSCHOOL_GRADE_ID : "G1";
}

export function gradeLabel(id: string, _meta?: GradeMeta): string {
  if (id === INTERSCHOOL_GRADE_ID) return "Interschool";
  return id;
}

/** Resolve working grade for admin/viewer when meta kind and current selection disagree. */
export function normalizeWorkingGrade(meta: GradeMeta, current: string): string {
  const allowed = workingGradesForTournament(meta);
  if ((allowed as readonly string[]).includes(current)) return current;
  return defaultWorkingGrade(meta);
}
