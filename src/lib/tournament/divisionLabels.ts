/** Human label for qualifying pool A or B (Option 2: custom labels on tournament meta). */
export function divisionLabel(
  meta:
    | { divisionLabelA?: string; divisionLabelB?: string }
    | null
    | undefined,
  divisionId: "A" | "B"
): string {
  const raw =
    divisionId === "A" ? meta?.divisionLabelA : meta?.divisionLabelB;
  const t = raw?.trim();
  if (t) return t;
  return `League ${divisionId}`;
}
