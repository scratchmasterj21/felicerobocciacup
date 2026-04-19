const BYE = "__bye__";

/**
 * When every team has a school and exactly two schools appear in the pool,
 * fixtures are **only** between those schools (complete bipartite: each team
 * on one side plays each team on the other). Otherwise returns null (caller
 * should use full round-robin).
 */
export function tryTwoSchoolBipartitePartition(
  teamIds: string[],
  schoolIdByTeamId?: Record<string, string | undefined>
): { left: string[]; right: string[] } | null {
  if (!schoolIdByTeamId || teamIds.length < 2) return null;
  const bySchool = new Map<string, string[]>();
  for (const id of teamIds) {
    const sid = schoolIdByTeamId[id]?.trim();
    if (!sid) return null;
    const g = bySchool.get(sid) ?? [];
    g.push(id);
    bySchool.set(sid, g);
  }
  if (bySchool.size !== 2) return null;
  const [s1, s2] = [...bySchool.keys()].sort();
  const left = [...(bySchool.get(s1) ?? [])].sort();
  const right = [...(bySchool.get(s2) ?? [])].sort();
  if (left.length === 0 || right.length === 0) return null;
  return { left, right };
}

/** Every cross pair once; rounds pack disjoint matches (greedy). */
export function generateCompleteBipartitePairings(
  left: string[],
  right: string[]
): Array<{ round: number; teamA: string; teamB: string }> {
  const pairs: Array<{ teamA: string; teamB: string }> = [];
  for (const a of [...left].sort()) {
    for (const b of [...right].sort()) {
      pairs.push({ teamA: a, teamB: b });
    }
  }
  return scheduleCrossPairsIntoRounds(pairs);
}

function scheduleCrossPairsIntoRounds(
  pairs: Array<{ teamA: string; teamB: string }>
): Array<{ round: number; teamA: string; teamB: string }> {
  const remaining = [...pairs];
  const out: Array<{ round: number; teamA: string; teamB: string }> = [];
  let round = 1;
  while (remaining.length > 0) {
    const used = new Set<string>();
    const thisRound: Array<{ teamA: string; teamB: string }> = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const p = remaining[i];
      if (!used.has(p.teamA) && !used.has(p.teamB)) {
        thisRound.push(p);
        used.add(p.teamA);
        used.add(p.teamB);
        remaining.splice(i, 1);
      }
    }
    if (thisRound.length === 0) {
      const p = remaining.shift()!;
      thisRound.push(p);
    }
    for (const p of thisRound) {
      out.push({ round, teamA: p.teamA, teamB: p.teamB });
    }
    round += 1;
  }
  return out;
}

/**
 * Full round-robin, or school-vs-school only when all teams have a school and
 * exactly two schools are represented in `teamIds`.
 */
export function getQualifyingFixturePairings(
  teamIds: string[],
  schoolIdByTeamId?: Record<string, string | undefined>
): Array<{ round: number; teamA: string; teamB: string }> {
  const part = tryTwoSchoolBipartitePartition(teamIds, schoolIdByTeamId);
  if (part) {
    return generateCompleteBipartitePairings(part.left, part.right);
  }
  return generateRoundRobinPairings(teamIds);
}

/**
 * Circle method: single round-robin. Odd team count adds a bye each round.
 * Returns pairings with round index 1-based.
 */
export function generateRoundRobinPairings(
  teamIds: string[]
): Array<{ round: number; teamA: string; teamB: string }> {
  if (teamIds.length < 2) return [];
  const teams = [...teamIds];
  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const ring = [...teams];
  const out: Array<{ round: number; teamA: string; teamB: string }> = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a !== BYE && b !== BYE) {
        out.push({ round: r + 1, teamA: a, teamB: b });
      }
    }
    const fixed = ring[0];
    const rest = ring.slice(1);
    const last = rest.pop();
    if (last !== undefined) rest.unshift(last);
    ring.splice(0, n, fixed, ...rest);
  }
  return out;
}

export function regulationTotals(reg: {
  round1: { scoreA: number; scoreB: number };
  round2: { scoreA: number; scoreB: number };
}): { totalA: number; totalB: number } {
  return {
    totalA: reg.round1.scoreA + reg.round2.scoreA,
    totalB: reg.round1.scoreB + reg.round2.scoreB,
  };
}

export function qualifyingOutcomeFromTotals(
  totalA: number,
  totalB: number
): "WIN_A" | "WIN_B" | "DRAW" {
  if (totalA > totalB) return "WIN_A";
  if (totalB > totalA) return "WIN_B";
  return "DRAW";
}
