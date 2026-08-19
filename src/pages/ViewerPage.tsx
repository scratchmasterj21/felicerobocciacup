import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import {
  isRegularPoolTeam,
  resolveJapanCupChallengeDisplayMatch,
} from "@/lib/tournament/japanCupChallenge";
import type { FinalMatchData, QualifyingMatchData, ResurrectionMeta } from "@/lib/tournament/types";
import { compareFinalByRoundThenScheduleThenSlot } from "@/lib/schedule/matchSort";
import { rankStandings } from "@/lib/tournament/standings";
import {
  isFairPlayEnabled,
  rankStandingsFairPlayOptions,
} from "@/lib/tournament/fairPlay";
import { StandingsTable } from "@/components/StandingsTable";
import { BracketRounds } from "@/components/BracketRounds";
import { JapanCupChallengeMatchup } from "@/components/JapanCupChallengeMatchup";
import { QualifyingScheduleList } from "@/components/QualifyingScheduleList";
import { QualifyingScheduleByRound } from "@/components/QualifyingScheduleByRound";
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
import { parseViewerDisplayParams } from "@/lib/viewerDisplay";
import {
  gradeLabel,
  INTERSCHOOL_GRADE_ID,
  isInterSchoolTournament,
  normalizeWorkingGrade,
} from "@/lib/tournament/grades";
import { subscribeStudents, subscribeFinalsGradeMeta } from "@/lib/firebase/fairPlayService";
import type { StudentRecord } from "@/lib/firebase/tournamentService";
import type { FinalsGradeMeta } from "@/lib/tournament/japanCupChallenge";
import { getDb } from "@/lib/firebase/config";
import { regulationTotals } from "@/lib/tournament/roundRobin";

const LIVE_FALLBACK_LOGO_SRC = "https://i.imgur.com/RpJzD9D.png";
type LiveViewMode = "overview" | "standings" | "schedule" | "redemption" | "finals";

type LiveTimelineMatch = {
  id: string;
  stage: string;
  teamAId?: string;
  teamBId?: string;
  status: string;
  schedule?: { startAt: number; durationRegulationMinutes?: number; court?: string };
  score?: string;
};

