import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { FairPlayIncidentForm } from "@/components/FairPlayIncidentForm";
import { useTournamentId } from "@/hooks/useTournamentId";
import {
  subscribeTeams,
  subscribeTournamentMeta,
  type TournamentMeta,
} from "@/lib/firebase/tournamentService";
import { subscribeStudents } from "@/lib/firebase/fairPlayService";
import type { StudentRecord, TeamRecord } from "@/lib/firebase/tournamentService";
import { isFairPlayEnabled } from "@/lib/tournament/fairPlay";
import { ADMIN_APP_BASE_PATH } from "@/lib/auth/admin";
import { getFirebaseAuth } from "@/lib/firebase/config";

function FairPlayTeacherContent() {
  const [searchParams] = useSearchParams();
  const [, setGlobalTournamentId] = useTournamentId();
  const tournamentId =
    searchParams.get("tournamentId")?.trim() ||
    import.meta.env.VITE_DEFAULT_TOURNAMENT_ID ||
    "";

  useEffect(() => {
    if (tournamentId) setGlobalTournamentId(tournamentId);
  }, [tournamentId, setGlobalTournamentId]);

  const [meta, setMeta] = useState<TournamentMeta | null>(null);
  const [teams, setTeams] = useState<Record<string, TeamRecord> | null>(null);
  const [students, setStudents] = useState<Record<string, StudentRecord> | null>(null);

  useEffect(() => {
    if (!tournamentId) return;
    return subscribeTournamentMeta(tournamentId, setMeta);
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    return subscribeTeams(tournamentId, setTeams);
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    return subscribeStudents(tournamentId, setStudents);
  }, [tournamentId]);

  const fairPlayOn = useMemo(() => isFairPlayEnabled(meta), [meta]);
  const studentCount = useMemo(
    () => Object.keys(students ?? {}).length,
    [students]
  );

  if (!tournamentId) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <p className="text-sm text-cup-muted">
          Add <code className="font-mono">?tournamentId=…</code> to the URL.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-6">
      <header className="flex flex-wrap justify-between gap-4 items-start border-b border-cup-line pb-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-cup-muted font-semibold">
            Fair Play · Teachers
          </p>
          <h1 className="font-display text-2xl font-semibold text-cup-ink mt-1">
            {meta?.name ?? "Tournament"}
          </h1>
          {meta && Number.isFinite(meta.schoolYear) ? (
            <p className="text-sm text-cup-muted tabular-nums">{meta.schoolYear}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`${ADMIN_APP_BASE_PATH}?tournamentId=${encodeURIComponent(tournamentId)}`}
            className="px-3 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white"
          >
            Admin
          </Link>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white"
            onClick={() => signOut(getFirebaseAuth())}
          >
            Sign out
          </button>
        </div>
      </header>

      {!fairPlayOn ? (
        <p className="text-sm text-cup-ink border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
          Fair Play is disabled for school-vs-school tournaments. This event is not
          eligible.
        </p>
      ) : (
        <>
          <p className="text-sm text-cup-muted leading-relaxed">
            Log behavior incidents for your team. Each team&apos;s 15 points are split across
            students. Deductions apply to the selected student only; team standing uses the sum.
            Preliminary phase only — locked when finals are generated.
          </p>
          {studentCount === 0 ? (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              No students are registered yet. Ask an admin to add students (linked to
              teams) before you can submit incidents.
            </p>
          ) : null}
          {teams ? (
            <div className="rounded-xl border border-cup-line bg-white p-5 shadow-sm">
              <FairPlayIncidentForm
                tournamentId={tournamentId}
                teams={teams}
                students={students}
                meta={meta}
              />
            </div>
          ) : (
            <p className="text-sm text-cup-muted">Loading teams…</p>
          )}
        </>
      )}
    </div>
  );
}

export function FairPlayTeacherPage() {
  return (
    <RequireAuth>
      <FairPlayTeacherContent />
    </RequireAuth>
  );
}
