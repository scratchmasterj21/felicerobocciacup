/** Points: win=3, draw=1, loss=0 */
export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;
export const POINTS_LOSS = 0;

export type DivisionId = "A" | "B";

export interface Team {
  id: string;
  gradeId: string;
  divisionId: DivisionId;
  name: string;
  code?: string;
  /** Optional link to `tournaments/.../schools/{schoolId}` for multi-school events. */
  schoolId?: string;
}

/** Regulation: 2 rounds × 8 min (stored as two score pairs). */
export interface RegulationScores {
  round1: { scoreA: number; scoreB: number };
  round2: { scoreA: number; scoreB: number };
}

export type QualifyingOutcome = "WIN_A" | "WIN_B" | "DRAW";

/** Optional per-match schedule (omit entirely when unset; never store null). */
export interface MatchSchedule {
  /** Unix ms UTC instant (interpreted for display in Asia/Tokyo). */
  startAt: number;
  durationRegulationMinutes?: number;
  court?: string;
}

export interface QualifyingMatchData {
  id: string;
  gradeId: string;
  divisionId: DivisionId;
  /** Optional league bucket when a division is split (L1/L2). */
  leagueId?: "L1" | "L2";
  round: number;
  teamAId: string;
  teamBId: string;
  status: "SCHEDULED" | "COMPLETED";
  regulation?: RegulationScores;
  /** Present when COMPLETED */
  outcome?: QualifyingOutcome;
  schedule?: MatchSchedule;
}

/**
 * Practice match: per-class internal game (e.g. G1A teams vs each other).
 * Mirrors `QualifyingMatchData` scoring (preliminary style, draws allowed) plus
 * a display `order`. Not part of real qualification/standings/finals.
 */
export interface PracticeMatchData {
  id: string;
  gradeId: string;
  divisionId: DivisionId;
  /** Display order within the practice list ("Match #"). */
  order: number;
  teamAId: string;
  teamBId: string;
  status: "SCHEDULED" | "COMPLETED";
  regulation?: RegulationScores;
  /** Present when COMPLETED. */
  outcome?: QualifyingOutcome;
  createdAt?: number;
}

export interface StandingRow {
  teamId: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  leaguePoints: number;
  /** Present when Fair Play is enabled for the tournament. */
  fairPlayPoints?: number;
  /** leaguePoints + fairPlayPoints when Fair Play is enabled. */
  totalScore?: number;
}

export type FairPlayIncidentKind = "incident" | "adjustment";

export interface FairPlayIncident {
  id: string;
  teamId: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  category: string;
  /** Positive magnitude for display (deduction amount). */
  deduction: number;
  /** Net change applied to team (negative deduct, positive credit). */
  delta: number;
  notes?: string;
  createdAt: number;
  createdByUid?: string;
  kind: FairPlayIncidentKind;
}

export type Closer = "A" | "B" | "TIE";

export interface SuddenDeathState {
  status: "IN_PROGRESS" | "COMPLETED";
  cycleIndex: number;
  cycles?: Record<string, { closer: Closer }>;
}

export interface ExtraEightState {
  status: "IN_PROGRESS" | "COMPLETED";
  /** Single 8-minute round (one score pair). */
  round?: { scoreA: number; scoreB: number };
  tiedAfterExtra?: boolean;
}

export type FinalMatchStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED";

/** Resurrection bracket pool key (mirrors finals division bucket). */
export type ResurrectionPoolGroup = "A" | "B" | "U";

export interface ResurrectionMeta {
  generatedAt: number;
  entrantTeamIds: string[];
  /** Set when bracket completes or single entrant auto-wins. */
  completedWinnerTeamId?: string;
}

export interface FinalMatchData {
  id: string;
  gradeId: string;
  /** Finals bracket bucket within a grade: A, B, or unified. */
  bracketGroup?: "A" | "B" | "U";
  /** When set, this match uses resurrection scoring (3 min regulation path). */
  matchKind?: "resurrection" | "japanCupChallenge";
  roundIndex: number;
  slotInRound: number;
  teamAId?: string;
  teamBId?: string;
  status: FinalMatchStatus;
  /** Regulation scoring (same shape as qualifying). */
  regulation?: RegulationScores;
  extra8min?: ExtraEightState;
  suddenDeath?: SuddenDeathState;
  winnerTeamId?: string;
  nextMatchId?: string;
  /** Source: winner of match ids feeding this slot (optional denormalization). */
  feedsFromA?: string;
  feedsFromB?: string;
  schedule?: MatchSchedule;
}

export interface BracketSlot {
  kind: "team" | "bye";
  teamId?: string;
}

export interface GeneratedFirstRound {
  bracketSize: number;
  matches: Array<{
    matchIndex: number;
    slotA: BracketSlot;
    slotB: BracketSlot;
  }>;
}
