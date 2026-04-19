import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTournamentId } from "@/hooks/useTournamentId";
import {
  getDivisionLeagueCount,
  getQualifyingLeagueAssignment,
  subscribeFinalMatches,
  subscribeQualifyingMatches,
  subscribeResurrectionMatches,
  subscribeResurrectionMeta,
  subscribeSchools,
  subscribeTeams,
  subscribeTournamentMeta,
} from "@/lib/firebase/tournamentService";
import type {
  FinalMatchData,
  QualifyingMatchData,
  ResurrectionMeta,
} from "@/lib/tournament/types";
import { compareFinalByRoundThenScheduleThenSlot } from "@/lib/schedule/matchSort";
import { rankStandings } from "@/lib/tournament/standings";
import { regulationTotals } from "@/lib/tournament/roundRobin";
import { StandingsTable } from "@/components/StandingsTable";
import { QualifyingScheduleList } from "@/components/QualifyingScheduleList";
import { divisionLabel } from "@/lib/tournament/divisionLabels";
import {
  buildTeamDisplayNameById,
  schoolShortByIdFromRecord,
} from "@/lib/tournament/teamDisplay";
import type { LeagueId } from "@/lib/tournament/leagueSplit";
import {
  effectiveLeagueCount,
  partitionTeamsIntoLeaguesFromSaved,
} from "@/lib/tournament/leagueSplit";

function finalMatchesForTeam(teamId: string, matches: FinalMatchData[]) {
  return matches.filter(
    (m) =>
      m.teamAId === teamId ||
      m.teamBId === teamId ||
      m.winnerTeamId === teamId
  );
}

function formatFinalMatchLine(
  m: FinalMatchData,
  teamId: string,
  nameById: Map<string, string>
): string {
  const opp =
    m.teamAId === teamId
      ? m.teamBId
      : m.teamBId === teamId
        ? m.teamAId
        : undefined;
  const oppLabel = opp ? nameById.get(opp) ?? opp : "—";
  const reg = m.regulation ? regulationTotals(m.regulation) : null;
  const score =
    reg != null ? `${reg.totalA}–${reg.totalB}` : m.status === "COMPLETED" ? "Final" : "Scheduled";
  let wl = "";
  if (m.status === "COMPLETED" && m.winnerTeamId) {
    if (m.winnerTeamId === teamId) wl = " (W)";
    else if (m.teamAId === teamId || m.teamBId === teamId) wl = " (L)";
  }
  return `${m.id} vs ${oppLabel} · ${score}${wl}`;
}

