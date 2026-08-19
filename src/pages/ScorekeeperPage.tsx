import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { onValue, ref } from "firebase/database";
import { RequireAuth } from "@/components/RequireAuth";
import { useTournamentId } from "@/hooks/useTournamentId";
import { getDb } from "@/lib/firebase/config";
import {
  completeQualifyingMatch,
  submitFinalExtraEight,
  submitFinalRegulation,
  submitSuddenDeathCloser,
  submitResurrectionRegulation,
  submitResurrectionExtraEight,
  submitResurrectionSuddenDeathCloser,
  subscribeFinalMatches,
  subscribeQualifyingMatches,
  subscribeResurrectionMatches,
  subscribeTeams,
  subscribeTournamentMeta,
  type TeamRecord,
  type TournamentMeta,
} from "@/lib/firebase/tournamentService";
import { ADMIN_APP_BASE_PATH } from "@/lib/auth/admin";
import { compareQualifyingByScheduleThenRound } from "@/lib/schedule/matchSort";
import { formatScheduleTokyo } from "@/lib/schedule/tokyo";
import { regulationTotals } from "@/lib/tournament/roundRobin";
import type { FinalMatchData, QualifyingMatchData, RegulationScores, ResurrectionPoolGroup } from "@/lib/tournament/types";
import { gradeLabel, normalizeWorkingGrade, workingGradesForTournament } from "@/lib/tournament/grades";

type StageFilter = "all" | "qualifying" | "resurrection" | "finals";
type MatchFilter = "unfinished" | "completed" | "all";

type RegulationDraft = {
  round1: { scoreA: string; scoreB: string };
  round2: { scoreA: string; scoreB: string };
};

const draftFromRegulation = (value?: RegulationScores): RegulationDraft => ({
  round1: { scoreA: value ? String(value.round1.scoreA) : "", scoreB: value ? String(value.round1.scoreB) : "" },
  round2: { scoreA: value ? String(value.round2.scoreA) : "", scoreB: value ? String(value.round2.scoreB) : "" },
});

function parseRegulationDraft(value: RegulationDraft): RegulationScores | null {
  const values = [value.round1.scoreA, value.round1.scoreB, value.round2.scoreA, value.round2.scoreB];
  if (!values.every((item) => /^\d+$/.test(item))) return null;
  return {
    round1: { scoreA: Number(value.round1.scoreA), scoreB: Number(value.round1.scoreB) },
    round2: { scoreA: Number(value.round2.scoreA), scoreB: Number(value.round2.scoreB) },
  };
}