export function ViewerPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isInterschoolRoute = pathname === "/interschool";
  const [tournamentId, setTournamentId] = useTournamentId();
  const [searchParams, setSearchParams] = useSearchParams();
  const [grade, setGrade] = useState<string>("G1");
  const [meta, setMeta] = useState<{
    name: string;
    schoolYear: number;
    tournamentKind?: "intraSchool" | "interSchool" | "practice";
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
        schoolId?: string;
        fairPlayPoints?: number;
      }
    >
  | null>(null);
  const [schools, setSchools] = useState<
    Record<string, { name: string; shortLabel?: string }> | null
  >(null);
  const [qMatches, setQMatches] = useState<Record<string, QualifyingMatchData> | null>(null);
  const [fMatches, setFMatches] = useState<Record<string, FinalMatchData> | null>(null);
  const [finalsGradeMeta, setFinalsGradeMeta] = useState<FinalsGradeMeta | null>(null);
  const [resMetaA, setResMetaA] = useState<ResurrectionMeta | null>(null);
  const [resMetaB, setResMetaB] = useState<ResurrectionMeta | null>(null);
  const [resMetaU, setResMetaU] = useState<ResurrectionMeta | null>(null);
  const [resMatchesA, setResMatchesA] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMatchesB, setResMatchesB] = useState<Record<string, FinalMatchData> | null>(null);
  const [resMatchesU, setResMatchesU] = useState<Record<string, FinalMatchData> | null>(null);
  const [students, setStudents] = useState<Record<string, StudentRecord> | null>(null);
  const initialMode = searchParams.get("view");
  const [viewMode, setViewModeState] = useState<LiveViewMode>(
    initialMode === "standings" || initialMode === "schedule" || initialMode === "redemption" || initialMode === "finals"
      ? initialMode
      : "overview"
  );
  const [rotating, setRotating] = useState(searchParams.get("rotate") === "1");
  const [now, setNow] = useState(Date.now());
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => onValue(ref(getDb(), ".info/connected"), (snap) => setConnected(snap.val() === true)), []);
  useEffect(() => setLastUpdated(Date.now()), [qMatches, fMatches, resMatchesA, resMatchesB, resMatchesU]);

  useEffect(() => {
    const tid = searchParams.get("tournamentId");
    if (tid) setTournamentId(tid);
  }, [searchParams, setTournamentId]);

  useEffect(() => {
    const requested = searchParams.get("view");
    setViewModeState(
      requested === "standings" || requested === "schedule" || requested === "redemption" || requested === "finals"
        ? requested
        : "overview"
    );
  }, [searchParams]);

  useEffect(() => {
    if (isInterschoolRoute) {
      setGrade(INTERSCHOOL_GRADE_ID);
      return;
    }
    const g = parseViewerDisplayParams(searchParams.toString()).grade;
    if (g && g !== INTERSCHOOL_GRADE_ID) setGrade(g);
  }, [searchParams, isInterschoolRoute]);

  useEffect(() => {
    if (!meta) return;
    if (isInterSchoolTournament(meta)) {
      setGrade(INTERSCHOOL_GRADE_ID);
      if (!isInterschoolRoute) {
        const p = new URLSearchParams();
        if (tournamentId.trim()) p.set("tournamentId", tournamentId.trim());
        navigate(`/interschool?${p.toString()}`, { replace: true });
      }
      return;
    }
    setGrade((g) => normalizeWorkingGrade(meta, g));
  }, [meta, isInterschoolRoute, navigate, tournamentId]);

  useEffect(() => {
    return subscribeTournamentMeta(tournamentId, (m) => setMeta(m));
  }, [tournamentId]);

  useEffect(() => {
    return subscribeTeams(tournamentId, setTeams);
  }, [tournamentId]);

  useEffect(() => {
    return subscribeSchools(tournamentId, setSchools);
  }, [tournamentId]);

  useEffect(() => {
    return subscribeQualifyingMatches(tournamentId, setQMatches);
  }, [tournamentId]);

  useEffect(() => {
    return subscribeFinalMatches(tournamentId, grade, setFMatches);
  }, [tournamentId, grade]);

  useEffect(() => {
    return subscribeFinalsGradeMeta(tournamentId, grade, setFinalsGradeMeta);
  }, [tournamentId, grade]);

  const isInterSchool = isInterSchoolTournament(meta);
  const isUnified =
    meta?.qualifyingMode === "unified" || isInterSchool;
  const fairPlayEnabled = isFairPlayEnabled(meta);
  const fpOpts = (teamIds: string[]) =>
    rankStandingsFairPlayOptions(students, teamIds, fairPlayEnabled, teams);

  useEffect(() => {
    if (!fairPlayEnabled) {
      setStudents(null);
      return;
    }
    return subscribeStudents(tournamentId, setStudents);
  }, [tournamentId, fairPlayEnabled]);

  useEffect(() => {
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
    if (isUnified) {
      return subscribeResurrectionMatches(
        tournamentId,
        grade,
        "U",
        setResMatchesU
      );
    }
    const u1 = subscribeResurrectionMatches(
      tournamentId,
      grade,
      "A",
      setResMatchesA
    );
    const u2 = subscribeResurrectionMatches(
      tournamentId,
      grade,
      "B",
      setResMatchesB
    );
    return () => {
      u1();
      u2();
    };
  }, [tournamentId, grade, isUnified]);

  const teamList = useMemo(() => {
    if (!teams) return [];
    return Object.entries(teams).map(([id, t]) => ({ id, ...t }));
  }, [teams]);

  const teamsA = useMemo(
    () =>
      teamList
        .filter(
          (t) =>
            isRegularPoolTeam(t) && t.gradeId === grade && t.divisionId === "A"
        )
        .map((t) => t.id),
    [teamList, grade]
  );
  const teamsB = useMemo(
    () =>
      teamList
        .filter(
          (t) =>
            isRegularPoolTeam(t) && t.gradeId === grade && t.divisionId === "B"
        )
        .map((t) => t.id),
    [teamList, grade]
  );

  const qualA = useMemo(() => {
    const all = Object.values(qMatches ?? {});
    return all.filter((m) => m.gradeId === grade && m.divisionId === "A");
  }, [qMatches, grade]);
  const qualB = useMemo(() => {
    const all = Object.values(qMatches ?? {});
    return all.filter((m) => m.gradeId === grade && m.divisionId === "B");
  }, [qMatches, grade]);

  const standA = useMemo(
    () => rankStandings(teamsA, qualA, fpOpts(teamsA)),
    [teamsA, qualA, teams, students, fairPlayEnabled]
  );
  const standB = useMemo(
    () => rankStandings(teamsB, qualB, fpOpts(teamsB)),
    [teamsB, qualB, teams, students, fairPlayEnabled]
  );
  const requestedLeagueCountA = useMemo(
    () => getDivisionLeagueCount(meta, grade, "A"),
    [meta, grade]
  );
  const requestedLeagueCountB = useMemo(
    () => getDivisionLeagueCount(meta, grade, "B"),
    [meta, grade]
  );
  const effLeagueCountA = effectiveLeagueCount(requestedLeagueCountA, teamsA.length);
  const effLeagueCountB = effectiveLeagueCount(requestedLeagueCountB, teamsB.length);
  const leagueTeamsA = useMemo(
    () =>
      effLeagueCountA === 2
        ? partitionTeamsIntoLeaguesFromSaved(
            teamsA,
            getQualifyingLeagueAssignment(meta, grade, "A")
          )
        : { L1: teamsA, L2: [] },
    [teamsA, effLeagueCountA, meta, grade]
  );
  const leagueTeamsB = useMemo(
    () =>
      effLeagueCountB === 2
        ? partitionTeamsIntoLeaguesFromSaved(
            teamsB,
            getQualifyingLeagueAssignment(meta, grade, "B")
          )
        : { L1: teamsB, L2: [] },
    [teamsB, effLeagueCountB, meta, grade]
  );
  const qualA_L1 = useMemo(() => qualA.filter((m) => (m.leagueId ?? "L1") === "L1"), [qualA]);
  const qualA_L2 = useMemo(() => qualA.filter((m) => m.leagueId === "L2"), [qualA]);
  const qualB_L1 = useMemo(() => qualB.filter((m) => (m.leagueId ?? "L1") === "L1"), [qualB]);
  const qualB_L2 = useMemo(() => qualB.filter((m) => m.leagueId === "L2"), [qualB]);
  const standA_L1 = useMemo(
    () => rankStandings(leagueTeamsA.L1, qualA_L1, fpOpts(leagueTeamsA.L1)),
    [leagueTeamsA, qualA_L1, teams, students, fairPlayEnabled]
  );
  const standA_L2 = useMemo(
    () => rankStandings(leagueTeamsA.L2, qualA_L2, fpOpts(leagueTeamsA.L2)),
    [leagueTeamsA, qualA_L2, teams, students, fairPlayEnabled]
  );
  const standB_L1 = useMemo(
    () => rankStandings(leagueTeamsB.L1, qualB_L1, fpOpts(leagueTeamsB.L1)),
    [leagueTeamsB, qualB_L1, teams, students, fairPlayEnabled]
  );
  const standB_L2 = useMemo(
    () => rankStandings(leagueTeamsB.L2, qualB_L2, fpOpts(leagueTeamsB.L2)),
    [leagueTeamsB, qualB_L2, teams, students, fairPlayEnabled]
  );

  const schoolShortById = useMemo(
    () => schoolShortByIdFromRecord(schools),
    [schools]
  );

  const nameById = useMemo(
    () => buildTeamDisplayNameById(teamList, schoolShortById),
    [teamList, schoolShortById]
  );

  const finalMatchList = useMemo(() => Object.values(fMatches ?? {}), [fMatches]);
  const japanCupChallengeDisplay = useMemo(
    () => resolveJapanCupChallengeDisplayMatch(finalMatchList, finalsGradeMeta, grade),
    [finalMatchList, finalsGradeMeta, grade]
  );
  const finalsUnified = useMemo(
    () => finalMatchList.filter((m) => m.bracketGroup === "U" || m.bracketGroup == null),
    [finalMatchList]
  );
  const finalsSplitMerged = useMemo(
    () =>
      finalMatchList.filter(
        (m) =>
          m.bracketGroup === "A" ||
          m.bracketGroup === "B" ||
          m.bracketGroup === "U" ||
          m.bracketGroup == null
      ),
    [finalMatchList]
  );

  const resListU = useMemo(
    () =>
      Object.values(resMatchesU ?? {}).sort(
        compareFinalByRoundThenScheduleThenSlot
      ),
    [resMatchesU]
  );
  const resListA = useMemo(
    () =>
      Object.values(resMatchesA ?? {}).sort(
        compareFinalByRoundThenScheduleThenSlot
      ),
    [resMatchesA]
  );
  const resListB = useMemo(
    () =>
      Object.values(resMatchesB ?? {}).sort(
        compareFinalByRoundThenScheduleThenSlot
      ),
    [resMatchesB]
  );

  const hasRedemption = resListA.length + resListB.length + resListU.length > 0;
  const hasFinals = finalMatchList.length > 0 || Boolean(japanCupChallengeDisplay);
  const timeline = useMemo<LiveTimelineMatch[]>(() => {
    const qualifyingRows = [...qualA, ...qualB].map((match) => {
      const totals = match.regulation ? regulationTotals(match.regulation) : null;
      return {
        id: `qualifying:${match.id}`,
        stage: `Preliminary · ${divisionLabel(meta, match.divisionId)}`,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        status: match.status,
        schedule: match.schedule,
        score: totals ? `${totals.totalA}–${totals.totalB}` : undefined,
      };
    });
    const knockoutRows = (matches: FinalMatchData[], stage: string) =>
      matches.map((match) => {
        const totals = match.regulation ? regulationTotals(match.regulation) : null;
        const extra = match.extra8min?.round;
        return {
          id: `${stage}:${match.id}`,
          stage,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          status: match.status,
          schedule: match.schedule,
          score: totals
            ? `${totals.totalA}–${totals.totalB}${extra ? ` · ET ${extra.scoreA}–${extra.scoreB}` : ""}`
            : undefined,
        };
      });
    return [
      ...qualifyingRows,
      ...knockoutRows([...resListA, ...resListB, ...resListU], "Redemption"),
      ...knockoutRows(finalMatchList, "Finals"),
    ].filter((match) => match.schedule?.startAt != null);
  }, [qualA, qualB, resListA, resListB, resListU, finalMatchList, meta]);

  const liveMatches = useMemo(
    () => timeline.filter((match) => {
      if (match.status === "COMPLETED" || !match.schedule) return false;
      const duration = match.schedule.durationRegulationMinutes ?? (match.stage === "Redemption" ? 3 : 16);
      return match.schedule.startAt <= now && now < match.schedule.startAt + duration * 60_000;
    }),
    [timeline, now]
  );
  const upcomingMatches = useMemo(
    () => timeline.filter((match) => match.status !== "COMPLETED" && Boolean(match.schedule) && match.schedule!.startAt > now).sort((a, b) => a.schedule!.startAt - b.schedule!.startAt).slice(0, 4),
    [timeline, now]
  );

  const availableModes = useMemo<LiveViewMode[]>(
    () => ["overview", "standings", "schedule", ...(hasRedemption ? ["redemption" as const] : []), ...(hasFinals ? ["finals" as const] : [])],
    [hasRedemption, hasFinals]
  );
  useEffect(() => {
    if (!rotating || availableModes.length < 2) return;
    const timer = window.setInterval(() => {
      setViewModeState((current) => {
        const index = availableModes.indexOf(current);
        return availableModes[(index + 1) % availableModes.length];
      });
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [rotating, availableModes]);

  const showStandings = viewMode === "overview" || viewMode === "standings";
  const showSchedule = viewMode === "schedule";
  const showRedemption = viewMode === "redemption" && hasRedemption;
  const showFinals = viewMode === "finals" && hasFinals;

  const h2Section =
    "font-displayWide text-2xl md:text-3xl font-semibold mb-3 text-slate-50 border-l-4 border-cup-signal pl-3 tracking-wide";
  const h3League =
    "text-sm md:text-base font-semibold text-cup-signalMuted mb-1 tracking-wide";
  const h3Bracket =
    "text-base md:text-lg font-semibold text-cup-signalMuted mb-2 tracking-wide";
  const h2Major =
    "font-displayWide text-2xl md:text-3xl font-semibold text-slate-50 border-l-4 border-cup-signal pl-3 tracking-wide";
  const bodyMuted = "text-base text-slate-400 max-w-2xl";
  const bodyMutedNarrow = "text-base text-slate-400 max-w-xl";
  const displayGradeLabel = gradeLabel(grade, meta);
  const interschoolSubtitle = useMemo(() => {
    if (!isInterSchool) return displayGradeLabel;
    const a = meta?.divisionLabelA?.trim();
    const b = meta?.divisionLabelB?.trim();
    if (a && b) return `${a} vs ${b}`;
    if (a) return a;
    return "Interschool";
  }, [isInterSchool, displayGradeLabel, meta?.divisionLabelA, meta?.divisionLabelB]);

  return (
    <div className="projection-shell space-y-10 rounded-2xl px-2 py-3 md:px-4 md:py-5">
      <header className="text-center border-b border-cup-stageBorder pb-6 mb-2">
        <h1 className="font-display text-3xl md:text-5xl font-semibold text-slate-50 tracking-tight flex justify-center">
          {meta?.name?.trim() ? (
            meta.name.trim()
          ) : (
            <img
              src={LIVE_FALLBACK_LOGO_SRC}
              alt={isInterSchool ? "Interschool event" : "Felice Roboccia Cup"}
              className="max-h-[min(22vh,200px)] w-auto object-contain mx-auto"
              decoding="async"
            />
          )}
        </h1>
        <p className="font-displayWide text-cup-signal text-xl md:text-3xl mt-3 font-semibold tracking-wide">
          {interschoolSubtitle}
        </p>
        {meta && Number.isFinite(Number(meta.schoolYear)) ? (
          <p className="text-slate-400 text-lg mt-1 tabular-nums">{meta.schoolYear}</p>
        ) : null}
      </header>

      <LiveDisplayToolbar
        mode={viewMode}
        modes={availableModes}
        rotating={rotating}
        connected={connected}
        lastUpdated={lastUpdated}
        onMode={(mode) => {
          setRotating(false);
          setViewModeState(mode);
          const next = new URLSearchParams(searchParams);
          next.delete("rotate");
          if (mode === "overview") next.delete("view");
          else next.set("view", mode);
          setSearchParams(next, { replace: true });
        }}
        onToggleRotation={() => {
          const nextValue = !rotating;
          setRotating(nextValue);
          const next = new URLSearchParams(searchParams);
          if (nextValue) next.set("rotate", "1");
          else next.delete("rotate");
          setSearchParams(next, { replace: true });
        }}
      />

      {viewMode === "overview" ? (
        <LiveMatchSpotlight
          live={liveMatches}
          upcoming={upcomingMatches}
          nameById={nameById}
          now={now}
        />
      ) : null}

      {showStandings && isUnified ? (
        <p className={bodyMutedNarrow}>
          {isInterSchool
            ? "School vs school preliminary · one combined league."
            : "Unified preliminary · one combined league."}
        </p>
      ) : null}

      {showStandings && fairPlayEnabled ? (
        <p className={bodyMutedNarrow}>
          Match points decide first. <strong>Fair Play %</strong> is the next tie-breaker.
        </p>
      ) : null}

      {showStandings ? <section className={isUnified ? "grid gap-8" : "grid md:grid-cols-2 gap-8"}>
        <div className="min-w-0">
          <h2 className={h2Section}>
            Preliminary — {grade} · {divisionLabel(meta, "A")}
          </h2>
          {effLeagueCountA === 2 ? (
            <div className="space-y-4">
              <div>
                <h3 className={h3League}>League 1</h3>
                <StandingsTable
                  standings={standA_L1}
                  nameById={nameById}
                  projectionMode
                  showFairPlay={fairPlayEnabled}
                />
              </div>
              <div>
                <h3 className={h3League}>League 2</h3>
                <StandingsTable
                  standings={standA_L2}
                  nameById={nameById}
                  projectionMode
                  showFairPlay={fairPlayEnabled}
                />
              </div>
            </div>
          ) : (
            <StandingsTable
              standings={standA}
              nameById={nameById}
              projectionMode
              showFairPlay={fairPlayEnabled}
            />
          )}
        </div>
        {!isUnified ? (
          <div className="min-w-0">
            <h2 className={h2Section}>
              Preliminary — {grade} · {divisionLabel(meta, "B")}
            </h2>
            {effLeagueCountB === 2 ? (
              <div className="space-y-4">
                <div>
                  <h3 className={h3League}>League 1</h3>
                  <StandingsTable
                    standings={standB_L1}
                    nameById={nameById}
                    projectionMode
                    showFairPlay={fairPlayEnabled}
                  />
                </div>
                <div>
                  <h3 className={h3League}>League 2</h3>
                  <StandingsTable
                    standings={standB_L2}
                    nameById={nameById}
                    projectionMode
                    showFairPlay={fairPlayEnabled}
                  />
                </div>
              </div>
            ) : (
              <StandingsTable
                standings={standB}
                nameById={nameById}
                projectionMode
                showFairPlay={fairPlayEnabled}
              />
            )}
          </div>
        ) : null}
      </section> : null}

      {showSchedule ? <section className={isUnified ? "grid gap-8" : "grid md:grid-cols-2 gap-8"}>
        {!isUnified && effLeagueCountA === 1 && effLeagueCountB === 1 ? (
          <div className="md:col-span-2">
            <QualifyingScheduleByRound
              title={`Schedule — ${grade}`}
              divisionLabelA={divisionLabel(meta, "A")}
              divisionLabelB={divisionLabel(meta, "B")}
              matchesA={qualA}
              matchesB={qualB}
              nameById={nameById}
              projectionMode
            />
          </div>
        ) : effLeagueCountA === 2 ? (
          <div className="space-y-4">
            <QualifyingScheduleList
              title={`Schedule — ${grade} · ${divisionLabel(meta, "A")} · League 1`}
              matches={qualA_L1}
              nameById={nameById}
              projectionMode
            />
            <QualifyingScheduleList
              title={`Schedule — ${grade} · ${divisionLabel(meta, "A")} · League 2`}
              matches={qualA_L2}
              nameById={nameById}
              projectionMode
            />
          </div>
        ) : (
          <QualifyingScheduleList
            title={`Schedule — ${grade} · ${divisionLabel(meta, "A")}`}
            matches={qualA}
            nameById={nameById}
            projectionMode
          />
        )}
        {!isUnified && !(effLeagueCountA === 1 && effLeagueCountB === 1) ? (
          effLeagueCountB === 2 ? (
            <div className="space-y-4">
              <QualifyingScheduleList
                title={`Schedule — ${grade} · ${divisionLabel(meta, "B")} · League 1`}
                matches={qualB_L1}
                nameById={nameById}
                projectionMode
              />
              <QualifyingScheduleList
                title={`Schedule — ${grade} · ${divisionLabel(meta, "B")} · League 2`}
                matches={qualB_L2}
                nameById={nameById}
                projectionMode
              />
            </div>
          ) : (
            <QualifyingScheduleList
              title={`Schedule — ${grade} · ${divisionLabel(meta, "B")}`}
              matches={qualB}
              nameById={nameById}
              projectionMode
            />
          )
        ) : null}
      </section> : null}

      {showRedemption ? <section className="space-y-6">
        <h2 className={h2Major}>Redemption bracket — {grade}</h2>
        <p className={bodyMuted}>
          Knockout for teams below the direct-qualifier cut (3 min regulation, extra period if
          tied, then sudden death). The winner may be added to the main finals when admins generate
          the bracket.
        </p>
        {isUnified ? (
          <div className="space-y-2">
            {resMetaU?.completedWinnerTeamId ? (
              <p className="text-base font-medium text-cup-winBright">
                Redemption winner:{" "}
                {nameById.get(resMetaU.completedWinnerTeamId) ??
                  resMetaU.completedWinnerTeamId}
              </p>
            ) : null}
            <div className="min-w-0 overflow-x-auto">
              <BracketRounds
                matches={resListU}
                nameById={nameById}
                projectionMode
                emptyMessage="No redemption bracket for this grade yet (or a single below-cut team was auto-crowned with no matches)."
                winnerBannerTitle="Winner"
                winnerBannerIcon="🪶"
                footerHint="3 min regulation + one extra period if tied (+ sudden death if needed)"
              />
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="min-w-0">
              <h3 className={h3Bracket}>{grade} · {divisionLabel(meta, "A")} redemption</h3>
              {resMetaA?.completedWinnerTeamId ? (
                <p className="text-base font-medium text-cup-winBright mb-2">
                  Winner:{" "}
                  {nameById.get(resMetaA.completedWinnerTeamId) ??
                    resMetaA.completedWinnerTeamId}
                </p>
              ) : null}
              <div className="min-w-0 overflow-x-auto">
                <BracketRounds
                  matches={resListA}
                  nameById={nameById}
                  projectionMode
                  emptyMessage="No redemption bracket for this pool yet."
                  winnerBannerTitle="Winner"
                  winnerBannerIcon="🪶"
                  footerHint="3 min regulation + one extra period if tied (+ sudden death if needed)"
                />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className={h3Bracket}>{grade} · {divisionLabel(meta, "B")} redemption</h3>
              {resMetaB?.completedWinnerTeamId ? (
                <p className="text-base font-medium text-cup-winBright mb-2">
                  Winner:{" "}
                  {nameById.get(resMetaB.completedWinnerTeamId) ??
                    resMetaB.completedWinnerTeamId}
                </p>
              ) : null}
              <div className="min-w-0 overflow-x-auto">
                <BracketRounds
                  matches={resListB}
                  nameById={nameById}
                  projectionMode
                  emptyMessage="No redemption bracket for this pool yet."
                  winnerBannerTitle="Winner"
                  winnerBannerIcon="🪶"
                  footerHint="3 min regulation + one extra period if tied (+ sudden death if needed)"
                />
              </div>
            </div>
          </div>
        )}
      </section> : null}

      {showFinals ? <section>
        <h2 className={`${h2Major} mb-3`}>
          Finals bracket — {isInterSchool ? "Interschool" : grade}
        </h2>
        {!isInterSchool && japanCupChallengeDisplay ? (
          <div className="mb-6">
            <JapanCupChallengeMatchup
              match={japanCupChallengeDisplay}
              nameById={nameById}
              championName={finalsGradeMeta?.japanCupChallenge?.championName}
              projectionMode
            />
          </div>
        ) : null}
        {isUnified ? (
          <div className="min-w-0 overflow-x-auto">
            <BracketRounds
              matches={finalsUnified}
              nameById={nameById}
              projectionMode
              finalsGradeMeta={isInterSchool ? null : finalsGradeMeta}
              gradeId={grade}
              hideJapanCupLabels={isInterSchool}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className={h3Bracket}>
              {grade} · {divisionLabel(meta, "A")} + {divisionLabel(meta, "B")} to grade champion
            </h3>
            <div className="min-w-0 overflow-x-auto">
              <BracketRounds
                matches={finalsSplitMerged}
                nameById={nameById}
                projectionMode
                finalsGradeMeta={isInterSchool ? null : finalsGradeMeta}
                gradeId={grade}
                hideJapanCupLabels={isInterSchool}
              />
            </div>
          </div>
        )}
      </section> : null}
    </div>
  );
}

const LIVE_MODE_LABELS: Record<LiveViewMode, string> = {
  overview: "Overview",
  standings: "Standings",
  schedule: "Schedule",
  redemption: "Redemption",
  finals: "Finals",
};

function LiveDisplayToolbar({
  mode,
  modes,
  rotating,
  connected,
  lastUpdated,
  onMode,
  onToggleRotation,
}: {
  mode: LiveViewMode;
  modes: LiveViewMode[];
  rotating: boolean;
  connected: boolean | null;
  lastUpdated: number;
  onMode: (mode: LiveViewMode) => void;
  onToggleRotation: () => void;
}) {
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen can be unavailable when browser or device policy blocks it.
    }
  }

  return (
    <div className="sticky top-2 z-40 rounded-xl border border-cup-stageBorder bg-cup-stageElevated/95 p-2 shadow-xl shadow-black/20 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" aria-label="Live display section">
          {modes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onMode(item)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                mode === item
                  ? "bg-cup-signal text-cup-stage"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {LIVE_MODE_LABELS[item]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={connected === false ? "text-red-300" : "text-green-300"}>
            {connected === null ? "Connecting…" : connected ? "● Live data" : "● Offline · showing saved data"}
          </span>
          <span className="hidden text-slate-500 md:inline">
            Updated {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastUpdated))}
          </span>
          <button type="button" onClick={onToggleRotation} className={`rounded-lg border px-3 py-2 font-semibold ${rotating ? "border-cup-signal bg-cup-signal/10 text-cup-signal" : "border-cup-stageBorder text-slate-300"}`}>
            {rotating ? "Pause rotation" : "Auto rotate"}
          </button>
          <button type="button" onClick={() => void toggleFullscreen()} className="rounded-lg border border-cup-stageBorder px-3 py-2 font-semibold text-slate-300">
            Full screen
          </button>
        </div>
      </div>
      {rotating ? <div className="live-rotation-progress mt-2 h-0.5 rounded-full bg-cup-signal" /> : null}
    </div>
  );
}

