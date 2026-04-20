import type { FinalMatchData } from "@/lib/tournament/types";
import { formatScheduleTokyo } from "@/lib/schedule/tokyo";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getBracketMatchDisplay } from "@/lib/tournament/bracketMatchDisplay";

const CONNECT_INSET = 10;

export function BracketRounds({
  matches,
  nameById,
  emptyMessage = "No finals bracket for this grade yet.",
  winnerBannerTitle = "Champion",
  footerHint,
  projectionMode,
}: {
  matches: FinalMatchData[];
  nameById: Map<string, string>;
  /** Shown when `matches` is empty (e.g. resurrection vs main finals). */
  emptyMessage?: string;
  /** Small caps label above the winner name (e.g. "Winner" for resurrection). */
  winnerBannerTitle?: string;
  /** Default footer when final match has no schedule (e.g. resurrection timing copy). */
  footerHint?: string;
  /** Dark arena styling for live projection (`?display=1`). */
  projectionMode?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rounds = useMemo(() => {
    const m = new Map<number, FinalMatchData[]>();
    for (const x of matches) {
      const arr = m.get(x.roundIndex) ?? [];
      arr.push(x);
      m.set(x.roundIndex, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.slotInRound - b.slotInRound);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);
  const byId = useMemo(
    () => new Map(matches.map((m) => [m.id, m] as const)),
    [matches]
  );
  const byRoundAndSlot = useMemo(() => {
    const m = new Map<string, FinalMatchData>();
    for (const match of matches) {
      m.set(`${match.roundIndex}:${match.slotInRound}`, match);
    }
    return m;
  }, [matches]);

  if (matches.length === 0) {
    return (
      <p
        className={
          projectionMode
            ? "text-sm text-slate-400 py-4 border border-dashed border-cup-stageBorder rounded-xl px-4 bg-cup-stageElevated/60"
            : "text-sm text-cup-muted py-4 border border-dashed border-cup-line rounded-lg px-4"
        }
      >
        {emptyMessage}
      </p>
    );
  }

  const label = (tid?: string) =>
    tid ? nameById.get(tid) ?? tid : "—";
  const roundCount = rounds.length;
  const firstRoundCount = rounds[0]?.[1].length ?? 0;

  // Layout constants tuned for TV / projector readability.
  const CARD_W = 230;
  const CARD_H = 90;
  const ROW_GAP = 26;
  const ROUND_GAP = 150;
  const PAD_X = 24;
  const PAD_Y = 40;
  /** Space for trophy + winner band + round labels below (no overlap). */
  const HEADER_H = 138;
  const ROUND_LABEL_TOP = 112;
  const INNER_H = Math.max(1, firstRoundCount) * CARD_H + Math.max(0, firstRoundCount - 1) * ROW_GAP;
  const canvasW = PAD_X * 2 + roundCount * CARD_W + Math.max(0, roundCount - 1) * ROUND_GAP;

  const laneHeight = CARD_H + ROW_GAP;
  const centerY = (roundIndex: number, slotInRound: number) => {
    const step = laneHeight * Math.pow(2, roundIndex);
    return HEADER_H + PAD_Y + step / 2 + slotInRound * step;
  };
  /** Room for wrapped schedule/hint copy (narrow canvas → many lines). */
  const FOOTER_BAND_H = 80;
  const FOOTER_BOTTOM_INSET = 8;
  const maxCardBottom = Math.max(
    ...matches.map((m) => centerY(m.roundIndex, m.slotInRound) + CARD_H / 2)
  );
  const minHFromCards = maxCardBottom + 12 + FOOTER_BAND_H + FOOTER_BOTTOM_INSET;
  const heuristicH = HEADER_H + PAD_Y + INNER_H + PAD_Y;
  const canvasH = Math.max(heuristicH, minHFromCards);

  /** Content width inside `p-3` padding (12px × 2). */
  const innerAvailable = Math.max(0, containerWidth - 24);
  /** Slight slack avoids subpixel overflow; never below 1px numerator when measured. */
  const fitW = Math.max(1, innerAvailable - 4);
  const scale = innerAvailable > 0 ? Math.min(1, fitW / canvasW) : 1;
  const scaledH = Math.max(200, canvasH * scale);

  const leftX = (roundIndex: number) => PAD_X + roundIndex * (CARD_W + ROUND_GAP);
  const matchByRoundAndSlot = (roundIndex: number, slotInRound: number) =>
    byRoundAndSlot.get(`${roundIndex}:${slotInRound}`);

  const lastRoundMatches = rounds[roundCount - 1]?.[1] ?? [];
  const finalMatch = lastRoundMatches[0];
  const champion = finalMatch?.winnerTeamId ? label(finalMatch.winnerTeamId) : null;

  const defaultFooter = footerHint ?? "16 min regulation + 8 min extra if tied";
  const p = Boolean(projectionMode);
  const strokeBase = p ? "#64748b" : "#8a8a8a";
  /** Filled connector path when a winner is known — keep red in projection for clear progression. */
  const strokeProg = "#ff1f1f";

  return (
    <div
      ref={containerRef}
      className={
        p
          ? "rounded-xl border border-cup-stageBorder bg-cup-stageElevated p-3 max-w-full overflow-hidden shadow-lg shadow-black/25"
          : "rounded-xl border border-cup-line bg-[#efefef] p-3 max-w-full overflow-hidden"
      }
    >
      <div
        className="relative mx-auto overflow-hidden"
        style={{ width: "100%", maxWidth: "100%", height: `${scaledH}px` }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: `${canvasW}px`,
            height: `${canvasH}px`,
            transform: `scale(${scale})`,
          }}
        >
          <div className="absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-1 pointer-events-none">
            <div className="text-3xl leading-none" aria-hidden>
              🏆
            </div>
            <div
              className={
                p
                  ? "rounded-md bg-cup-signal text-cup-stage px-4 py-2 text-center shadow-md w-full max-w-[min(280px,calc(100%-32px))] min-w-0"
                  : "rounded-md bg-[#c9a800] text-white px-4 py-2 text-center shadow-sm w-full max-w-[min(280px,calc(100%-32px))] min-w-0"
              }
            >
              <div
                className={
                  p
                    ? "text-[11px] uppercase tracking-[0.16em] text-cup-stage/80"
                    : "text-[11px] uppercase tracking-[0.16em] opacity-85"
                }
              >
                {winnerBannerTitle}
              </div>
              <div className="text-2xl font-display font-semibold">
                {champion ?? "TBD"}
              </div>
            </div>
          </div>

          <svg
            className="absolute inset-0 z-0"
            width={canvasW}
            height={canvasH}
            viewBox={`0 0 ${canvasW} ${canvasH}`}
            aria-hidden
          >
            {rounds.flatMap(([roundIndex, ms]) =>
              ms.flatMap((m, idx) => {
                const nextRound = roundIndex + 1;
                if (nextRound >= roundCount) return [];
                const sourceX = leftX(roundIndex) + CARD_W;
                const sourceY = centerY(roundIndex, m.slotInRound);
                const targetSlot = Math.floor(m.slotInRound / 2);
                const next =
                  m.nextMatchId
                    ? byId.get(m.nextMatchId)
                    : matchByRoundAndSlot(nextRound, targetSlot);
                if (!next) return [];
                const targetX = leftX(nextRound);
                const targetXConnect = targetX - CONNECT_INSET;
                const targetY = centerY(next.roundIndex, next.slotInRound);
                const midX = sourceX + ROUND_GAP / 2;
                const path = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetXConnect} ${targetY}`;
                const pathLen =
                  Math.abs(midX - sourceX) +
                  Math.abs(targetY - sourceY) +
                  Math.abs(targetXConnect - midX);
                const active = Boolean(m.winnerTeamId);
                return [
                  <path
                    key={`${m.bracketGroup ?? "U"}-${m.id}-${m.roundIndex}-${m.slotInRound}-${idx}-base`}
                    d={path}
                    fill="none"
                    stroke={strokeBase}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />,
                  <path
                    key={`${m.bracketGroup ?? "U"}-${m.id}-${m.roundIndex}-${m.slotInRound}-${idx}-progress`}
                    d={path}
                    fill="none"
                    stroke={strokeProg}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={pathLen}
                    strokeDashoffset={active ? 0 : pathLen}
                    style={{ transition: "stroke-dashoffset 420ms ease-out" }}
                  />,
                ];
              })
            )}
          </svg>

          {rounds.map(([roundIndex, ms]) => (
            <div key={roundIndex}>
              <div
                className={
                  p
                    ? "absolute z-10 -translate-x-1/2 text-[11px] uppercase tracking-[0.14em] font-semibold text-cup-signal pointer-events-none"
                    : "absolute z-10 -translate-x-1/2 text-[11px] uppercase tracking-[0.14em] font-semibold text-cup-muted pointer-events-none"
                }
                style={{
                  left: `${leftX(roundIndex) + CARD_W / 2}px`,
                  top: `${ROUND_LABEL_TOP}px`,
                }}
              >
                Round {roundIndex + 1}
              </div>
              {ms.map((m, idx) => {
                const x = leftX(roundIndex);
                const y = centerY(roundIndex, m.slotInRound) - CARD_H / 2;
                const aWinner = m.winnerTeamId && m.winnerTeamId === m.teamAId;
                const bWinner = m.winnerTeamId && m.winnerTeamId === m.teamBId;
                const display = getBracketMatchDisplay(m);
                const barClass =
                  display.accent === "completed"
                    ? p
                      ? "bg-cup-signal"
                      : "bg-[#ff1f1f]"
                    : display.accent === "suddenDeath"
                      ? p
                        ? "bg-amber-400"
                        : "bg-[#f97316]"
                      : display.accent === "extra"
                        ? p
                          ? "bg-amber-300"
                          : "bg-[#f59e0b]"
                        : display.accent === "regulation"
                          ? p
                            ? "bg-sky-400"
                            : "bg-[#3b82f6]"
                          : p
                            ? "bg-slate-600"
                            : "bg-[#9f9f9f]";
                return (
                  <article
                    key={`${m.bracketGroup ?? "U"}-${m.id}-${m.roundIndex}-${m.slotInRound}-${idx}`}
                    className={
                      p
                        ? "absolute z-10 rounded-md overflow-hidden border border-cup-signal/45 shadow-[0_2px_8px_rgba(0,0,0,0.35)] bg-cup-stage/95"
                        : "absolute z-10 rounded-md overflow-hidden border border-[#6f6f6f] shadow-[0_1px_2px_rgba(0,0,0,0.16)] bg-[#ead670]"
                    }
                    style={{ left: `${x}px`, top: `${y}px`, width: `${CARD_W}px`, height: `${CARD_H}px` }}
                    title={display.subline ? `${m.id} • ${display.subline}` : m.id}
                  >
                    <div
                      className={`h-1 ${barClass}`}
                      style={{ transition: "background-color 320ms ease" }}
                    />
                    <div
                      className={
                        p
                          ? "px-3 pt-1.5 pb-1 text-[11px] font-mono text-slate-500"
                          : "px-3 pt-1.5 pb-1 text-[11px] font-mono text-[#3b3b3b]"
                      }
                    >
                      {m.id}
                    </div>
                    <div className="px-3 text-sm leading-tight">
                      <div
                        className={`truncate ${
                          aWinner
                            ? p
                              ? "font-bold text-cup-signal"
                              : "font-bold text-[#8a120f]"
                            : p
                              ? "text-slate-100"
                              : "text-cup-ink"
                        }`}
                      >
                        {label(m.teamAId)}
                      </div>
                      <div
                        className={`truncate ${
                          bWinner
                            ? p
                              ? "font-bold text-cup-signal"
                              : "font-bold text-[#8a120f]"
                            : p
                              ? "text-slate-100"
                              : "text-cup-ink"
                        }`}
                      >
                        {label(m.teamBId)}
                      </div>
                    </div>
                    {display.subline ? (
                      <div
                        className={
                          p
                            ? "px-3 pb-1.5 pt-1 text-[11px] leading-tight text-slate-400 line-clamp-2"
                            : "px-3 pb-1.5 pt-1 text-[11px] leading-tight text-[#4b5563] line-clamp-2"
                        }
                      >
                        {display.subline}
                      </div>
                    ) : (
                      <div className="h-[18px]" />
                    )}
                  </article>
                );
              })}
            </div>
          ))}

          <div
            className={
              p
                ? "absolute left-4 right-4 z-10 text-[11px] text-slate-400 leading-snug overflow-y-auto"
                : "absolute left-4 right-4 z-10 text-[11px] text-cup-muted leading-snug overflow-y-auto"
            }
            style={{ bottom: FOOTER_BOTTOM_INSET, maxHeight: FOOTER_BAND_H }}
          >
            {finalMatch?.schedule?.startAt != null
              ? formatScheduleTokyo(finalMatch.schedule.startAt, {
                  durationRegulationMinutes: finalMatch.schedule.durationRegulationMinutes,
                  court: finalMatch.schedule.court,
                  finalsHint: true,
                })
              : defaultFooter}
          </div>
        </div>
      </div>
    </div>
  );
}
