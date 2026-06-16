import type { FinalMatchData } from "@/lib/tournament/types";
import { compareFinalByRoundThenScheduleThenSlot } from "@/lib/schedule/matchSort";
import {
  MatchScoreGrid,
  type MatchScoreGridRow,
} from "@/components/MatchScoreGrid";
import type { ComponentType } from "react";

type FinalMatchEditorComponent = ComponentType<{
  m: FinalMatchData;
  tournamentId: string;
  grade: string;
  nameById: Map<string, string>;
}>;

export function JapanCupConfigPanel({
  grade,
  jcEnabled,
  onJcEnabledChange,
  jcChampionName,
  onJcChampionNameChange,
  jcBusy,
  jcStatus,
  onSave,
  showExistingBracketWarning,
  showChallengeProgressWarning,
}: {
  grade: string;
  jcEnabled: boolean;
  onJcEnabledChange: (enabled: boolean) => void;
  jcChampionName: string;
  onJcChampionNameChange: (name: string) => void;
  jcBusy: boolean;
  jcStatus: string | null;
  onSave: () => void;
  showExistingBracketWarning?: boolean;
  showChallengeProgressWarning?: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 p-4 space-y-3 max-w-2xl">
      <h3 className="text-sm font-semibold">Japan Cup challenge (optional)</h3>
      <p className="text-xs text-cup-muted">
        <strong>Fair Play</strong> (above) sets student Japan Cup eligibility. Here you register the
        <strong> defending champion team</strong> by name — separate from Teams A/B — and score the
        true grade champion match after the grade final.
      </p>
      {showExistingBracketWarning ? (
        <p className="text-xs text-amber-900 bg-amber-100 border border-amber-200 rounded-md px-2 py-1.5">
          Preliminary or finals data already exists for this grade. Save Japan Cup settings before
          generating brackets; regenerate prelims/finals if a team was already in the pool.
        </p>
      ) : null}
      {showChallengeProgressWarning ? (
        <p className="text-xs text-amber-900 bg-amber-100 border border-amber-200 rounded-md px-2 py-1.5">
          The Japan Cup challenge match has scores or is complete. Disabling or changing settings may
          require clearing the challenge match first.
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={jcEnabled}
          onChange={(e) => onJcEnabledChange(e.target.checked)}
        />
        <span>Japan Cup challenge enabled for {grade}</span>
      </label>
      {jcEnabled ? (
        <label className="flex flex-col gap-1 text-xs text-cup-muted">
          <span>Japan Cup champion team name</span>
          <input
            type="text"
            className="border border-cup-line rounded-md px-2 py-1.5 bg-white text-sm max-w-md"
            value={jcChampionName}
            onChange={(e) => onJcChampionNameChange(e.target.value)}
            placeholder="e.g. Roboccia Japan Cup 2025 winners"
          />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={jcBusy || (jcEnabled && !jcChampionName.trim())}
          onClick={onSave}
          className="px-4 py-2 rounded-lg border border-cup-line text-sm font-medium disabled:opacity-50"
        >
          {jcBusy ? "Saving…" : "Save Japan Cup challenge"}
        </button>
        {jcStatus ? <p className="text-sm text-cup-muted">{jcStatus}</p> : null}
      </div>
    </div>
  );
}

export function JapanCupChallengeScoring({
  grade,
  matches,
  gradeFinalComplete,
  viewMode,
  finalsRows,
  onSaveRow,
  tournamentId,
  nameById,
  FinalMatchEditor,
}: {
  grade: string;
  matches: FinalMatchData[];
  gradeFinalComplete: boolean;
  viewMode: "cards" | "quick";
  finalsRows: (list: FinalMatchData[]) => MatchScoreGridRow[];
  onSaveRow: (rowId: string, values: Record<string, number>) => Promise<void>;
  tournamentId: string;
  nameById: Map<string, string>;
  FinalMatchEditor: FinalMatchEditorComponent;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-cup-line pt-4">
      <h3 className="text-sm font-semibold text-cup-muted">
        {grade} · Japan Cup challenge — true grade champion
      </h3>
      {!gradeFinalComplete ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
          Complete the grade championship final before scoring this match.
        </p>
      ) : viewMode === "quick" ? (
        <MatchScoreGrid
          title={`${grade} · Japan Cup challenge quick scores`}
          rows={finalsRows(matches)}
          onSaveRow={onSaveRow}
        />
      ) : (
        matches
          .sort(compareFinalByRoundThenScheduleThenSlot)
          .map((m, idx) => (
            <FinalMatchEditor
              key={`JC-${m.id}-${idx}`}
              m={m}
              tournamentId={tournamentId}
              grade={grade}
              nameById={nameById}
            />
          ))
      )}
    </div>
  );
}
