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
import {
  subscribeFairPlayIncidents,
  subscribeFinalsGradeMeta,
  subscribeStudents,
} from "@/lib/firebase/fairPlayService";
import type { StudentRecord } from "@/lib/firebase/tournamentService";
import {
  fairPlayCategoryLabel,
  isFairPlayEnabled,
  isFairPlayLockedForGrade,
  japanCupEligibleForStudent,
  rankStandingsFairPlayOptions,
  studentsOnTeam,
  sumFairPlayForTeam,
} from "@/lib/tournament/fairPlay";
import type { FairPlayIncident } from "@/lib/tournament/types";
import { FairPlayBandBadge } from "@/components/FairPlayBandBadge";
import { formatScheduleTokyo } from "@/lib/schedule/tokyo";
import { regulationTotals } from "@/lib/tournament/roundRobin";
import { StandingsTable } from "@/components/StandingsTable";
import { QualifyingScheduleList } from "@/components/QualifyingScheduleList";
import { divisionLabel } from "@/lib/tournament/divisionLabels";
import {
  buildTeamDisplayNameById,
  schoolShortByIdFromRecord,
} from "@/lib/tournament/teamDisplay";
import type { LeagueId } from "@/lib/tournament/leagueSplit";
import { buildLiveViewHref, buildDefaultLiveViewHref } from "@/lib/viewerDisplay";
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
  return `vs ${oppLabel} · ${score}${wl}`;
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
        fairPlayPoints?: number;
      }
    >
  | null>(null);
  const [fairPlayIncidents, setFairPlayIncidents] = useState<
    Record<string, FairPlayIncident> | null
  >(null);
  const [students, setStudents] = useState<Record<string, StudentRecord> | null>(null);
  const [finalsGradeMeta, setFinalsGradeMeta] = useState<{ generatedAt?: number } | null>(
    null
  );
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
  const fairPlayEnabled = isFairPlayEnabled(meta);

  useEffect(() => {
    if (!tournamentId || !fairPlayEnabled) {
      setFairPlayIncidents(null);
      setStudents(null);
      return;
    }
    const u1 = subscribeFairPlayIncidents(tournamentId, setFairPlayIncidents);
    const u2 = subscribeStudents(tournamentId, setStudents);
    return () => {
      u1();
      u2();
    };
  }, [tournamentId, fairPlayEnabled]);

  useEffect(() => {
    if (!tournamentId || !grade || !fairPlayEnabled) {
      setFinalsGradeMeta(null);
      return;
    }
    return subscribeFinalsGradeMeta(tournamentId, grade, setFinalsGradeMeta);
  }, [tournamentId, grade, fairPlayEnabled]);

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

  const fpOpts = (ids: string[]) =>
    rankStandingsFairPlayOptions(students, ids, fairPlayEnabled, teams);

  const gradeLocked = isFairPlayLockedForGrade(finalsGradeMeta);
  const teamRoster = useMemo(
    () => studentsOnTeam(students, teamId),
    [students, teamId]
  );
  const teamFairPlaySum = useMemo(
    () => sumFairPlayForTeam(students, teamId),
    [students, teamId]
  );

  const standSingle = useMemo(
    () => rankStandings(poolTeamIds, qualPoolMatches, fpOpts(poolTeamIds)),
    [poolTeamIds, qualPoolMatches, teams, students, fairPlayEnabled]
  );
  const standL1 = useMemo(
    () => rankStandings(leagueBuckets.L1, qualL1, fpOpts(leagueBuckets.L1)),
    [leagueBuckets.L1, qualL1, teams, students, fairPlayEnabled]
  );
  const standL2 = useMemo(
    () => rankStandings(leagueBuckets.L2, qualL2, fpOpts(leagueBuckets.L2)),
    [leagueBuckets.L2, qualL2, teams, students, fairPlayEnabled]
  );

  const myStanding = useMemo(() => {
    const rows =
      effLeagueCount === 2 && teamLeague === "L2"
        ? standL2
        : effLeagueCount === 2 && teamLeague === "L1"
          ? standL1
          : standSingle;
    return rows.find((r) => r.teamId === teamId);
  }, [effLeagueCount, teamLeague, standL1, standL2, standSingle, teamId]);

  const recentIncidents = useMemo(() => {
    if (!fairPlayEnabled || !fairPlayIncidents) return [];
    return Object.values(fairPlayIncidents)
      .filter((i) => i.teamId === teamId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3);
  }, [fairPlayEnabled, fairPlayIncidents, teamId]);

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

  const shell = "projection-shell rounded-2xl px-2 py-4 md:px-4 md:py-5 min-w-0";
  const panel =
    "rounded-xl border border-cup-stageBorder bg-cup-stageElevated/85 p-4 md:p-5 shadow-lg shadow-black/25";
  const sectionTitle =
    "font-displayWide text-lg md:text-xl font-semibold text-slate-50 border-l-4 border-cup-signal pl-3 tracking-wide mb-4";
  const linkPrimary =
    "inline-flex items-center justify-center rounded-lg border border-cup-signal/50 bg-cup-signal/15 px-4 py-2.5 text-sm font-semibold text-cup-signal shadow-sm transition hover:bg-cup-signal/25 hover:border-cup-signal";

  if (!tournamentId || !teamId) {
    return (
      <div className={`${shell} space-y-4`}>
        <div className={panel}>
          <p className="text-sm text-slate-300">Invalid team link.</p>
          <Link to={buildDefaultLiveViewHref()} className={`${linkPrimary} mt-4`}>
            Back to live view
          </Link>
        </div>
      </div>
    );
  }

  if (teams !== null && teams[teamId] === undefined) {
    return (
      <div className={`${shell} space-y-4`}>
        <div className={panel}>
          <p className="text-sm text-slate-300">
            No team <span className="font-mono text-cup-signalMuted">{teamId}</span> in this
            tournament.
          </p>
          <Link
            to={`/?tournamentId=${encodeURIComponent(tournamentId)}`}
            className={`${linkPrimary} mt-4`}
          >
            Open live view
          </Link>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className={`${shell} ${panel}`}>
        <p className="text-sm text-slate-400 py-2 text-center">Loading team…</p>
      </div>
    );
  }

  const displayName = nameById.get(teamId) ?? team.name;
  const poolTitle = `${team.gradeId} · ${divisionLabel(meta, team.divisionId)}`;
  const liveHref = buildLiveViewHref(tournamentId, team.gradeId);

  return (
    <div className={`${shell} space-y-8`}>
      <header className="border-b border-cup-stageBorder pb-6">
        <div className="flex flex-wrap justify-between gap-4 items-start">
          <div className="min-w-0 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-cup-signalMuted font-semibold">
              Team view
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-semibold text-slate-50 tracking-tight">
              {displayName}
            </h1>
            <p className="font-displayWide text-cup-signal text-lg md:text-xl font-semibold tracking-wide">
              {poolTitle}
            </p>
            <p className="text-sm text-slate-400 max-w-xl">
              <span className="text-slate-300">{meta?.name ?? "Tournament"}</span>
              {meta && Number.isFinite(Number(meta.schoolYear)) ? (
                <span className="tabular-nums"> · {meta.schoolYear}</span>
              ) : (
                <span> · —</span>
              )}
              {team.code ? <span className="text-cup-signalMuted"> · Code {team.code}</span> : null}
            </p>
            <p className="font-mono text-xs text-slate-500">
              Team id <span className="text-cup-signalMuted">{teamId}</span>
            </p>
          </div>
          <Link to={liveHref} className={`${linkPrimary} shrink-0`}>
            Open live view
          </Link>
        </div>
      </header>

      {fairPlayEnabled && myStanding ? (
        <section className={panel}>
          <h2 className={sectionTitle}>Preliminary score</h2>
          {gradeLocked ? (
            <p className="text-xs text-slate-400 mb-4">
              Fair Play locked — Japan Cup eligibility finalized for this grade.
            </p>
          ) : (
            <p className="text-xs text-slate-400 mb-4">
              Preliminary only. Team Fair Play = sum of student shares (15 split across roster).
            </p>
          )}
          <dl className="grid grid-cols-3 gap-4 text-center">
            <div>
              <dt className="text-xs uppercase tracking-widest text-slate-400 mb-1">Match pts</dt>
              <dd className="text-2xl font-bold text-slate-50 tabular-nums">
                {myStanding.leaguePoints}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-slate-400 mb-1">Fair Play</dt>
              <dd className="flex justify-center">
                <FairPlayBandBadge points={teamFairPlaySum} />
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-cup-signalMuted mb-1">Total</dt>
              <dd className="text-2xl font-bold text-cup-signal tabular-nums">
                {myStanding.totalScore ?? myStanding.leaguePoints}
              </dd>
            </div>
          </dl>
          {teamRoster.length > 0 ? (
            <div className="mt-5 border-t border-cup-stageBorder pt-4">
              <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-2">Roster</h3>
              <ul className="space-y-2">
                {teamRoster.map((s) => {
                  const rec = students?.[s.id];
                  const eligible = rec
                    ? japanCupEligibleForStudent(rec, gradeLocked)
                    : false;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap justify-between gap-2 text-sm text-slate-300 rounded-lg border border-cup-stageBorder bg-black/20 px-3 py-2"
                    >
                      <span>{rec?.name ?? s.id}</span>
                      <span className="flex items-center gap-3">
                        {typeof s.fairPlayInitialShare === "number" ? (
                          <FairPlayBandBadge
                            points={s.fairPlayPoints ?? 0}
                            initialShare={s.fairPlayInitialShare}
                          />
                        ) : (
                          <span className="text-slate-500 text-xs">not init</span>
                        )}
                        {typeof s.fairPlayInitialShare === "number" ? (
                          <span
                            className={
                              eligible ? "text-cup-winBright text-xs" : "text-red-400 text-xs"
                            }
                          >
                            {eligible ? "Japan Cup OK" : "Japan Cup —"}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {recentIncidents.length > 0 ? (
            <div className="mt-5 border-t border-cup-stageBorder pt-4">
              <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-2">
                Recent Fair Play
              </h3>
              <ul className="space-y-2">
                {recentIncidents.map((inc) => (
                  <li
                    key={inc.id}
                    className="text-sm text-slate-300 rounded-lg border border-cup-stageBorder bg-black/20 px-3 py-2"
                  >
                    <span className="text-cup-signalMuted tabular-nums">
                      {formatScheduleTokyo(inc.createdAt)}
                    </span>
                    {" · "}
                    {fairPlayCategoryLabel(inc.category)}
                    {inc.studentName && inc.studentName !== "—"
                      ? ` · ${inc.studentName}`
                      : ""}
                    {" · "}
                    <span className={inc.delta < 0 ? "text-cup-lossBright" : "text-cup-winBright"}>
                      {inc.delta > 0 ? "+" : ""}
                      {inc.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={panel}>
        <QualifyingScheduleList
          title={`${poolTitle} · Your preliminary matches`}
          matches={qualifyingForTeam}
          nameById={nameById}
          projectionMode
        />
      </section>

      <section className={panel}>
        <h2 className={sectionTitle}>Pool standings</h2>
        {effLeagueCount === 2 && teamLeague ? (
          <div className="space-y-4">
            {teamLeague === "L1" ? (
              <StandingsTable
                standings={standL1}
                nameById={nameById}
                highlightTeamId={teamId}
                projectionMode
                showFairPlay={fairPlayEnabled}
              />
            ) : (
              <StandingsTable
                standings={standL2}
                nameById={nameById}
                highlightTeamId={teamId}
                projectionMode
                showFairPlay={fairPlayEnabled}
              />
            )}
          </div>
        ) : (
          <StandingsTable
            standings={standSingle}
            nameById={nameById}
            highlightTeamId={teamId}
            projectionMode
            showFairPlay={fairPlayEnabled}
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
        <section className={panel}>
          <h2 className={sectionTitle}>Redemption</h2>
          {resForTeam.length > 0 ? (
            <ul className="space-y-2">
              {resForTeam.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-cup-stageBorder bg-black/25 px-4 py-3 text-sm text-slate-200 shadow-sm"
                >
                  <span className="font-mono text-xs text-cup-signalMuted block mb-1">{m.id}</span>
                  <span className="leading-snug">{formatFinalMatchLine(m, teamId, nameById)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 leading-relaxed border border-dashed border-cup-stageBorder rounded-lg px-4 py-3 bg-black/15">
              You are in the redemption pool; bracket or results will appear here once generated.
            </p>
          )}
        </section>
      ) : null}

      {finalsForTeam.length > 0 ? (
        <section className={panel}>
          <h2 className={sectionTitle}>Finals</h2>
          <ul className="space-y-2">
            {finalsForTeam.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-cup-stageBorder bg-black/25 px-4 py-3 text-sm text-slate-200 shadow-sm"
              >
                <span className="font-mono text-xs text-cup-signalMuted block mb-1">{m.id}</span>
                <span className="leading-snug">{formatFinalMatchLine(m, teamId, nameById)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
