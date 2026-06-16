import { FormEvent, useMemo, useState } from "react";
import type { FairPlayIncident } from "@/lib/tournament/types";
import type { StudentRecord, TeamRecord, TournamentMeta } from "@/lib/firebase/tournamentService";
import {
  adjustFairPlayPoints,
  deleteFairPlayIncident,
  initializeFairPlayForAllTeams,
  initializeFairPlayForTeam,
} from "@/lib/firebase/fairPlayService";
import { FairPlayIncidentForm } from "@/components/FairPlayIncidentForm";
import { FairPlayBandBadge } from "@/components/FairPlayBandBadge";
import {
  fairPlayCategoryLabel,
  isFairPlayLockedForGrade,
  japanCupEligibleForStudent,
  studentsOnTeam,
  sumFairPlayForTeam,
} from "@/lib/tournament/fairPlay";
import { divisionLabel } from "@/lib/tournament/divisionLabels";
import { formatScheduleTokyo } from "@/lib/schedule/tokyo";
import { getFirebaseAuth } from "@/lib/firebase/config";
import {
  buildTeamDisplayNameById,
  schoolShortByIdFromRecord,
} from "@/lib/tournament/teamDisplay";

export function FairPlayAdminSection({
  tournamentId,
  meta,
  teams,
  students,
  incidents,
  workingGrade,
  finalsGradeMeta,
  schools,
}: {
  tournamentId: string;
  meta: TournamentMeta | null;
  teams: Record<string, TeamRecord> | null;
  students: Record<string, StudentRecord> | null;
  incidents: Record<string, FairPlayIncident> | null;
  workingGrade: string;
  finalsGradeMeta: { generatedAt?: number } | null;
  schools: Record<string, { name: string; shortLabel?: string }> | null;
}) {
  const [historyTeamId, setHistoryTeamId] = useState("");
  const [initTeamId, setInitTeamId] = useState("");
  const [adjTeamId, setAdjTeamId] = useState("");
  const [adjStudentId, setAdjStudentId] = useState("");
  const [adjDelta, setAdjDelta] = useState("");
  const [adjTeacher, setAdjTeacher] = useState("");
  const [adjNotes, setAdjNotes] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);
  const [initBusy, setInitBusy] = useState(false);
  const [initTeamBusy, setInitTeamBusy] = useState(false);
  const [deletingIncidentId, setDeletingIncidentId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [japanCupCopied, setJapanCupCopied] = useState(false);

  const teamMap = teams ?? {};
  const studentMap = students ?? {};
  const gradeLocked = isFairPlayLockedForGrade(finalsGradeMeta);

  const schoolShortById = useMemo(
    () => schoolShortByIdFromRecord(schools),
    [schools]
  );
  const nameById = useMemo(() => {
    const list = Object.entries(teamMap).map(([id, t]) => ({ id, ...t }));
    return buildTeamDisplayNameById(list, schoolShortById);
  }, [teamMap, schoolShortById]);

  const teamsInGrade = useMemo(
    () =>
      Object.entries(teamMap)
        .filter(([, t]) => t.gradeId === workingGrade)
        .map(([id, t]) => ({ id, ...t }))
        .sort((a, b) =>
          `${a.divisionId}-${a.name}`.localeCompare(`${b.divisionId}-${b.name}`)
        ),
    [teamMap, workingGrade]
  );

  const studentsInGrade = useMemo(() => {
    const teamIds = new Set(teamsInGrade.map((t) => t.id));
    return Object.entries(studentMap)
      .filter(([, s]) => s.teamId && teamIds.has(s.teamId))
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => {
        const ta = teamMap[a.teamId ?? ""]?.name ?? "";
        const tb = teamMap[b.teamId ?? ""]?.name ?? "";
        return `${ta}-${a.name}`.localeCompare(`${tb}-${b.name}`);
      });
  }, [studentMap, teamsInGrade, teamMap]);

  const japanCupEligibleList = useMemo(
    () =>
      studentsInGrade.filter((s) =>
        japanCupEligibleForStudent(s, gradeLocked)
      ),
    [studentsInGrade, gradeLocked]
  );

  const incidentList = useMemo(() => {
    const all = Object.values(incidents ?? {});
    const filtered = historyTeamId
      ? all.filter((i) => i.teamId === historyTeamId)
      : all.filter((i) => teamMap[i.teamId]?.gradeId === workingGrade);
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [incidents, historyTeamId, teamMap, workingGrade]);

  const rosterForAdj = useMemo(() => {
    if (!adjTeamId) return [];
    return studentsOnTeam(studentMap, adjTeamId);
  }, [studentMap, adjTeamId]);

  const historyRoster = useMemo(() => {
    if (!historyTeamId) return [];
    return studentsOnTeam(studentMap, historyTeamId);
  }, [studentMap, historyTeamId]);

  const teamFairPlaySum = historyTeamId
    ? sumFairPlayForTeam(studentMap, historyTeamId)
    : 0;

  async function onInitializeAll() {
    setInitBusy(true);
    setStatus(null);
    try {
      const n = await initializeFairPlayForAllTeams(tournamentId);
      setStatus(
        n > 0
          ? `Split 15 Fair Play points across rosters for ${n} team(s).`
          : "All teams with rosters are already initialized."
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Initialize failed.");
    } finally {
      setInitBusy(false);
    }
  }

  async function onInitializeTeam() {
    if (!initTeamId) {
      setStatus("Select a team to initialize.");
      return;
    }
    setInitTeamBusy(true);
    setStatus(null);
    try {
      const n = await initializeFairPlayForTeam(tournamentId, initTeamId);
      setStatus(`Initialized Fair Play for ${n} student(s) on this team.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Initialize failed.");
    } finally {
      setInitTeamBusy(false);
    }
  }

  async function onDeleteIncident(inc: FairPlayIncident) {
    const reversal = -inc.delta;
    const reversalLabel =
      reversal > 0 ? `+${reversal}` : reversal === 0 ? "0" : String(reversal);
    const kindLabel = inc.kind === "adjustment" ? "adjustment" : "incident";
    if (
      !window.confirm(
        `Remove this ${kindLabel} for ${inc.studentName}? Student balance will change by ${reversalLabel} pts.`
      )
    ) {
      return;
    }
    setDeletingIncidentId(inc.id);
    setStatus(null);
    try {
      await deleteFairPlayIncident(tournamentId, inc.id);
      setStatus(`Removed ${kindLabel}; points reversed (${reversalLabel}).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not remove entry.");
    } finally {
      setDeletingIncidentId(null);
    }
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    const delta = Number(adjDelta);
    if (!adjTeamId || !adjStudentId || !Number.isFinite(delta) || delta === 0) {
      setStatus("Select team, student, and a non-zero adjustment (+/−).");
      return;
    }
    const user = getFirebaseAuth().currentUser;
    const teacher =
      adjTeacher.trim() || user?.displayName || user?.email || "Admin";
    setAdjBusy(true);
    setStatus(null);
    try {
      await adjustFairPlayPoints(tournamentId, {
        teamId: adjTeamId,
        studentId: adjStudentId,
        delta,
        teacherName: teacher,
        notes: adjNotes,
      });
      setStatus("Adjustment saved.");
      setAdjDelta("");
      setAdjNotes("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Adjustment failed.");
    } finally {
      setAdjBusy(false);
    }
  }

  function copyJapanCupList() {
    const lines = japanCupEligibleList.map((s) => {
      const team = s.teamId ? nameById.get(s.teamId) ?? s.teamId : "—";
      return `${s.name}\t${team}\t${s.id}`;
    });
    const text = lines.length
      ? `Japan Cup eligible — ${workingGrade}\n${lines.join("\n")}`
      : `No eligible students for ${workingGrade}.`;
    void navigator.clipboard.writeText(text).then(() => setJapanCupCopied(true));
    setTimeout(() => setJapanCupCopied(false), 2000);
  }

  return (
    <section className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Fair Play</h2>
          <p className="text-xs text-cup-muted mt-1 max-w-2xl">
            Within-school · preliminary only. Each team&apos;s 15 points are split across
            students. Team standing uses the <strong>sum</strong> of student balances. Japan
            Cup: students need &gt; 0 points at lock (when finals bracket is generated).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={initBusy || gradeLocked}
            onClick={() => void onInitializeAll()}
            className="px-3 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white disabled:opacity-50"
          >
            Initialize all teams
          </button>
        </div>
      </div>

      {gradeLocked ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          Fair Play locked for <strong>{workingGrade}</strong> — finals bracket generated.
          Incidents disabled. Japan Cup eligibility finalized.
        </p>
      ) : null}

      {status ? (
        <p className="text-sm text-cup-ink bg-cup-paper/80 border border-cup-line rounded-lg px-3 py-2">
          {status}
        </p>
      ) : null}

      <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Initialize one team</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs text-cup-muted">
            <span>Team ({workingGrade})</span>
            <select
              className="border border-cup-line rounded-md px-2 py-1.5 bg-white text-sm min-w-[14rem]"
              value={initTeamId}
              disabled={gradeLocked}
              onChange={(e) => setInitTeamId(e.target.value)}
            >
              <option value="">Select…</option>
              {teamsInGrade.map((t) => (
                <option key={t.id} value={t.id}>
                  {divisionLabel(meta, t.divisionId)} · {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={initTeamBusy || gradeLocked || !initTeamId}
            onClick={() => void onInitializeTeam()}
            className="px-3 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white disabled:opacity-50"
          >
            Split 15 pts across roster
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold">Log incident</h3>
        <FairPlayIncidentForm
          tournamentId={tournamentId}
          teams={teamMap}
          students={students}
          meta={meta}
          defaultGrade={workingGrade}
          compact
          fairPlayLocked={gradeLocked}
        />
      </div>

      <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2 items-center">
          <h3 className="text-sm font-semibold">
            Japan Cup eligible — {workingGrade}
            {gradeLocked ? " (locked)" : " (live)"}
          </h3>
          <button
            type="button"
            onClick={copyJapanCupList}
            className="px-3 py-1.5 rounded-lg border border-cup-line text-xs font-medium bg-white"
          >
            {japanCupCopied ? "Copied!" : "Copy list"}
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto border border-cup-line rounded-lg bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-cup-ink/5 text-cup-muted uppercase tracking-wide">
              <tr>
                <th className="px-2 py-1.5 text-left">Student</th>
                <th className="px-2 py-1.5 text-left">Team</th>
                <th className="px-2 py-1.5 text-right">Pts</th>
                <th className="px-2 py-1.5 text-left">Japan Cup</th>
              </tr>
            </thead>
            <tbody>
              {studentsInGrade.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-3 text-cup-muted">
                    No students linked to teams in this grade.
                  </td>
                </tr>
              ) : (
                studentsInGrade.map((s) => {
                  const eligible = japanCupEligibleForStudent(s, gradeLocked);
                  return (
                    <tr key={s.id} className="border-t border-cup-line">
                      <td className="px-2 py-1.5 font-medium">{s.name}</td>
                      <td className="px-2 py-1.5 text-cup-muted">
                        {s.teamId ? nameById.get(s.teamId) ?? s.teamId : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {typeof s.fairPlayInitialShare === "number" ? (
                          <FairPlayBandBadge
                            points={s.fairPlayPoints ?? 0}
                            initialShare={s.fairPlayInitialShare}
                          />
                        ) : (
                          <span className="text-cup-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {typeof s.fairPlayInitialShare !== "number" ? (
                          <span className="text-cup-muted">Not initialized</span>
                        ) : eligible ? (
                          <span className="text-cup-win font-medium">Eligible</span>
                        ) : (
                          <span className="text-red-700 font-medium">Not eligible</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-cup-muted">
          Showing all students in grade; eligible list has {japanCupEligibleList.length}{" "}
          student(s).
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Team history</h3>
          <label className="flex flex-col gap-1 text-xs text-cup-muted">
            <span>Team ({workingGrade})</span>
            <select
              className="border border-cup-line rounded-md px-2 py-1.5 bg-white text-sm"
              value={historyTeamId}
              onChange={(e) => setHistoryTeamId(e.target.value)}
            >
              <option value="">Select team…</option>
              {teamsInGrade.map((t) => (
                <option key={t.id} value={t.id}>
                  {divisionLabel(meta, t.divisionId)} · {t.name}
                </option>
              ))}
            </select>
          </label>
          {historyTeamId ? (
            <div className="text-sm space-y-2 border border-cup-line rounded-lg px-3 py-2 bg-white">
              <p>
                Team total:{" "}
                <FairPlayBandBadge points={teamFairPlaySum} />
                <span className="text-cup-muted text-xs ml-1">(sum of students)</span>
              </p>
              {historyRoster.length > 0 ? (
                <ul className="text-xs space-y-1 border-t border-cup-line pt-2">
                  {historyRoster.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>{studentMap[s.id]?.name ?? s.id}</span>
                      {typeof s.fairPlayInitialShare === "number" ? (
                        <FairPlayBandBadge
                          points={s.fairPlayPoints ?? 0}
                          initialShare={s.fairPlayInitialShare}
                        />
                      ) : (
                        <span className="text-cup-muted">not init</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-cup-muted">No students on this team.</p>
              )}
            </div>
          ) : null}
          <div className="max-h-64 overflow-y-auto border border-cup-line rounded-lg bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-cup-ink/5 text-cup-muted uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-1.5 text-left">When</th>
                  <th className="px-2 py-1.5 text-left">Team / student</th>
                  <th className="px-2 py-1.5 text-left">Category</th>
                  <th className="px-2 py-1.5 text-right">Δ</th>
                  {!gradeLocked ? (
                    <th className="px-2 py-1.5 text-right"> </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {incidentList.length === 0 ? (
                  <tr>
                    <td colSpan={gradeLocked ? 4 : 5} className="px-2 py-3 text-cup-muted">
                      No incidents yet.
                    </td>
                  </tr>
                ) : (
                  incidentList.slice(0, 50).map((i) => (
                    <tr key={i.id} className="border-t border-cup-line">
                      <td className="px-2 py-1.5 whitespace-nowrap text-cup-muted">
                        {formatScheduleTokyo(i.createdAt, {})}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">
                          {teamMap[i.teamId]?.name ?? i.teamId}
                        </div>
                        {i.kind === "incident" || i.studentName !== "—" ? (
                          <div className="text-cup-muted">{i.studentName}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5">{fairPlayCategoryLabel(i.category)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {i.delta > 0 ? `+${i.delta}` : i.delta}
                      </td>
                      {!gradeLocked ? (
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            disabled={deletingIncidentId === i.id}
                            onClick={() => void onDeleteIncident(i)}
                            className="text-xs text-red-700 hover:underline disabled:opacity-50"
                          >
                            {deletingIncidentId === i.id ? "Removing…" : "Remove"}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Manual adjustment (student)</h3>
          {gradeLocked ? (
            <p className="text-xs text-cup-muted">Locked for this grade.</p>
          ) : (
            <form onSubmit={(e) => void onAdjust(e)} className="space-y-3 text-sm">
              <label className="flex flex-col gap-1 text-xs text-cup-muted">
                <span>Team</span>
                <select
                  className="border border-cup-line rounded-md px-2 py-1.5 bg-white"
                  value={adjTeamId}
                  onChange={(e) => {
                    setAdjTeamId(e.target.value);
                    setAdjStudentId("");
                  }}
                >
                  <option value="">Select…</option>
                  {teamsInGrade.map((t) => (
                    <option key={t.id} value={t.id}>
                      {divisionLabel(meta, t.divisionId)} · {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-cup-muted">
                <span>Student</span>
                <select
                  className="border border-cup-line rounded-md px-2 py-1.5 bg-white"
                  value={adjStudentId}
                  disabled={!adjTeamId}
                  onChange={(e) => setAdjStudentId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {rosterForAdj.map((s) => (
                    <option key={s.id} value={s.id}>
                      {studentMap[s.id]?.name ?? s.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-cup-muted">
                <span>Delta (+ add / − deduct)</span>
                <input
                  type="number"
                  className="border border-cup-line rounded-md px-2 py-1.5 bg-white w-28"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                  placeholder="e.g. -2 or 1"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-cup-muted">
                <span>Teacher / admin name</span>
                <input
                  className="border border-cup-line rounded-md px-2 py-1.5 bg-white"
                  value={adjTeacher}
                  onChange={(e) => setAdjTeacher(e.target.value)}
                  placeholder="Defaults to signed-in user"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-cup-muted">
                <span>Notes (required)</span>
                <textarea
                  className="border border-cup-line rounded-md px-2 py-1.5 bg-white min-h-[4rem]"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={adjBusy}
                className="px-4 py-2 rounded-lg bg-cup-ink text-cup-paper text-sm font-medium disabled:opacity-50"
              >
                {adjBusy ? "Saving…" : "Apply adjustment"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
