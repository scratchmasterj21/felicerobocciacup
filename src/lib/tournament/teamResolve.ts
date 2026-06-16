export type TeamCodeLookup = Record<
  string,
  { code?: string; name?: string; gradeId?: string; divisionId?: string }
>;

export type ResolveTeamIdOptions = {
  /** Prefer matches in this grade when a code/name is ambiguous. */
  gradeId?: string;
  divisionId?: "A" | "B";
};

export type ResolveTeamIdResult =
  | { ok: true; teamId: string }
  | { ok: false; error: string };

function filterMatches(
  ids: string[],
  teams: TeamCodeLookup,
  options?: ResolveTeamIdOptions
): string[] {
  let out = ids;
  if (options?.gradeId) {
    out = out.filter((id) => teams[id]?.gradeId === options.gradeId);
  }
  if (options?.divisionId) {
    out = out.filter((id) => teams[id]?.divisionId === options.divisionId);
  }
  return out;
}

export function describeTeamMatch(
  teamId: string,
  teams: TeamCodeLookup
): string {
  const t = teams[teamId];
  if (!t) return teamId;
  const parts = [t.name?.trim() || teamId];
  if (t.gradeId) parts.push(t.gradeId);
  if (t.divisionId) parts.push(`div ${t.divisionId}`);
  return parts.join(" · ");
}

function ambiguousError(
  kind: "code" | "name",
  input: string,
  matches: string[],
  teams: TeamCodeLookup,
  options?: ResolveTeamIdOptions
): ResolveTeamIdResult {
  const listed = matches.map((id) => describeTeamMatch(id, teams)).join("; ");
  const scope =
    options?.gradeId && options?.divisionId
      ? ` in ${options.gradeId} division ${options.divisionId}`
      : options?.gradeId
        ? ` in grade ${options.gradeId}`
        : "";
  const fix =
    kind === "code"
      ? "Give each team a unique code, add an optional division column (A/B) to CSV, or use the Firebase team id."
      : "Set a unique team code, add division column (A/B) to CSV, or use the Firebase team id.";
  return {
    ok: false,
    error: `Team ${kind} "${input}" matches multiple teams${scope}: ${listed}. ${fix}`,
  };
}

function resolveUnique(
  matches: string[],
  teams: TeamCodeLookup,
  options: ResolveTeamIdOptions | undefined,
  kind: "code" | "name",
  input: string
): ResolveTeamIdResult | null {
  if (matches.length === 1) {
    return { ok: true, teamId: matches[0] };
  }
  if (matches.length === 0) return null;
  const narrowed = filterMatches(matches, teams, options);
  if (narrowed.length === 1) {
    return { ok: true, teamId: narrowed[0] };
  }
  if (narrowed.length > 1) {
    return ambiguousError(kind, input, narrowed, teams, options);
  }
  return ambiguousError(kind, input, matches, teams, undefined);
}

/**
 * Resolve a team Firebase id, human `code`, or team `name` to the canonical team id.
 * Codes and names are matched case-insensitively (trimmed). Direct id match is tried first.
 */
export function resolveTeamId(
  teams: TeamCodeLookup | null | undefined,
  codeOrId: string,
  options?: ResolveTeamIdOptions
): ResolveTeamIdResult {
  const input = codeOrId.trim();
  if (!input) {
    return { ok: false, error: "Team code or id is required." };
  }
  if (!teams || Object.keys(teams).length === 0) {
    return { ok: false, error: "No teams in this tournament." };
  }
  if (teams[input]) {
    return { ok: true, teamId: input };
  }
  const needle = input.toLowerCase();
  const codeMatches: string[] = [];
  const nameMatches: string[] = [];
  for (const [id, t] of Object.entries(teams)) {
    const code = t.code?.trim();
    if (code && code.toLowerCase() === needle) {
      codeMatches.push(id);
    }
    const name = t.name?.trim();
    if (name && name.toLowerCase() === needle) {
      nameMatches.push(id);
    }
  }
  const fromCode = resolveUnique(codeMatches, teams, options, "code", input);
  if (fromCode) return fromCode;
  const fromName = resolveUnique(nameMatches, teams, options, "name", input);
  if (fromName) return fromName;

  const codes = listTeamCodes(teams, options?.gradeId);
  const hint =
    codes.length > 0
      ? ` Known codes${options?.gradeId ? ` in ${options.gradeId}` : ""}: ${codes.join(", ")}.`
      : " No team codes are set yet — add a code under Teams, or use the team name.";
  return {
    ok: false,
    error: `No team found for "${input}".${hint}`,
  };
}