function ScorekeeperContent() {
  const [searchParams] = useSearchParams();
  const [tournamentId, setTournamentId] = useTournamentId();
  const [meta, setMeta] = useState<TournamentMeta | null>(null);
  const [teams, setTeams] = useState<Record<string, TeamRecord> | null>(null);
  const [qualifying, setQualifying] = useState<Record<string, QualifyingMatchData> | null>(null);
  const [finals, setFinals] = useState<Record<string, FinalMatchData> | null>(null);
  const [resurrection, setResurrection] = useState<Record<string, FinalMatchData>>({});
  const [grade, setGrade] = useState("G1");
  const [stage, setStage] = useState<StageFilter>("all");
  const [filter, setFilter] = useState<MatchFilter>("unfinished");
  const [court, setCourt] = useState("all");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fromUrl = searchParams.get("tournamentId")?.trim();
    if (fromUrl) setTournamentId(fromUrl);
  }, [searchParams, setTournamentId]);
  useEffect(() => subscribeTournamentMeta(tournamentId, setMeta), [tournamentId]);
  useEffect(() => subscribeTeams(tournamentId, setTeams), [tournamentId]);
  useEffect(() => subscribeQualifyingMatches(tournamentId, setQualifying), [tournamentId]);
  useEffect(() => subscribeFinalMatches(tournamentId, grade, setFinals), [tournamentId, grade]);
  useEffect(() => {
    const byGroup: Partial<Record<ResurrectionPoolGroup, Record<string, FinalMatchData>>> = {};
    const publish = () => setResurrection(Object.assign({}, byGroup.A, byGroup.B, byGroup.U));
    const subscriptions = (["A", "B", "U"] as const).map((group) =>
      subscribeResurrectionMatches(tournamentId, grade, group, (matches) => {
        byGroup[group] = Object.fromEntries(
          Object.entries(matches ?? {}).map(([id, match]) => [id, { ...match, bracketGroup: group }])
        );
        publish();
      })
    );
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, [tournamentId, grade]);
  useEffect(() => {
    if (meta) setGrade((current) => normalizeWorkingGrade(meta, current));
  }, [meta]);
  useEffect(() => onValue(ref(getDb(), ".info/connected"), (snap) => setConnected(snap.val() === true)), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const grades = workingGradesForTournament(meta);
  const teamName = (id?: string) => (id ? teams?.[id]?.name ?? id : "TBD");
  const qualList = useMemo(
    () =>
      Object.values(qualifying ?? {})
        .filter((match) => match.gradeId === grade)
        .sort(compareQualifyingByScheduleThenRound),
    [qualifying, grade]
  );
  const finalList = useMemo(
    () =>
      Object.values(finals ?? {}).sort((a, b) => {
        const aTime = a.schedule?.startAt ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.schedule?.startAt ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime || a.roundIndex - b.roundIndex || a.slotInRound - b.slotInRound;
      }),
    [finals]
  );
  const resurrectionList = useMemo(
    () => Object.values(resurrection).sort((a, b) => (a.schedule?.startAt ?? Number.MAX_SAFE_INTEGER) - (b.schedule?.startAt ?? Number.MAX_SAFE_INTEGER) || a.roundIndex - b.roundIndex),
    [resurrection]
  );
  const courts = useMemo(() => [...new Set([...qualList, ...resurrectionList, ...finalList].map((match) => match.schedule?.court?.trim()).filter((value): value is string => Boolean(value)))].sort(), [qualList, resurrectionList, finalList]);
  const isCurrent = (match: { status: string; schedule?: { startAt: number; durationRegulationMinutes?: number } }, fallbackMinutes: number) => Boolean(match.status !== "COMPLETED" && match.schedule && match.schedule.startAt <= now && now < match.schedule.startAt + (match.schedule.durationRegulationMinutes ?? fallbackMinutes) * 60_000);
  const applyStatus = <T extends { status: string; schedule?: { startAt: number; durationRegulationMinutes?: number; court?: string } }>(list: T[], fallbackMinutes: number) => list.filter((m) => (filter === "all" || (filter === "completed") === (m.status === "COMPLETED")) && (court === "all" || m.schedule?.court === court)).sort((a, b) => Number(isCurrent(b, fallbackMinutes)) - Number(isCurrent(a, fallbackMinutes)));
  const visibleQual = stage === "all" || stage === "qualifying" ? applyStatus(qualList, 16) : [];
  const visibleResurrection = stage === "all" || stage === "resurrection" ? applyStatus(resurrectionList, 3) : [];
  const visibleFinals = stage === "all" || stage === "finals" ? applyStatus(finalList, 16) : [];
  const unfinishedCount = [...qualList, ...resurrectionList, ...finalList].filter((m) => m.status !== "COMPLETED").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <header className="rounded-2xl bg-cup-ink p-5 text-cup-paper shadow-lg md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cup-accent">Scorekeeper focus</p>
            <h1 className="mt-1 font-display text-2xl font-semibold md:text-3xl">{meta?.name ?? "Tournament scoring"}</h1>
            <p className="mt-2 text-sm text-white/65">{unfinishedCount} matches still need a final result</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${connected ? "bg-green-400/20 text-green-200" : "bg-red-400/20 text-red-200"}`}>
              {connected === null ? "Checking connection…" : connected ? "● Connected" : "● Offline"}
            </span>
            <Link to={`${ADMIN_APP_BASE_PATH}?tournamentId=${encodeURIComponent(tournamentId)}`} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20">
              Full admin
            </Link>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 grid gap-3 rounded-xl border border-cup-line bg-[#f7f5f0]/95 p-3 shadow-sm backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Grade" value={grade} onChange={setGrade} options={grades.map((g) => ({ value: g, label: gradeLabel(g, meta) }))} />
        <Select label="Stage" value={stage} onChange={(v) => setStage(v as StageFilter)} options={[{ value: "all", label: "All stages" }, { value: "qualifying", label: "Preliminary" }, { value: "resurrection", label: "Redemption" }, { value: "finals", label: "Finals" }]} />
        <Select label="Show" value={filter} onChange={(v) => setFilter(v as MatchFilter)} options={[{ value: "unfinished", label: "Needs score" }, { value: "completed", label: "Completed" }, { value: "all", label: "All matches" }]} />
        <Select label="Court" value={court} onChange={setCourt} options={[{ value: "all", label: "All courts" }, ...courts.map((item) => ({ value: item, label: item }))]} />
      </div>

      {visibleQual.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Preliminary</h2>
          {visibleQual.map((match) => <QualifyingScoreCard key={match.id} tournamentId={tournamentId} match={match} teamA={teamName(match.teamAId)} teamB={teamName(match.teamBId)} connected={connected !== false} current={isCurrent(match, 16)} />)}
        </section>
      ) : null}

      {visibleResurrection.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Redemption</h2>
          {visibleResurrection.map((match) => <ResurrectionScoreCard key={`${match.bracketGroup}:${match.id}`} tournamentId={tournamentId} match={match} group={match.bracketGroup ?? "U"} teamA={teamName(match.teamAId)} teamB={teamName(match.teamBId)} connected={connected !== false} current={isCurrent(match, 3)} />)}
        </section>
      ) : null}

      {visibleFinals.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Finals</h2>
          {visibleFinals.map((match) => <FinalScoreCard key={match.id} tournamentId={tournamentId} match={match} teamA={teamName(match.teamAId)} teamB={teamName(match.teamBId)} connected={connected !== false} current={isCurrent(match, 16)} />)}
        </section>
      ) : null}

      {visibleQual.length === 0 && visibleResurrection.length === 0 && visibleFinals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-cup-line bg-white p-10 text-center text-sm text-cup-muted">No matches match these filters.</div>
      ) : null}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="text-xs font-medium text-cup-muted"><span className="mb-1 block">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-cup-line bg-white px-3 py-2 text-sm text-cup-ink">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function MatchHeader({ match, teamA, teamB }: { match: QualifyingMatchData | FinalMatchData; teamA: string; teamB: string }) {
  const duration = match.schedule?.durationRegulationMinutes ?? ("matchKind" in match && match.matchKind === "resurrection" ? 3 : 16);
  const current = Boolean(match.status !== "COMPLETED" && match.schedule && match.schedule.startAt <= Date.now() && Date.now() < match.schedule.startAt + duration * 60_000);
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-cup-muted">{match.schedule ? formatScheduleTokyo(match.schedule.startAt, match.schedule) : "Time not scheduled"}</p><div className="mt-1 flex items-center gap-3 text-lg font-semibold"><span>{teamA}</span><span className="text-sm font-normal text-cup-muted">vs</span><span>{teamB}</span></div></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${current ? "animate-pulse bg-red-600 text-white" : match.status === "COMPLETED" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{current ? "● NOW" : match.status === "COMPLETED" ? "Completed" : "Needs score"}</span></div>;
}

function RegulationInputs({ value, onChange, disabled }: { value: RegulationDraft; onChange: (value: RegulationDraft) => void; disabled: boolean }) {
  const field = (round: "round1" | "round2", side: "scoreA" | "scoreB", label: string) => <label className="text-center text-xs text-cup-muted"><span className="mb-1 block">{label}</span><input type="number" min="0" inputMode="numeric" disabled={disabled} placeholder="—" value={value[round][side]} onChange={(e) => onChange({ ...value, [round]: { ...value[round], [side]: e.target.value } })} className="h-12 w-16 rounded-lg border border-cup-line bg-white text-center text-xl font-semibold text-cup-ink disabled:opacity-60" /></label>;
  return <div className="flex flex-wrap gap-3">{field("round1", "scoreA", "A · R1")}{field("round1", "scoreB", "B · R1")}{field("round2", "scoreA", "A · R2")}{field("round2", "scoreB", "B · R2")}</div>;
}

function QualifyingScoreCard({ tournamentId, match, teamA, teamB, connected, current }: { tournamentId: string; match: QualifyingMatchData; teamA: string; teamB: string; connected: boolean; current: boolean }) {
  void current;
  const [scores, setScores] = useState(() => draftFromRegulation(match.regulation));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setScores(draftFromRegulation(match.regulation)), [match.regulation]);
  const parsed = parseRegulationDraft(scores);
  const dirty = JSON.stringify(scores) !== JSON.stringify(draftFromRegulation(match.regulation));
  async function save(event: FormEvent) { event.preventDefault(); if (!parsed) { setMessage("Enter all four scores before saving."); return; } if (match.status === "COMPLETED" && !window.confirm("Update this completed result? The standings may change.")) return; setBusy(true); setMessage(null); try { await completeQualifyingMatch(tournamentId, match.id, parsed); setMessage("Score saved."); } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); } finally { setBusy(false); } }
  return <form onSubmit={(e) => void save(e)} className={`rounded-xl border bg-white p-4 shadow-sm space-y-4 ${dirty ? "border-cup-accent ring-2 ring-cup-accent/10" : "border-cup-line"}`}><MatchHeader match={match} teamA={teamA} teamB={teamB} /><div className="flex flex-wrap items-end justify-between gap-4"><RegulationInputs value={scores} onChange={setScores} disabled={busy} /><div className="text-right">{dirty ? <p className="mb-1 text-xs font-semibold text-amber-700">Unsaved changes</p> : null}<button disabled={busy || !connected || !parsed || !dirty} className="h-12 rounded-lg bg-cup-accent px-6 font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : match.status === "COMPLETED" ? "Update result" : "Save result"}</button></div></div>{message ? <p role="status" className={`text-sm ${message === "Score saved." ? "font-semibold text-green-700" : "text-red-700"}`}>{message}</p> : null}</form>;
}

function FinalScoreCard({ tournamentId, match, teamA, teamB, connected, current }: { tournamentId: string; match: FinalMatchData; teamA: string; teamB: string; connected: boolean; current: boolean }) {
  void current;
  const [scores, setScores] = useState(() => draftFromRegulation(match.regulation));
  const [extraA, setExtraA] = useState(match.extra8min?.round?.scoreA ?? 0);
  const [extraB, setExtraB] = useState(match.extra8min?.round?.scoreB ?? 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const blocked = !match.teamAId || !match.teamBId;
  const totals = match.regulation ? regulationTotals(match.regulation) : null;
  const needsExtra = totals?.totalA === totals?.totalB && !match.extra8min;
  const needsSuddenDeath = match.extra8min?.status === "COMPLETED" && match.extra8min.tiedAfterExtra && match.status !== "COMPLETED";
  useEffect(() => setScores(draftFromRegulation(match.regulation)), [match.regulation]);
  const parsed = parseRegulationDraft(scores);
  const dirty = JSON.stringify(scores) !== JSON.stringify(draftFromRegulation(match.regulation));
  async function run(action: () => Promise<void>) { if (match.status === "COMPLETED" && !window.confirm("Update this completed result? A later bracket matchup may change.")) return; setBusy(true); setMessage(null); try { await action(); setMessage("Score saved."); } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); } finally { setBusy(false); } }
  return <div className={`rounded-xl border bg-white p-4 shadow-sm space-y-4 ${blocked ? "border-cup-line opacity-65" : dirty ? "border-cup-accent ring-2 ring-cup-accent/10" : "border-cup-line"}`}><MatchHeader match={match} teamA={teamA} teamB={teamB} />{blocked ? <p className="text-sm text-cup-muted">Waiting for teams from an earlier match.</p> : <><form onSubmit={(e) => { e.preventDefault(); if (parsed) void run(() => submitFinalRegulation(tournamentId, match.gradeId, match, parsed)); }} className="flex flex-wrap items-end justify-between gap-4"><RegulationInputs value={scores} onChange={setScores} disabled={busy} /><div className="text-right">{dirty ? <p className="mb-1 text-xs font-semibold text-amber-700">Unsaved changes</p> : null}<button disabled={busy || !connected || !parsed || !dirty} className="h-12 rounded-lg bg-cup-accent px-6 font-semibold text-white disabled:opacity-40">{match.regulation ? "Update regulation" : "Save regulation"}</button></div></form>{needsExtra ? <form onSubmit={(e) => { e.preventDefault(); void run(() => submitFinalExtraEight(tournamentId, match.gradeId, match, { scoreA: extraA, scoreB: extraB })); }} className="flex flex-wrap items-end gap-3 border-t border-cup-line pt-4"><p className="w-full text-sm font-semibold">Regulation tied — enter extra time</p><NumberBox label="A · Extra" value={extraA} onChange={setExtraA} /><NumberBox label="B · Extra" value={extraB} onChange={setExtraB} /><button disabled={busy || !connected} className="h-12 rounded-lg bg-cup-ink px-6 font-semibold text-white disabled:opacity-40">Save extra time</button></form> : null}{needsSuddenDeath ? <div className="border-t border-cup-line pt-4"><p className="mb-3 text-sm font-semibold">Extra time tied — which team was closer?</p><div className="flex flex-wrap gap-2">{(["A", "B", "TIE"] as const).map((closer) => <button key={closer} type="button" disabled={busy || !connected} onClick={() => void run(() => submitSuddenDeathCloser(tournamentId, match.gradeId, match, closer))} className="h-11 rounded-lg border border-cup-line bg-cup-paper px-5 font-semibold disabled:opacity-40">{closer === "TIE" ? "Tie · next cycle" : `${closer} closer`}</button>)}</div></div> : null}</>}{message ? <p role="status" className={`text-sm ${message === "Score saved." ? "font-semibold text-green-700" : "text-red-700"}`}>{message}</p> : null}</div>;
}

function ResurrectionScoreCard({ tournamentId, match, group, teamA, teamB, connected, current }: { tournamentId: string; match: FinalMatchData; group: ResurrectionPoolGroup; teamA: string; teamB: string; connected: boolean; current: boolean }) {
  void current;
  const [scoreA, setScoreA] = useState(match.regulation?.round1.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(match.regulation?.round1.scoreB ?? 0);
  const [extraA, setExtraA] = useState(match.extra8min?.round?.scoreA ?? 0);
  const [extraB, setExtraB] = useState(match.extra8min?.round?.scoreB ?? 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const blocked = !match.teamAId || !match.teamBId;
  const totals = match.regulation ? regulationTotals(match.regulation) : null;
  const needsExtra = totals?.totalA === totals?.totalB && !match.extra8min;
  const needsSuddenDeath = match.extra8min?.status === "COMPLETED" && match.extra8min.tiedAfterExtra && match.status !== "COMPLETED";
  useEffect(() => {
    setScoreA(match.regulation?.round1.scoreA ?? 0);
    setScoreB(match.regulation?.round1.scoreB ?? 0);
  }, [match.regulation]);
  useEffect(() => {
    setExtraA(match.extra8min?.round?.scoreA ?? 0);
    setExtraB(match.extra8min?.round?.scoreB ?? 0);
  }, [match.extra8min]);
  async function run(action: () => Promise<void>) { if (match.status === "COMPLETED" && !window.confirm("Update this completed redemption result? A later matchup may change.")) return; setBusy(true); setMessage(null); try { await action(); setMessage("Score saved."); } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); } finally { setBusy(false); } }
  return <div className={`rounded-xl border border-cup-line bg-white p-4 shadow-sm space-y-4 ${blocked ? "opacity-65" : ""}`}><MatchHeader match={match} teamA={teamA} teamB={teamB} /><p className="text-xs font-semibold uppercase tracking-wider text-cup-muted">Pool {group} · 3-minute regulation</p>{blocked ? <p className="text-sm text-cup-muted">Waiting for teams from an earlier match.</p> : <><form onSubmit={(e) => { e.preventDefault(); void run(() => submitResurrectionRegulation(tournamentId, match.gradeId, group, match, { scoreA, scoreB })); }} className="flex flex-wrap items-end gap-3"><NumberBox label="Team A" value={scoreA} onChange={setScoreA} /><NumberBox label="Team B" value={scoreB} onChange={setScoreB} /><button disabled={busy || !connected} className="h-12 rounded-lg bg-cup-accent px-6 font-semibold text-white disabled:opacity-40">{match.regulation ? "Update regulation" : "Save regulation"}</button></form>{needsExtra ? <form onSubmit={(e) => { e.preventDefault(); void run(() => submitResurrectionExtraEight(tournamentId, match.gradeId, group, match, { scoreA: extraA, scoreB: extraB })); }} className="flex flex-wrap items-end gap-3 border-t border-cup-line pt-4"><p className="w-full text-sm font-semibold">Regulation tied — enter extra period</p><NumberBox label="A · Extra" value={extraA} onChange={setExtraA} /><NumberBox label="B · Extra" value={extraB} onChange={setExtraB} /><button disabled={busy || !connected} className="h-12 rounded-lg bg-cup-ink px-6 font-semibold text-white disabled:opacity-40">Save extra period</button></form> : null}{needsSuddenDeath ? <div className="border-t border-cup-line pt-4"><p className="mb-3 text-sm font-semibold">Extra period tied — which team was closer?</p><div className="flex flex-wrap gap-2">{(["A", "B", "TIE"] as const).map((closer) => <button key={closer} type="button" disabled={busy || !connected} onClick={() => void run(() => submitResurrectionSuddenDeathCloser(tournamentId, match.gradeId, group, match, closer))} className="h-11 rounded-lg border border-cup-line bg-cup-paper px-5 font-semibold disabled:opacity-40">{closer === "TIE" ? "Tie · next cycle" : `${closer} closer`}</button>)}</div></div> : null}</>}{message ? <p role="status" className="text-sm text-cup-muted">{message}</p> : null}</div>;
}

function NumberBox({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="text-center text-xs text-cup-muted"><span className="mb-1 block">{label}</span><input type="number" min="0" inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className="h-12 w-20 rounded-lg border border-cup-line text-center text-xl font-semibold text-cup-ink" /></label>; }

export function ScorekeeperPage() {
  return <RequireAuth><ScorekeeperContent /></RequireAuth>;
}
