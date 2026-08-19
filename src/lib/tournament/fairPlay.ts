export const FAIR_PLAY_INITIAL = 15;
export const FAIR_PLAY_MAX = 15;
export const FAIR_PLAY_MIN = 0;

export type FairPlayBand = "green" | "yellow" | "red";

export type FairPlayIncidentKind = "incident" | "adjustment";

export const FAIR_PLAY_CATEGORY_MANUAL = "manual_adjustment";

export const FAIR_PLAY_CATEGORIES = [
  { key: "not_following_instructions", label: "Not following instructions", defaultDeduction: 1 },
  { key: "disrupting_class", label: "Disrupting class", defaultDeduction: 1 },
  { key: "poor_sportsmanship", label: "Poor sportsmanship", defaultDeduction: 2 },
  { key: "arguing", label: "Arguing", defaultDeduction: 2 },
  { key: "disrespectful_language", label: "Disrespectful language", defaultDeduction: 3 },
  { key: "repeated_misconduct", label: "Repeated misconduct", defaultDeduction: 5 },
] as const;

export type FairPlayCategoryKey = (typeof FAIR_PLAY_CATEGORIES)[number]["key"];

export type FairPlayStudentSlice = {
  points: number;
  initialShare: number;
};

export type FairPlayStudentFields = {
  fairPlayPoints?: number;
  fairPlayInitialShare?: number;
  japanCupEligible?: boolean;
};

export function isFairPlayEnabled(
  meta:
    | { tournamentKind?: "intraSchool" | "interSchool" | "practice" }
    | null
    | undefined
): boolean {
  return (
    meta?.tournamentKind !== "interSchool" &&
    meta?.tournamentKind !== "practice"
  );
}

export function fairPlayPointsOrDefault(value: number | undefined | null): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return FAIR_PLAY_INITIAL;
}

export function clampFairPlayPoints(points: number): number {
  return Math.min(FAIR_PLAY_MAX, Math.max(FAIR_PLAY_MIN, Math.round(points)));
}

/** Clamp a student's balance to 0..their starting share. */
export function clampStudentFairPlayPoints(
  points: number,
  initialShare: number
): number {
  const max = Math.max(0, Math.round(initialShare));
  return Math.min(max, Math.max(FAIR_PLAY_MIN, Math.round(points)));
}

/** Undo a logged incident/adjustment by reversing its delta. */
export function reverseFairPlayDelta(
  current: number,
  incidentDelta: number,
  initialShare: number
): number {
  return clampStudentFairPlayPoints(current - incidentDelta, initialShare);
}

export function fairPlayBand(points: number): FairPlayBand {
  if (points >= 13) return "green";
  if (points >= 8) return "yellow";
  return "red";
}

/** Band relative to a student's starting share (e.g. 5 → green at 4+). */
export function fairPlayBandForShare(
  points: number,
  initialShare: number
): FairPlayBand {
  const share = Math.max(1, Math.round(initialShare));
  const ratio = points / share;
  if (ratio >= 0.8) return "green";
  if (ratio >= 0.5) return "yellow";
  return "red";
}

export function fairPlayCategoryLabel(categoryKey: string): string {
  if (categoryKey === FAIR_PLAY_CATEGORY_MANUAL) return "Manual adjustment";
  const found = FAIR_PLAY_CATEGORIES.find((c) => c.key === categoryKey);
  return found?.label ?? categoryKey;
}

export function defaultDeductionForCategory(categoryKey: string): number {
  const found = FAIR_PLAY_CATEGORIES.find((c) => c.key === categoryKey);
  return found?.defaultDeduction ?? 1;
}

export function isJapanCupEligible(points: number | undefined | null): boolean {
  return typeof points === "number" && Number.isFinite(points) && points > 0;
}

export function isFairPlayLockedForGrade(
  finalsGradeMeta: { generatedAt?: number } | null | undefined
): boolean {
  return typeof finalsGradeMeta?.generatedAt === "number";
}

/** Give every student the same personal Fair Play balance. */
export function splitFairPlayPool(teamStudentIds: string[]): Map<string, FairPlayStudentSlice> {
  const sorted = [...teamStudentIds].sort((a, b) => a.localeCompare(b));
  const result = new Map<string, FairPlayStudentSlice>();
  for (const studentId of sorted) {
    result.set(studentId, {
      points: FAIR_PLAY_INITIAL,
      initialShare: FAIR_PLAY_INITIAL,
    });
  }
  return result;
}

