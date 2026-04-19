import type { SchoolRecord } from "@/lib/firebase/tournamentService";

export function schoolShortByIdFromRecord(
  schools: Record<string, SchoolRecord> | null | undefined
): Map<string, string> {
  const m = new Map<string, string>();
  if (!schools) return m;
  for (const [id, s] of Object.entries(schools)) {
    const short = s.shortLabel?.trim();
    m.set(id, short || s.name.trim() || id);
  }
  return m;
}

export function teamDisplayName(
  team: { name: string; schoolId?: string },
  schoolShortById: Map<string, string>
): string {
  if (!team.schoolId) return team.name;
  const sh = schoolShortById.get(team.schoolId);
  return sh ? `${sh} · ${team.name}` : team.name;
}

export function buildTeamDisplayNameById(
  teamList: Array<{ id: string; name: string; schoolId?: string }>,
  schoolShortById: Map<string, string>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of teamList) {
    out.set(t.id, teamDisplayName(t, schoolShortById));
  }
  return out;
}