function LiveMatchSpotlight({
  live,
  upcoming,
  nameById,
  now,
}: {
  live: LiveTimelineMatch[];
  upcoming: LiveTimelineMatch[];
  nameById: Map<string, string>;
  now: number;
}) {
  const featured = live[0] ?? upcoming[0];
  const queue = live.length > 0 ? upcoming : upcoming.slice(1);
  const teamName = (id?: string) => (id ? nameById.get(id) ?? id : "TBD");
  const time = (match: LiveTimelineMatch) =>
    match.schedule
      ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(match.schedule.startAt))
      : "TBD";

  return (
    <section className="overflow-hidden rounded-2xl border border-cup-stageBorder bg-cup-stageElevated shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cup-stageBorder bg-black/20 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-black tracking-widest ${live.length > 0 ? "animate-pulse bg-red-500 text-white" : "bg-cup-signal text-cup-stage"}`}>
            {live.length > 0 ? "LIVE" : "NEXT"}
          </span>
          <span className="text-sm font-semibold text-slate-300">{featured?.stage ?? "Tournament overview"}</span>
        </div>
        <time className="font-displayWide text-xl font-semibold tabular-nums text-cup-signal">
          {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(now))}
          <span className="ml-2 text-xs font-normal text-slate-400">JST</span>
        </time>
      </div>
      {featured ? (
        <div className="grid items-center gap-4 px-5 py-7 md:grid-cols-[1fr_auto_1fr] md:px-10 md:py-10">
          <div className="text-center md:text-right"><p className="font-displayWide text-2xl font-bold text-slate-50 md:text-4xl">{teamName(featured.teamAId)}</p></div>
          <div className="text-center">
            {featured.score ? <p className="font-display text-4xl font-black tabular-nums text-cup-signal md:text-6xl">{featured.score}</p> : <p className="font-display text-2xl font-semibold text-slate-400">VS</p>}
            <p className="mt-2 text-sm font-semibold text-slate-400">{time(featured)}{featured.schedule?.court ? ` · ${featured.schedule.court}` : ""}</p>
          </div>
          <div className="text-center md:text-left"><p className="font-displayWide text-2xl font-bold text-slate-50 md:text-4xl">{teamName(featured.teamBId)}</p></div>
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-lg text-slate-400">No scheduled matches yet.</p>
      )}
      {queue.length > 0 ? (
        <div className="border-t border-cup-stageBorder px-5 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Coming up</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {queue.map((match) => (
              <div key={match.id} className="rounded-xl border border-cup-stageBorder bg-black/15 px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-cup-signalMuted">{time(match)}</span><span className="truncate text-slate-500">{match.schedule?.court ?? match.stage}</span></div>
                <p className="mt-1 truncate font-semibold text-slate-100">{teamName(match.teamAId)} <span className="font-normal text-slate-500">vs</span> {teamName(match.teamBId)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