export function studentsOnTeam(
  students: Record<string, FairPlayStudentFields & { teamId?: string }> | null | undefined,
  teamId: string
): Array<{ id: string } & FairPlayStudentFields> {
  if (!students) return [];
  return Object.entries(students)
    .filter(([, s]) => s.teamId === teamId)
    .map(([id, s]) => ({ id, ...s }));
}

export function teamHasInitializedFairPlay(
  students: Record<string, FairPlayStudentFields & { teamId?: string }> | null | undefined,
  teamId: string
): boolean {
  const roster = studentsOnTeam(students, teamId);
  if (roster.length === 0) return false;
  return roster.every(
    (s) =>
      typeof s.fairPlayInitialShare === "number" &&
      Number.isFinite(s.fairPlayInitialShare) &&
      typeof s.fairPlayPoints === "number" &&
      Number.isFinite(s.fairPlayPoints)
  );
}

export function sumFairPlayForTeam(
  students: Record<string, FairPlayStudentFields & { teamId?: string }> | null | undefined,
  teamId: string
): number {
  const roster = studentsOnTeam(students, teamId);
  if (roster.length === 0) return 0;
  if (teamHasInitializedFairPlay(students, teamId)) {
    return roster.reduce((sum, s) => sum + (s.fairPlayPoints ?? 0), 0);
  }
  return 0;
}

/**
 * Percentage of the roster's remaining personal Fair Play points.
 * Using a percentage keeps teams with different roster sizes comparable.
 */
export function fairPlayPercentageForTeam(
  students: Record<string, FairPlayStudentFields & { teamId?: string }> | null | undefined,
  teamId: string
): number {
  const roster = studentsOnTeam(students, teamId);
  if (roster.length === 0 || !teamHasInitializedFairPlay(students, teamId)) return 100;
  const current = roster.reduce((sum, s) => sum + (s.fairPlayPoints ?? 0), 0);
  const maximum = roster.reduce(
    (sum, s) => sum + Math.max(0, s.fairPlayInitialShare ?? 0),
    0
  );
  if (maximum <= 0) return 100;
  return Math.round((current / maximum) * 1000) / 10;
}

export function buildFairPlayByTeamIdFromStudents(
  students: Record<string, FairPlayStudentFields & { teamId?: string }> | null | undefined,
  teamIds: string[],
  teams?: Record<string, { fairPlayPoints?: number }> | null | undefined
): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of teamIds) {
    if (teamHasInitializedFairPlay(students, id)) {
      m.set(id, fairPlayPercentageForTeam(students, id));
    } else {
      // Legacy team-only values represented a 15-point pool. Convert them to a rate.
      const legacy = fairPlayPointsOrDefault(teams?.[id]?.fairPlayPoints);
      const rate = Math.round((legacy / FAIR_PLAY_INITIAL) * 1000) / 10;
      m.set(id, Math.min(100, Math.max(0, rate)));
    }
  }
  return m;
}

/** @deprecated Use buildFairPlayByTeamIdFromStudents */
export function buildFairPlayByTeamId(
  teams: Record<string, { fairPlayPoints?: number }> | null | undefined,
  teamIds: string[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of teamIds) {
    m.set(id, fairPlayPointsOrDefault(teams?.[id]?.fairPlayPoints));
  }
  return m;
}

export function rankStandingsFairPlayOptions(
  students: Record<string, FairPlayStudentFields & { teamId?: string }> | null | undefined,
  teamIds: string[],
  enabled: boolean,
  teams?: Record<string, { fairPlayPoints?: number }> | null | undefined
) {
  if (!enabled) return undefined;
  return {
    fairPlayByTeamId: buildFairPlayByTeamIdFromStudents(students, teamIds, teams),
  };
}

export function japanCupEligibleForStudent(
  student: FairPlayStudentFields,
  gradeLocked: boolean
): boolean {
  if (gradeLocked && typeof student.japanCupEligible === "boolean") {
    return student.japanCupEligible;
  }
  return isJapanCupEligible(student.fairPlayPoints);
}
