import { readStoredTournamentId } from "@/hooks/useTournamentId";

export const VIEWER_GRADES = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
export type ViewerGradeId = (typeof VIEWER_GRADES)[number];

export function viewerGradeFromParam(value: string | null): ViewerGradeId | null {
  if (value && (VIEWER_GRADES as readonly string[]).includes(value)) {
    return value as ViewerGradeId;
  }
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

/** Build the public live view path for a grade and tournament. */
export function buildLiveViewHref(
  tournamentId: string,
  grade: string
): string {
  const p = new URLSearchParams();
  if (tournamentId.trim()) p.set("tournamentId", tournamentId.trim());
  p.set("grade", grade);
  return `/?${p.toString()}`;
}

/** Live view link using stored/env tournament id and a default grade. */
export function buildDefaultLiveViewHref(grade = "G1"): string {
  return buildLiveViewHref(readStoredTournamentId(), grade);
}
