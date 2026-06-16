import type { FinalMatchData } from "@/lib/tournament/types";
import type { FinalsGradeMeta } from "@/lib/tournament/japanCupChallenge";
import {
  findGradeChampionshipMatch,
  resolveJapanCupChallengeDisplayMatch,
  resolveTrueGradeChampion,
} from "@/lib/tournament/japanCupChallenge";
import { formatScheduleTokyo } from "@/lib/schedule/tokyo";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { getBracketMatchDisplay } from "@/lib/tournament/bracketMatchDisplay";

const CONNECT_INSET = 10;

export function BracketRounds({
  matches,
  nameById,
  emptyMessage = "No finals bracket for this grade yet.",
  winnerBannerTitle = "Champion",
  winnerBannerIcon = "🏆",
  footerHint,
  projectionMode,
  finalsGradeMeta,
  gradeId,
}: {
  matches: FinalMatchData[];
  nameById: Map<string, string>;
  /** Shown when `matches` is empty (e.g. redemption vs main finals). */
  emptyMessage?: string;
  /** Small caps label above the winner name (e.g. "Winner" for redemption bracket). */
  winnerBannerTitle?: string;
  /** Optional icon shown above the winner banner (e.g. 🪶 for redemption). */
  winnerBannerIcon?: string;
  /** Default footer when final match has no schedule (e.g. redemption timing copy). */
  footerHint?: string;
  /** Dark arena styling for live projection (`?display=1`). */
  projectionMode?: boolean;
  /** When Japan Cup challenge is enabled, drives true grade champion banner. */
  finalsGradeMeta?: FinalsGradeMeta | null;
  /** Grade id for Japan Cup challenge preview when the match node is not written yet. */
  gradeId?: string;
}) {
  const bracketMatches = useMemo(
    () => matches.filter((m) => m.matchKind !== "japanCupChallenge"),
    [matches]
  );
  const japanCupChallengeMatch = useMemo(() => {
    const gid = gradeId ?? matches[0]?.gradeId;
    if (!gid) return matches.find((m) => m.matchKind === "japanCupChallenge");
    return resolveJapanCupChallengeDisplayMatch(matches, finalsGradeMeta, gid);
  }, [matches, finalsGradeMeta, gradeId]);
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
  }, [matches.length]);

  const rounds = useMemo(() => {
    const m = new Map<number, FinalMatchData[]>();
    for (const x of bracketMatches) {
      const arr = m.get(x.roundIndex) ?? [];
      arr.push(x);
      m.set(x.roundIndex, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.slotInRound - b.slotInRound);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [bracketMatches]);
  const byId = useMemo(
    () => new Map(bracketMatches.map((m) => [m.id, m] as const)),
    [bracketMatches]
  );
  const byRoundAndSlot = useMemo(() => {
    const m = new Map<string, FinalMatchData>();
    for (const match of bracketMatches) {
      m.set(`${match.roundIndex}:${match.slotInRound}`, match);
    }
    return m;
  }, [bracketMatches]);

  const splitChampionMode = (() => {
    const groups = new Set(bracketMatches.map((m) => m.bracketGroup ?? "U"));
    // Split layout should activate whenever both League A and B exist,
    // even if older/generated data does not yet include the grade-final "U" node.
    return groups.has("A") && groups.has("B");
  })();
  const maxRoundByGroup = (() => {
    const out = new Map<string, number>();
    for (const m of bracketMatches) {
      const g = m.bracketGroup ?? "U";
      out.set(g, Math.max(out.get(g) ?? 0, m.roundIndex));
    }
    return out;
  })();

  if (bracketMatches.length === 0) {
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
  const roundsA = (maxRoundByGroup.get("A") ?? 0) + 1;
  const roundsB = (maxRoundByGroup.get("B") ?? 0) + 1;
  const maxRoundA = Math.max(0, roundsA - 1);
  const maxRoundB = Math.max(0, roundsB - 1);
  const treeW = (r: number) => Math.max(1, r) * CARD_W + Math.max(0, r - 1) * ROUND_GAP;
  const treeWA = treeW(roundsA);
  const treeWB = treeW(roundsB);
  const baseXA = PAD_X;
  const championX = baseXA + treeWA + ROUND_GAP / 2;
  const baseXB = championX + CARD_W + ROUND_GAP / 2;
  const fallbackCanvasW = splitChampionMode
    ? baseXB + treeWB + PAD_X
    : PAD_X * 2 + roundCount * CARD_W + Math.max(0, roundCount - 1) * ROUND_GAP;

  const laneHeight = CARD_H + ROW_GAP;
  const centerY = (roundIndex: number, slotInRound: number) => {
    const step = laneHeight * Math.pow(2, roundIndex);
    return HEADER_H + PAD_Y + step / 2 + slotInRound * step;
  };
  const championCenterY = HEADER_H + 28;
  const centerYForMatch = (m: FinalMatchData) => {
    if (splitChampionMode && (m.bracketGroup ?? "U") === "U") return championCenterY;
    return centerY(m.roundIndex, m.slotInRound);
  };
  /** Room for wrapped schedule/hint copy (narrow canvas → many lines). */
  const FOOTER_BAND_H = 80;
  const FOOTER_BOTTOM_INSET = 8;
  const maxCardBottom = Math.max(
    ...bracketMatches.map((m) => centerYForMatch(m) + CARD_H / 2)
  );
  const JC_CARD_H = 100;
  const jcExtraH =
    japanCupChallengeMatch && !projectionMode
      ? CARD_H / 2 + 36 + JC_CARD_H + 16
      : 0;
  const minHFromCards = maxCardBottom + 12 + FOOTER_BAND_H + FOOTER_BOTTOM_INSET + jcExtraH;
  const heuristicH = HEADER_H + PAD_Y + INNER_H + PAD_Y;
  const canvasH = Math.max(heuristicH, minHFromCards);

  const leftX = (roundIndex: number) => PAD_X + roundIndex * (CARD_W + ROUND_GAP);
  const rawXForMatch = (m: FinalMatchData) => {
    if (!splitChampionMode) return leftX(m.roundIndex);
    const g = m.bracketGroup ?? "U";
    if (g === "A") return baseXA + m.roundIndex * (CARD_W + ROUND_GAP);
    // Mirror League B so its bracket faces inward toward the championship match.
    if (g === "B") return baseXB + (maxRoundB - m.roundIndex) * (CARD_W + ROUND_GAP);
    return championX;
  };
  // Right/left safety space for mirrored split brackets (A/B + grade final).
  // Keep moderate padding so layout stays larger while avoiding edge clipping.
  const CANVAS_EDGE_PAD = Math.floor(CARD_W * 0.6);
  const rawMinX = Math.min(...bracketMatches.map((m) => rawXForMatch(m)));
  const rawMaxX = Math.max(...bracketMatches.map((m) => rawXForMatch(m) + CARD_W));
  const rawContentW = Math.max(1, rawMaxX - rawMinX);
  const canvasW = Math.max(
    fallbackCanvasW,
    rawContentW + PAD_X * 2
  ) + CANVAS_EDGE_PAD;
  const xOffset = canvasW / 2 - (rawMinX + rawMaxX) / 2;
  const xForMatch = (m: FinalMatchData) => rawXForMatch(m) + xOffset;
  /** Content width inside `p-3` padding (12px × 2). */
  const innerAvailable = Math.max(0, containerWidth - 24);
  /** Keep some slack for borders/shadows without shrinking too aggressively. */
  const fitW = Math.max(1, innerAvailable - 48);
  const scale = innerAvailable > 0 ? Math.min(1, fitW / canvasW) : 1;
  const scaledH = Math.max(200, canvasH * scale);
  const matchByRoundAndSlot = (roundIndex: number, slotInRound: number) =>
    byRoundAndSlot.get(`${roundIndex}:${slotInRound}`);

  const leagueFinalA = splitChampionMode
    ? bracketMatches.find((m) => (m.bracketGroup ?? "U") === "A" && m.roundIndex === maxRoundA)
    : undefined;
  const leagueFinalB = splitChampionMode
    ? bracketMatches.find((m) => (m.bracketGroup ?? "U") === "B" && m.roundIndex === maxRoundB)
    : undefined;

  const lastRoundMatches = rounds[roundCount - 1]?.[1] ?? [];
  const gradeChampionshipMatch = findGradeChampionshipMatch(matches);
  const finalMatch = gradeChampionshipMatch ?? lastRoundMatches[0];
  const trueChampionId = resolveTrueGradeChampion(matches, finalsGradeMeta);
  const bannerTitle = finalsGradeMeta?.japanCupChallenge?.enabled
    ? "True Grade Champion"
    : winnerBannerTitle;
  const champion = trueChampionId
    ? label(trueChampionId)
    : finalsGradeMeta?.japanCupChallenge?.enabled
      ? null
      : finalMatch?.winnerTeamId
        ? label(finalMatch.winnerTeamId)
        : null;

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
              {winnerBannerIcon}
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
                {bannerTitle}
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
                const sourceY = centerYForMatch(m);
                const targetSlot = Math.floor(m.slotInRound / 2);
                const next =
                  m.nextMatchId
                    ? byId.get(m.nextMatchId)
                    : matchByRoundAndSlot(nextRound, targetSlot);
                if (!next) return [];
                const sourceCardX = xForMatch(m);
                const targetCardX = xForMatch(next);
                const targetY = centerYForMatch(next);
                const sourceFromRight = targetCardX >= sourceCardX;
                const sourceX = sourceFromRight ? sourceCardX + CARD_W : sourceCardX;
                const targetXConnect = sourceFromRight
                  ? targetCardX - CONNECT_INSET
                  : targetCardX + CARD_W + CONNECT_INSET;
                const midX = sourceX + (targetXConnect - sourceX) / 2;
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

          {splitChampionMode && leagueFinalA ? (
            <div
              className={
                p
                  ? "absolute z-20 -translate-x-1/2 text-center pointer-events-none"
                  : "absolute z-20 -translate-x-1/2 text-center pointer-events-none"
              }
              style={{
                left: `${xForMatch(leagueFinalA) + CARD_W / 2}px`,
                top: `${Math.max(ROUND_LABEL_TOP + 10, centerYForMatch(leagueFinalA) - CARD_H / 2 - 32)}px`,
              }}
            >
              <div className="text-lg leading-none" aria-hidden>
                👑
              </div>
              <div
                className={
                  p
                    ? "text-[10px] uppercase tracking-wide text-cup-signalMuted"
                    : "text-[10px] uppercase tracking-wide text-[#8a6b00]"
                }
              >
                Japan Cup qualifier
              </div>
            </div>
          ) : null}
          {splitChampionMode && leagueFinalA ? (
            <div
              className={
                p
                  ? "absolute z-20 -translate-x-1/2 text-[11px] uppercase tracking-[0.14em] font-semibold text-cup-signal pointer-events-none"
                  : "absolute z-20 -translate-x-1/2 text-[11px] uppercase tracking-[0.14em] font-semibold text-cup-muted pointer-events-none"
              }
              style={{
                left: `${xForMatch(leagueFinalA) + CARD_W / 2}px`,
                top: `${ROUND_LABEL_TOP}px`,
              }}
            >
              League A
            </div>
          ) : null}
          {splitChampionMode && leagueFinalB ? (
            <div
              className={
                p
                  ? "absolute z-20 -translate-x-1/2 text-[11px] uppercase tracking-[0.14em] font-semibold text-cup-signal pointer-events-none"
                  : "absolute z-20 -translate-x-1/2 text-[11px] uppercase tracking-[0.14em] font-semibold text-cup-muted pointer-events-none"
              }
              style={{
                left: `${xForMatch(leagueFinalB) + CARD_W / 2}px`,
                top: `${ROUND_LABEL_TOP}px`,
              }}
            >
              League B
            </div>
          ) : null}
          {splitChampionMode && leagueFinalB ? (
            <div
              className="absolute z-20 -translate-x-1/2 text-center pointer-events-none"
              style={{
                left: `${xForMatch(leagueFinalB) + CARD_W / 2}px`,
                top: `${Math.max(ROUND_LABEL_TOP + 10, centerYForMatch(leagueFinalB) - CARD_H / 2 - 32)}px`,
              }}
            >
              <div className="text-lg leading-none" aria-hidden>
                👑
              </div>
              <div
                className={
                  p
                    ? "text-[10px] uppercase tracking-wide text-cup-signalMuted"
                    : "text-[10px] uppercase tracking-wide text-[#8a6b00]"
                }
              >
                Japan Cup qualifier
              </div>
            </div>
          ) : null}

          {rounds.map(([roundIndex, ms]) => (
            <div key={roundIndex}>
              {!splitChampionMode ? (
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
              ) : null}
              {ms.map((m, idx) => {
                const x = xForMatch(m);
                const y = centerYForMatch(m) - CARD_H / 2;
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

          {japanCupChallengeMatch && !p ? (
            <div
              className="absolute z-20 -translate-x-1/2 pointer-events-none"
              style={{
                left: `${
                  splitChampionMode
                    ? championX + xOffset
                    : finalMatch
                      ? xForMatch(finalMatch) + CARD_W / 2
                      : canvasW / 2
                }px`,
                top: `${
                  (finalMatch ? centerYForMatch(finalMatch) : championCenterY) +
                  CARD_H / 2 +
                  36
                }px`,
                width: `${CARD_W}px`,
              }}
            >
              <div
                className={
                  p
                    ? "text-[10px] uppercase tracking-wide text-cup-signalMuted text-center mb-1"
                    : "text-[10px] uppercase tracking-wide text-[#8a6b00] text-center mb-1"
                }
              >
                Japan Cup challenge
              </div>
              <article
                className={
                  p
                    ? "rounded-lg border border-cup-stageBorder bg-cup-stageElevated shadow-md overflow-hidden"
                    : "rounded-lg border border-cup-line bg-white shadow-sm overflow-hidden"
                }
              >
                <div className="h-1 bg-amber-500" />
                <div className="px-3 py-2 text-sm leading-tight">
                  <div className="truncate">{label(japanCupChallengeMatch.teamAId)}</div>
                  <div className="truncate text-cup-muted text-xs">vs</div>
                  <div className="truncate">{label(japanCupChallengeMatch.teamBId)}</div>
                </div>
              </article>
            </div>
          ) : null}

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