/** Codes that appear on more than one team (case-insensitive). */
export function findDuplicateTeamCodes(
  teams: TeamCodeLookup | null | undefined
): Array<{ code: string; teamIds: string[] }> {
  if (!teams) return [];
  const byLower = new Map<string, string[]>();
  for (const [id, t] of Object.entries(teams)) {
    const code = t.code?.trim();
    if (!code) continue;
    const key = code.toLowerCase();
    const list = byLower.get(key) ?? [];
    list.push(id);
    byLower.set(key, list);
  }
  const out: Array<{ code: string; teamIds: string[] }> = [];
  for (const [key, teamIds] of byLower) {
    if (teamIds.length <= 1) continue;
    const display = teams[teamIds[0]]?.code?.trim() ?? key;
    out.push({ code: display, teamIds });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** Distinct non-empty team codes for admin hints. */
export function listTeamCodes(
  teams: TeamCodeLookup | null | undefined,
  gradeId?: string
): string[] {
  if (!teams) return [];
  const out = new Set<string>();
  for (const t of Object.values(teams)) {
    if (gradeId && t.gradeId !== gradeId) continue;
    const code = t.code?.trim();
    if (code) out.add(code);
  }
  return [...out].sort();
}

export function teamCodeById(
  teams: TeamCodeLookup | null | undefined,
  teamId: string | undefined
): string | undefined {
  if (!teamId || !teams) return undefined;
  return teams[teamId]?.code?.trim() || undefined;
}

export type ParsedStudentCsvRow = {
  line: number;
  studentId: string;
  name: string;
  teamCodeOrId: string;
  divisionId?: "A" | "B";
};

export type ParseStudentCsvResult =
  | { ok: true; rows: ParsedStudentCsvRow[] }
  | { ok: false; error: string };

function parseDivisionId(raw: string): "A" | "B" | undefined {
  const d = raw.trim().toUpperCase();
  if (d === "A" || d === "B") return d;
  return undefined;
}

/**
 * Parse CSV/TSV paste: studentId, name, teamCode [, divisionAorB] (header row optional).
 */
export function parseStudentCsvPaste(text: string): ParseStudentCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) {
    return { ok: false, error: "Paste at least one row (studentId, name, teamCode)." };
  }

  let start = 0;
  const firstCols = splitCsvLine(lines[0]);
  const headerLike =
    firstCols.length >= 2 &&
    /student|name|team/i.test(firstCols[0]) &&
    /name|team/i.test(firstCols[1] ?? "");
  if (headerLike) start = 1;

  const rows: ParsedStudentCsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 3) {
      return {
        ok: false,
        error: `Line ${i + 1}: expected studentId, name, teamCode (optional 4th: division A or B).`,
      };
    }
    const studentId = cols[0].trim();
    const name = cols[1].trim();
    const teamCodeOrId = cols[2].trim();
    const divisionRaw = cols[3]?.trim() ?? "";
    const divisionId = divisionRaw ? parseDivisionId(divisionRaw) : undefined;
    if (divisionRaw && !divisionId) {
      return {
        ok: false,
        error: `Line ${i + 1}: division must be A or B (got "${divisionRaw}").`,
      };
    }
    if (!studentId || !name || !teamCodeOrId) {
      return {
        ok: false,
        error: `Line ${i + 1}: studentId, name, and teamCode must be non-empty.`,
      };
    }
    rows.push({ line: i + 1, studentId, name, teamCodeOrId, divisionId });
  }

  if (rows.length === 0) {
    return { ok: false, error: "No data rows found." };
  }
  return { ok: true, rows };
}

function splitCsvLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((c) => c.trim());
  }
  return line.split(",").map((c) => c.trim());
}