export function TeamViewerPage() {
  const { tournamentId: tidParam, teamId: teamIdParam } = useParams<{
    tournamentId: string;
    teamId: string;
  }>();
  const [, setGlobalTournamentId] = useTournamentId();

  const tournamentId = tidParam ?? "";
  const teamId = teamIdParam ?? "";

  useEffect(() => {
    if (tournamentId) setGlobalTournamentId(tournamentId);
  }, [tournamentId, setGlobalTournamentId]);

  const [meta, setMeta] = useState<{
    name: string;
    schoolYear: number;
    tournamentKind?: "intraSchool" | "interSchool";
    divisionLabelA?: string;
    divisionLabelB?: string;
    qualifyingMode?: "twoPools" | "unified";
    qualifyingLeagueCountByDivision?: Record<string, 1 | 2>;
    qualifyingLeagueAssignmentsByDivision?: Record<
      string,
      Record<string, LeagueId>
    >;
  } | null>(null);
  const [teams, setTeams] = useState<
    Record<
      string,
      {
        gradeId: string;
        divisionId: "A" | "B";
        name: string;
        code?: string;
        schoolId?: string;
      }
    >
  | null>(null);
  const [schools, setSchools] = useState<
    Record<string, { name: string; shortLabel?: string }> | null
  >(null);
  const [qMatches, setQMatches] = useState<Record<string, QualifyingMatchData> | null>(null);
  const [fMatches, setFMatches] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMetaA, setResMetaA] = useState<ResurrectionMeta | null>(null);
  const [resMetaB, setResMetaB] = useState<ResurrectionMeta | null>(null);
  const [resMetaU, setResMetaU] = useState<ResurrectionMeta | null>(null);
  const [resMatchesA, setResMatchesA] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMatchesB, setResMatchesB] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMatchesU, setResMatchesU] = useState<Record<string, FinalMatchData> | null>(null);

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
    return subscribeSchools(tournamentId, setSchools);
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    return subscribeQualifyingMatches(tournamentId, setQMatches);
  }, [tournamentId]);

  const team = teamId && teams ? teams[teamId] : undefined;
  const grade = team?.gradeId ?? "";

  const isUnified =
    meta?.qualifyingMode === "unified" || meta?.tournamentKind === "interSchool";

  useEffect(() => {
    if (!tournamentId || !grade) return;
    return subscribeFinalMatches(tournamentId, grade, setFMatches);
  }, [tournamentId, grade]);

  useEffect(() => {
    if (!tournamentId || !grade) return;
    if (isUnified) {
      setResMetaA(null);
      setResMatchesA(null);
      setResMetaB(null);
      setResMatchesB(null);
      return subscribeResurrectionMeta(tournamentId, grade, "U", setResMetaU);
    }
    setResMetaU(null);
    setResMatchesU(null);
    const u1 = subscribeResurrectionMeta(tournamentId, grade, "A", setResMetaA);
    const u2 = subscribeResurrectionMeta(tournamentId, grade, "B", setResMetaB);
    return () => {
      u1();
      u2();
    };
  }, [tournamentId, grade, isUnified]);

  useEffect(() => {
    if (!tournamentId || !grade) return;
    if (isUnified) {
      return subscribeResurrectionMatches(tournamentId, grade, "U", setResMatchesU);
    }
    const u1 = subscribeResurrectionMatches(tournamentId, grade, "A", setResMatchesA);
    const u2 = subscribeResurrectionMatches(tournamentId, grade, "B", setResMatchesB);
    return () => {
      u1();
      u2();
    };
  }, [tournamentId, grade, isUnified]);

  const teamList = useMemo(() => {
    if (!teams) return [];
    return Object.entries(teams).map(([id, t]) => ({ id, ...t }));
  }, [teams]);

  const schoolShortById = useMemo(
    () => schoolShortByIdFromRecord(schools),
    [schools]
  );

  const nameById = useMemo(
    () => buildTeamDisplayNameById(teamList, schoolShortById),
    [teamList, schoolShortById]
  );

  const qualifyingForTeam = useMemo(() => {
    if (!team || !qMatches) return [];
    return Object.values(qMatches).filter(
      (m) =>
        (m.teamAId === teamId || m.teamBId === teamId) &&
        m.gradeId === team.gradeId &&
        m.divisionId === team.divisionId
    );
  }, [qMatches, team, teamId]);

  const poolTeamIds = useMemo(() => {
    if (!team) return [];
    return teamList
      .filter((t) => t.gradeId === team.gradeId && t.divisionId === team.divisionId)
      .map((t) => t.id);
  }, [teamList, team]);

  const qualPoolMatches = useMemo(() => {
    if (!team || !qMatches) return [];
    return Object.values(qMatches).filter(
      (m) => m.gradeId === team.gradeId && m.divisionId === team.divisionId
    );
  }, [qMatches, team]);

  const requestedLeagueCount = useMemo(
    () => (team ? getDivisionLeagueCount(meta, team.gradeId, team.divisionId) : 1),
    [meta, team]
  );

  const effLeagueCount = effectiveLeagueCount(requestedLeagueCount, poolTeamIds.length);

  const leagueBuckets = useMemo(() => {
    if (!team || effLeagueCount === 1) return { L1: poolTeamIds, L2: [] as string[] };
    return partitionTeamsIntoLeaguesFromSaved(
      poolTeamIds,
      getQualifyingLeagueAssignment(meta, team.gradeId, team.divisionId)
    );
  }, [team, poolTeamIds, effLeagueCount, meta]);

  const teamLeague: "L1" | "L2" | null = useMemo(() => {
    if (effLeagueCount === 1) return null;
    if (leagueBuckets.L1.includes(teamId)) return "L1";
    if (leagueBuckets.L2.includes(teamId)) return "L2";
    return null;
  }, [effLeagueCount, leagueBuckets, teamId]);

  const qualL1 = useMemo(
    () => qualPoolMatches.filter((m) => (m.leagueId ?? "L1") === "L1"),
    [qualPoolMatches]
  );
  const qualL2 = useMemo(
    () => qualPoolMatches.filter((m) => m.leagueId === "L2"),
    [qualPoolMatches]
  );

  const standSingle = useMemo(
    () => rankStandings(poolTeamIds, qualPoolMatches),
    [poolTeamIds, qualPoolMatches]
  );
  const standL1 = useMemo(
    () => rankStandings(leagueBuckets.L1, qualL1),
    [leagueBuckets.L1, qualL1]
  );
  const standL2 = useMemo(
    () => rankStandings(leagueBuckets.L2, qualL2),
    [leagueBuckets.L2, qualL2]
  );

  const finalList = useMemo(() => Object.values(fMatches ?? {}), [fMatches]);
  const finalsForTeam = useMemo(() => {
    if (!team) return [];
    const inGrade = finalList.filter((m) => m.gradeId === team.gradeId);
    if (isUnified) {
      const u = inGrade.filter((m) => m.bracketGroup === "U" || m.bracketGroup == null);
      return finalMatchesForTeam(teamId, u).sort(compareFinalByRoundThenScheduleThenSlot);
    }
    const div = team.divisionId;
    const bucket = inGrade.filter((m) =>
      div === "B"
        ? m.bracketGroup === "B"
        : m.bracketGroup === "A" || m.bracketGroup == null
    );
    return finalMatchesForTeam(teamId, bucket).sort(compareFinalByRoundThenScheduleThenSlot);
  }, [finalList, team, teamId, isUnified]);

  const resForTeam = useMemo(() => {
    if (!team) return [];
    if (isUnified) {
      const u = Object.values(resMatchesU ?? {});
      return finalMatchesForTeam(teamId, u).sort(compareFinalByRoundThenScheduleThenSlot);
    }
    if (team.divisionId === "A") {
      return finalMatchesForTeam(teamId, Object.values(resMatchesA ?? {})).sort(
        compareFinalByRoundThenScheduleThenSlot
      );
    }
    return finalMatchesForTeam(teamId, Object.values(resMatchesB ?? {})).sort(
      compareFinalByRoundThenScheduleThenSlot
    );
  }, [team, teamId, isUnified, resMatchesU, resMatchesA, resMatchesB]);

  if (!tournamentId || !teamId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-cup-muted">Invalid team link.</p>
        <Link to="/" className="text-cup-accent font-medium underline">
          Back to live view
        </Link>
      </div>
    );
  }

  if (teams !== null && teams[teamId] === undefined) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-cup-muted">
          No team <span className="font-mono">{teamId}</span> in this tournament.
        </p>
        <Link
          to={`/?tournamentId=${encodeURIComponent(tournamentId)}`}
          className="text-cup-accent font-medium underline"
        >
          Open live view
        </Link>
      </div>
    );
  }

  if (!team) {
    return (
      <p className="text-sm text-cup-muted py-8">Loading team…</p>
    );
  }

  const displayName = nameById.get(teamId) ?? team.name;
  const poolTitle = `${team.gradeId} · ${divisionLabel(meta, team.divisionId)}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="font-display text-2xl font-semibold">{displayName}</h1>
          <p className="text-sm text-cup-muted mt-1">
            {meta?.name ?? "Tournament"} ({meta?.schoolYear ?? "—"}) · {poolTitle}
            {team.code ? <span> · Code: {team.code}</span> : null}
          </p>
          <p className="font-mono text-xs text-cup-muted mt-1">Team id: {teamId}</p>
        </div>
        <Link
          to={`/?tournamentId=${encodeURIComponent(tournamentId)}`}
          className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium bg-white hover:bg-cup-paper/80"
        >
          Open full live view
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Your qualifying matches</h2>
        <QualifyingScheduleList
          title={`${poolTitle}`}
          matches={qualifyingForTeam}
          nameById={nameById}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Pool standings</h2>
        {effLeagueCount === 2 && teamLeague ? (
          <div className="space-y-4">
            {teamLeague === "L1" ? (
              <StandingsTable
                standings={standL1}
                nameById={nameById}
                highlightTeamId={teamId}
              />
            ) : (
              <StandingsTable
                standings={standL2}
                nameById={nameById}
                highlightTeamId={teamId}
              />
            )}
          </div>
        ) : (
          <StandingsTable
            standings={standSingle}
            nameById={nameById}
            highlightTeamId={teamId}
          />
        )}
      </section>

      {(resForTeam.length > 0 ||
        (isUnified && resMetaU?.entrantTeamIds?.includes(teamId)) ||
        (!isUnified &&
          team.divisionId === "A" &&
          resMetaA?.entrantTeamIds?.includes(teamId)) ||
        (!isUnified &&
          team.divisionId === "B" &&
          resMetaB?.entrantTeamIds?.includes(teamId))) ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Resurrection (your matches)</h2>
          {resForTeam.length > 0 ? (
            <ul className="text-sm space-y-2 border border-cup-line rounded-lg p-4 bg-white">
              {resForTeam.map((m) => (
                <li key={m.id} className="font-mono text-xs text-cup-muted">
                  {formatFinalMatchLine(m, teamId, nameById)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-cup-muted">
              You are in the resurrection pool; bracket or results will appear here once
              generated.
            </p>
          )}
        </section>
      ) : null}

      {finalsForTeam.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Finals (your matches)</h2>
          <ul className="text-sm space-y-2 border border-cup-line rounded-lg p-4 bg-white">
            {finalsForTeam.map((m) => (
              <li key={m.id} className="font-mono text-xs text-cup-muted">
                {formatFinalMatchLine(m, teamId, nameById)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
