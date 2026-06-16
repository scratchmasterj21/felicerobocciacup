import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { subscribeStudents, subscribeFinalsGradeMeta } from "@/lib/firebase/fairPlayService";
import type { StudentRecord } from "@/lib/firebase/tournamentService";
import type { FinalsGradeMeta } from "@/lib/tournament/japanCupChallenge";

const LIVE_FALLBACK_LOGO_SRC = "https://i.imgur.com/RpJzD9D.png";

export function ViewerPage() {
  const [tournamentId, setTournamentId] = useTournamentId();
  const [searchParams] = useSearchParams();
  const [grade, setGrade] = useState<string>("G1");
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

  useEffect(() => {
    const tid = searchParams.get("tournamentId");
    if (tid) setTournamentId(tid);
  }, [searchParams, setTournamentId]);

  useEffect(() => {
    const g = parseViewerDisplayParams(searchParams.toString()).grade;
    if (g) setGrade(g);
  }, [searchParams]);

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

  const isUnified =
    meta?.qualifyingMode === "unified" ||
    meta?.tournamentKind === "interSchool";
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

  return (
    <div className="projection-shell space-y-10 rounded-2xl px-2 py-3 md:px-4 md:py-5">
      <header className="text-center border-b border-cup-stageBorder pb-6 mb-2">
        <h1 className="font-display text-3xl md:text-5xl font-semibold text-slate-50 tracking-tight flex justify-center">
          {meta?.name?.trim() ? (
            meta.name.trim()
          ) : (
            <img
              src={LIVE_FALLBACK_LOGO_SRC}
              alt="Felice Roboccia Cup"
              className="max-h-[min(22vh,200px)] w-auto object-contain mx-auto"
              decoding="async"
            />
          )}
        </h1>
        <p className="font-displayWide text-cup-signal text-xl md:text-3xl mt-3 font-semibold tracking-wide">
          {grade}
        </p>
        {meta && Number.isFinite(Number(meta.schoolYear)) ? (
          <p className="text-slate-400 text-lg mt-1 tabular-nums">{meta.schoolYear}</p>
        ) : null}
      </header>

      {isUnified ? (
        <p className={bodyMutedNarrow}>
          Unified preliminary: one league in Pool A; Pool B is not used for this tournament.
        </p>
      ) : null}

      {fairPlayEnabled ? (
        <p className={bodyMutedNarrow}>
          Preliminary standings only: <strong>Total</strong> = match points + team Fair Play (sum
          of each student&apos;s share of 15). Finals matches are not scored with Fair Play.
        </p>
      ) : null}

      <section className={isUnified ? "grid gap-8" : "grid md:grid-cols-2 gap-8"}>
        <div>
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
          <div>
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
      </section>

      <section className={isUnified ? "grid gap-8" : "grid md:grid-cols-2 gap-8"}>
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
      </section>

      <section className="space-y-6">
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
            <div className="min-w-0 overflow-x-hidden">
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
              <div className="min-w-0 overflow-x-hidden">
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
              <div className="min-w-0 overflow-x-hidden">
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
      </section>

      <section>
        <h2 className={`${h2Major} mb-3`}>Finals bracket — {grade}</h2>
        {japanCupChallengeDisplay ? (
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
          <div className="min-w-0 overflow-x-hidden">
            <BracketRounds
              matches={finalsUnified}
              nameById={nameById}
              projectionMode
              finalsGradeMeta={finalsGradeMeta}
              gradeId={grade}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className={h3Bracket}>
              {grade} · {divisionLabel(meta, "A")} + {divisionLabel(meta, "B")} to grade champion
            </h3>
            <div className="min-w-0 overflow-x-hidden">
              <BracketRounds
                matches={finalsSplitMerged}
                nameById={nameById}
                projectionMode
                finalsGradeMeta={finalsGradeMeta}
                gradeId={grade}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
