export const VIEWER_GRADES = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
export type ViewerGradeId = (typeof VIEWER_GRADES)[number];

export function viewerGradeFromParam(value: string | null): ViewerGradeId | null {
  if (value && (VIEWER_GRADES as readonly string[]).includes(value)) {
    return value as ViewerGradeId;
  }
  return null;
}

function truthyParam(v: string | null): boolean {
  if (v == null) return false;
  const x = v.toLowerCase();
  return v === "1" || x === "true" || x === "yes";
}

/**
 * Live view URL flags: `?display=1`, `?kiosk=1`, `?grade=G3` (with optional `tournamentId=`).
 */
export function parseViewerDisplayParams(search: string) {
  const p = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  return {
    display: truthyParam(p.get("display")),
    kiosk: truthyParam(p.get("kiosk")),
    grade: viewerGradeFromParam(p.get("grade")),
  };
}
