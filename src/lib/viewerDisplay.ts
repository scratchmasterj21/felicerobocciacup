import { readStoredTournamentId } from "@/hooks/useTournamentId";
import {
  FELICE_CUP_GRADE_IDS,
  INTERSCHOOL_GRADE_ID,
  isFeliceCupGradeId,
  isInterschoolGradeId,
} from "@/lib/tournament/grades";

/** @deprecated Prefer FELICE_CUP_GRADE_IDS from grades.ts */
export const VIEWER_GRADES = FELICE_CUP_GRADE_IDS;
export type ViewerGradeId = (typeof FELICE_CUP_GRADE_IDS)[number];

export function viewerGradeFromParam(value: string | null): string | null {
  if (value && isFeliceCupGradeId(value)) return value;
  if (value === INTERSCHOOL_GRADE_ID) return INTERSCHOOL_GRADE_ID;
  return null;
}

/**
 * Live view URL query params: `?tournamentId=cup2026&grade=G3`.
 * Legacy `display` / `kiosk` params are ignored (live view is always broadcast styling).
 */
export function parseViewerDisplayParams(search: string) {
  const p = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  return {
    grade: viewerGradeFromParam(p.get("grade")),
  };
}

/** Felice Cup live view: `/?tournamentId=…&grade=G3`. */
export function buildFeliceCupLiveViewHref(
  tournamentId: string,
  grade: string
): string {
  const p = new URLSearchParams();
  if (tournamentId.trim()) p.set("tournamentId", tournamentId.trim());
  p.set("grade", grade);
  return `/?${p.toString()}`;
}

/** Interschool live view: `/interschool?tournamentId=…` (grade IS implied). */
export function buildInterschoolLiveViewHref(tournamentId: string): string {
  const p = new URLSearchParams();
  if (tournamentId.trim()) p.set("tournamentId", tournamentId.trim());
  return `/interschool?${p.toString()}`;
}

/** Practice live view: `/practice?tournamentId=…` (all classes shown). */
export function buildPracticeLiveViewHref(tournamentId: string): string {
  const p = new URLSearchParams();
  if (tournamentId.trim()) p.set("tournamentId", tournamentId.trim());
  return `/practice?${p.toString()}`;
}

/** Build the public live view path for a grade and tournament. */
export function buildLiveViewHref(
  tournamentId: string,
  grade: string
): string {
  if (isInterschoolGradeId(grade)) {
    return buildInterschoolLiveViewHref(tournamentId);
  }
  return buildFeliceCupLiveViewHref(tournamentId, grade);
}

/** Live view link using stored/env tournament id and a default grade. */
export function buildDefaultLiveViewHref(grade = "G1"): string {
  return buildLiveViewHref(readStoredTournamentId(), grade);
}

/** Absolute URL for admin copy (includes origin when in browser). */
export function absoluteLiveViewUrl(pathWithQuery: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`;
  }
  return pathWithQuery;
}
