import { FormEvent, useEffect, useMemo, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/config";
import type { StudentRecord, TeamRecord } from "@/lib/firebase/tournamentService";
import { recordFairPlayIncident, subscribeFinalsGradeMeta } from "@/lib/firebase/fairPlayService";
import {
  FAIR_PLAY_CATEGORIES,
  defaultDeductionForCategory,
  isFairPlayLockedForGrade,
  type FairPlayCategoryKey,
} from "@/lib/tournament/fairPlay";
import { divisionLabel } from "@/lib/tournament/divisionLabels";
import { FELICE_CUP_GRADE_IDS } from "@/lib/tournament/grades";

export function FairPlayIncidentForm({
  tournamentId,
  teams,
  students,
  meta,
  defaultGrade,
  onSuccess,
  compact,
  fairPlayLocked,
}: {
  tournamentId: string;
  teams: Record<string, TeamRecord>;
  students: Record<string, StudentRecord> | null;
  meta: {
    divisionLabelA?: string;
    divisionLabelB?: string;
  } | null;
  defaultGrade?: string;
  onSuccess?: () => void;
  compact?: boolean;
  fairPlayLocked?: boolean;
}) {
  const [grade, setGrade] = useState(defaultGrade ?? "G1");
  const [teamId, setTeamId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState<FairPlayCategoryKey>(FAIR_PLAY_CATEGORIES[0].key);
  const [deductionOverride, setDeductionOverride] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gradeLockedLocal, setGradeLockedLocal] = useState(false);

  const locked = fairPlayLocked ?? gradeLockedLocal;

  useEffect(() => {
    if (fairPlayLocked !== undefined) return;
    return subscribeFinalsGradeMeta(tournamentId, grade, (m) =>
      setGradeLockedLocal(isFairPlayLockedForGrade(m))
    );
  }, [tournamentId, grade, fairPlayLocked]);

  useEffect(() => {
    const user = getFirebaseAuth().currentUser;
    if (user?.displayName) setTeacherName(user.displayName);
    else if (user?.email) setTeacherName(user.email);
  }, []);

  useEffect(() => {
    if (defaultGrade) setGrade(defaultGrade);
  }, [defaultGrade]);

  const teamsInGrade = useMemo(
    () =>
      Object.entries(teams)
        .map(([id, t]) => ({ id, ...t }))
        .filter((t) => t.gradeId === grade)
        .sort((a, b) =>
          `${a.divisionId}-${a.name}`.localeCompare(`${b.divisionId}-${b.name}`)
        ),
    [teams, grade]
  );

  const studentsForTeam = useMemo(() => {
    if (!students || !teamId) return [];
    return Object.entries(students)
      .filter(([, s]) => s.teamId === teamId)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, teamId]);

  const selectedStudent = studentsForTeam.find((s) => s.id === studentId);
  const studentInitialized =
    typeof selectedStudent?.fairPlayInitialShare === "number";

  const defaultDeduction = defaultDeductionForCategory(category);
  const formDisabled = locked || busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (locked) {
      setError("Fair Play is locked for this grade (finals generated).");
      return;
    }
    if (!teamId) {
      setError("Select a team.");
      return;
    }
    if (!studentId) {
      setError("Select a student on this team.");
      return;
    }
    if (!studentInitialized) {
      setError("Fair Play not initialized for this student. Ask admin to initialize the team.");
      return;
    }
    if (!teacherName.trim()) {
      setError("Enter teacher name.");
      return;
    }
    const overrideTrim = deductionOverride.trim();
    const deduction = overrideTrim
      ? Number(overrideTrim)
      : defaultDeduction;
    if (!Number.isFinite(deduction) || deduction <= 0) {
      setError("Deduction must be a positive number.");
      return;
    }
    setBusy(true);
    try {
      await recordFairPlayIncident(tournamentId, {
        teamId,
        studentId,
        teacherName: teacherName.trim(),
        category,
        deduction,
        notes: notes.trim() || undefined,
      });
      setMessage("Incident recorded.");
      setNotes("");
      setDeductionOverride("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record incident.");
    } finally {
      setBusy(false);
    }
  }

  const labelClass = compact ? "text-xs text-cup-muted" : "text-sm text-cup-muted";
  const inputClass = compact
    ? "border border-cup-line rounded-md px-2 py-1.5 bg-white text-sm"
    : "border border-cup-line rounded-md px-3 py-2 bg-white text-sm";

  if (locked) {
    return (
      <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Fair Play is locked for this grade — preliminary phase ended when the finals bracket was
        generated. No new incidents can be logged.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <label className={`flex flex-col gap-1 ${labelClass}`}>
          <span>Grade</span>
          <select
            className={inputClass}
            value={grade}
            disabled={formDisabled}
            onChange={(e) => {
              setGrade(e.target.value);
              setTeamId("");
              setStudentId("");
            }}
          >
            {FELICE_CUP_GRADE_IDS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex flex-col gap-1 min-w-[12rem] ${labelClass}`}>
          <span>Team</span>
          <select
            className={inputClass}
            value={teamId}
            disabled={formDisabled}
            onChange={(e) => {
              setTeamId(e.target.value);
              setStudentId("");
            }}
          >
            <option value="">Select team…</option>
            {teamsInGrade.map((t) => (
              <option key={t.id} value={t.id}>
                {divisionLabel(meta, t.divisionId)} · {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex flex-col gap-1 min-w-[12rem] ${labelClass}`}>
          <span>Student</span>
          <select
            className={inputClass}
            value={studentId}
            disabled={formDisabled || !teamId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Select student…</option>
            {studentsForTeam.map((s) => {
              const pts = s.fairPlayPoints;
              const share = s.fairPlayInitialShare;
              const label =
                typeof share === "number" && typeof pts === "number"
                  ? `${s.name} (${pts}/${share})`
                  : typeof share === "number"
                    ? `${s.name} (not initialized)`
                    : s.name;
              return (
                <option key={s.id} value={s.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      {teamId && studentsForTeam.length === 0 ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No students registered for this team. Ask an admin to add students in the
          Students section before logging incidents.
        </p>
      ) : null}
      {selectedStudent && !studentInitialized ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Fair Play not initialized for this team. Ask admin to run Initialize for this team.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 items-end">
        <label className={`flex flex-col gap-1 min-w-[14rem] flex-1 ${labelClass}`}>
          <span>Incident type</span>
          <select
            className={inputClass}
            value={category}
            disabled={formDisabled}
            onChange={(e) => setCategory(e.target.value as FairPlayCategoryKey)}
          >
            {FAIR_PLAY_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} (−{c.defaultDeduction})
              </option>
            ))}
          </select>
        </label>
        <label className={`flex flex-col gap-1 w-24 ${labelClass}`}>
          <span>Override pts</span>
          <input
            type="number"
            min={1}
            className={inputClass}
            disabled={formDisabled}
            placeholder={String(defaultDeduction)}
            value={deductionOverride}
            onChange={(e) => setDeductionOverride(e.target.value)}
          />
        </label>
        <label className={`flex flex-col gap-1 min-w-[10rem] flex-1 ${labelClass}`}>
          <span>Teacher name</span>
          <input
            className={inputClass}
            value={teacherName}
            disabled={formDisabled}
            onChange={(e) => setTeacherName(e.target.value)}
            required
          />
        </label>
      </div>
      <label className={`flex flex-col gap-1 ${labelClass}`}>
        <span>Notes (optional)</span>
        <textarea
          className={`${inputClass} min-h-[4rem]`}
          value={notes}
          disabled={formDisabled}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-cup-win font-medium">{message}</p> : null}
      <button
        type="submit"
        disabled={
          formDisabled ||
          !teamId ||
          !studentId ||
          studentsForTeam.length === 0 ||
          !studentInitialized
        }
        className="px-4 py-2 rounded-lg bg-cup-accent text-white text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Saving…" : "Submit incident"}
      </button>
    </form>
  );
}
