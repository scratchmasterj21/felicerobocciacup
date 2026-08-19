type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function teamNames(data: JsonRecord): Map<string, string> {
  return new Map(
    Object.entries(record(data.teams)).map(([id, value]) => [
      id,
      String(record(value).name ?? id),
    ])
  );
}

export function createTeamsCsv(data: JsonRecord): string {
  const schools = record(data.schools);
  const rows: unknown[][] = [["teamId", "name", "code", "grade", "pool", "school", "fairPlayPoints"]];
  for (const [id, value] of Object.entries(record(data.teams))) {
    const team = record(value);
    const school = record(schools[String(team.schoolId ?? "")]);
    rows.push([id, team.name, team.code, team.gradeId, team.divisionId, school.shortLabel ?? school.name, team.fairPlayPoints]);
  }
  return csv(rows);
}

function score(match: JsonRecord): string {
  const regulation = record(match.regulation);
  const r1 = record(regulation.round1);
  const r2 = record(regulation.round2);
  if (!match.regulation) return "";
  return `${Number(r1.scoreA ?? 0) + Number(r2.scoreA ?? 0)}-${Number(r1.scoreB ?? 0) + Number(r2.scoreB ?? 0)}`;
}

function collectMatches(data: JsonRecord): Array<{ stage: string; group: string; id: string; match: JsonRecord }> {
  const out: Array<{ stage: string; group: string; id: string; match: JsonRecord }> = [];
  for (const [id, value] of Object.entries(record(record(data.qualifying).matches))) out.push({ stage: "Preliminary", group: String(record(value).divisionId ?? ""), id, match: record(value) });
  for (const [grade, gradeValue] of Object.entries(record(data.finals))) {
    for (const [id, value] of Object.entries(record(record(gradeValue).matches))) out.push({ stage: "Finals", group: grade, id, match: record(value) });
  }
  for (const [grade, gradeValue] of Object.entries(record(data.resurrection))) {
    for (const [group, groupValue] of Object.entries(record(gradeValue))) {
      for (const [id, value] of Object.entries(record(record(groupValue).matches))) out.push({ stage: "Redemption", group: `${grade}-${group}`, id, match: record(value) });
    }
  }
  return out;
}

export function createMatchesCsv(data: JsonRecord): string {
  const names = teamNames(data);
  const rows: unknown[][] = [["stage", "group", "matchId", "teamA", "teamB", "status", "score", "winner", "startAt", "court"]];
  for (const item of collectMatches(data)) {
    const schedule = record(item.match.schedule);
    rows.push([item.stage, item.group, item.id, names.get(String(item.match.teamAId)) ?? item.match.teamAId, names.get(String(item.match.teamBId)) ?? item.match.teamBId, item.match.status, score(item.match), names.get(String(item.match.winnerTeamId)) ?? item.match.winnerTeamId, schedule.startAt ? new Date(Number(schedule.startAt)).toISOString() : "", schedule.court]);
  }
  return csv(rows);
}

export function createPrintableResultsHtml(data: JsonRecord): string {
  const meta = record(data.meta);
  const names = teamNames(data);
  const rows = collectMatches(data).map((item) => `<tr><td>${html(item.stage)}</td><td>${html(item.group)}</td><td>${html(names.get(String(item.match.teamAId)) ?? item.match.teamAId ?? "TBD")}</td><td>${html(names.get(String(item.match.teamBId)) ?? item.match.teamBId ?? "TBD")}</td><td>${html(score(item.match) || item.match.status)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${html(meta.name ?? "Tournament")} results</title><style>body{font:14px system-ui;margin:32px;color:#17202a}h1{margin-bottom:4px}p{color:#667085}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #d0d5dd;padding:8px;text-align:left}th{background:#f2f4f7}@media print{body{margin:12mm}}</style></head><body><h1>${html(meta.name ?? "Tournament results")}</h1><p>${html(meta.schoolYear ?? "")} · Generated ${html(new Date().toLocaleString())}</p><table><thead><tr><th>Stage</th><th>Group</th><th>Team A</th><th>Team B</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`;
}
