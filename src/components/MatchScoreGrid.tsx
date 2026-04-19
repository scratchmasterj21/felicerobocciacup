import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type GridFilter = "all" | "unfinished" | "completed";

export interface MatchScoreGridField {
  key: string;
  label: string;
  value: number;
}

export interface MatchScoreGridRow {
  id: string;
  matchId: string;
  teamA: string;
  teamB: string;
  status: "pending" | "completed" | "blocked";
  statusText: string;
  fields: MatchScoreGridField[];
}

export function MatchScoreGrid({
  title,
  rows,
  onSaveRow,
}: {
  title: string;
  rows: MatchScoreGridRow[];
  onSaveRow: (rowId: string, values: Record<string, number>) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!next[row.id]) {
          next[row.id] = Object.fromEntries(
            row.fields.map((f) => [f.key, String(f.value)])
          );
        }
      }
      return next;
    });
  }, [rows]);

  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.id, row] as const)),
    [rows]
  );

  function displayMatchId(matchId: string): string {
    const cut = matchId.indexOf("-");
    const base = cut >= 0 ? matchId.slice(0, cut) : matchId;
    return base.replace(/_+$/, "");
  }

  function rowValues(row: MatchScoreGridRow): Record<string, string> {
    return (
      drafts[row.id] ??
      Object.fromEntries(row.fields.map((f) => [f.key, String(f.value)]))
    );
  }

  function parseRow(row: MatchScoreGridRow): { ok: true; values: Record<string, number> } | { ok: false; error: string } {
    const v = rowValues(row);
    const parsed: Record<string, number> = {};
    for (const f of row.fields) {
      const raw = (v[f.key] ?? "").trim();
      if (!/^\d+$/.test(raw)) {
        return { ok: false, error: "Use non-negative whole numbers." };
      }
      parsed[f.key] = Number(raw);
    }
    return { ok: true, values: parsed };
  }

  function isDirty(row: MatchScoreGridRow): boolean {
    const v = rowValues(row);
    return row.fields.some((f) => String(f.value) !== (v[f.key] ?? ""));
  }

  function canSave(row: MatchScoreGridRow): boolean {
    if (row.status === "blocked") return false;
    if (busy[row.id]) return false;
    if (!isDirty(row)) return false;
    return parseRow(row).ok;
  }

  async function saveRow(rowId: string): Promise<boolean> {
    const row = rowById.get(rowId);
    if (!row) return false;
    const parsed = parseRow(row);
    if (!parsed.ok) {
      setErrors((prev) => ({ ...prev, [rowId]: parsed.error }));
      return false;
    }
    setErrors((prev) => ({ ...prev, [rowId]: "" }));
    setBusy((prev) => ({ ...prev, [rowId]: true }));
    try {
      await onSaveRow(rowId, parsed.values);
      setSavedAt((prev) => ({ ...prev, [rowId]: Date.now() }));
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setErrors((prev) => ({ ...prev, [rowId]: msg }));
      return false;
    } finally {
      setBusy((prev) => ({ ...prev, [rowId]: false }));
    }
  }

  function focusInput(rowIndex: number, colIndex: number) {
    const row = rows[rowIndex];
    if (!row) return;
    const field = row.fields[colIndex];
    if (!field) return;
    refs.current[`${row.id}:${field.key}`]?.focus();
  }

  async function onInputEnter(
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    rowId: string
  ) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const ok = await saveRow(rowId);
    if (ok) focusInput(rowIndex + 1, 0);
  }

  function onArrowNav(
    e: KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusInput(rowIndex + 1, colIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusInput(rowIndex - 1, colIndex);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusInput(rowIndex, colIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusInput(rowIndex, colIndex - 1);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-cup-line rounded-lg px-3 py-4 text-sm text-cup-muted">
        No matches.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-cup-muted">{title}</div>
      <div className="overflow-x-auto border border-cup-line rounded-lg bg-white">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-cup-ink/5 text-cup-muted uppercase tracking-wide">
              <th className="text-left px-2 py-2">Match</th>
              <th className="text-left px-2 py-2">Teams</th>
              <th className="text-left px-2 py-2">Status</th>
              <th className="text-left px-2 py-2">Scores</th>
              <th className="text-left px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id} className="border-t border-cup-line align-top">
                <td className="px-2 py-2 font-mono text-[11px]" title={row.matchId}>
                  {displayMatchId(row.matchId)}
                </td>
                <td className="px-2 py-2">
                  <span className="font-medium">{row.teamA}</span>
                  <span className="text-cup-muted mx-1">vs</span>
                  <span className="font-medium">{row.teamB}</span>
                </td>
                <td className="px-2 py-2">
                  <div>{row.statusText}</div>
                  {errors[row.id] ? (
                    <div className="text-red-700 mt-1">{errors[row.id]}</div>
                  ) : null}
                  {savedAt[row.id] ? (
                    <div className="text-cup-win mt-1">Saved</div>
                  ) : null}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-2">
                    {row.fields.map((field, colIndex) => (
                      <label
                        key={`${row.id}:${field.key}`}
                        className="flex items-center gap-1"
                      >
                        <span className="text-cup-muted">{field.label}</span>
                        <input
                          ref={(el) => {
                            refs.current[`${row.id}:${field.key}`] = el;
                          }}
                          className="border rounded w-12 px-1 py-1 bg-white"
                          value={rowValues(row)[field.key] ?? ""}
                          disabled={row.status === "blocked" || busy[row.id]}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: {
                                ...rowValues(row),
                                [field.key]: e.target.value,
                              },
                            }))
                          }
                          onKeyDown={(e) => {
                            void onInputEnter(e, rowIndex, row.id);
                            onArrowNav(e, rowIndex, colIndex);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    disabled={!canSave(row)}
                    onClick={() => void saveRow(row.id)}
                    className="px-2 py-1 rounded bg-cup-accent text-white font-medium disabled:opacity-40"
                  >
                    {busy[row.id] ? "Saving..." : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
