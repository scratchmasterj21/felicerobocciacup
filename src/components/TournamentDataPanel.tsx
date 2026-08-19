import { useRef, useState } from "react";
import {
  exportTournamentData,
  restoreTournamentData,
} from "@/lib/firebase/tournamentService";
import {
  backupFileName,
  createTournamentBackup,
  parseTournamentBackup,
  type TournamentBackup,
} from "@/lib/tournament/backup";
import {
  createMatchesCsv,
  createPrintableResultsHtml,
  createTeamsCsv,
} from "@/lib/tournament/reporting";

function downloadFile(contents: BlobPart, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function TournamentDataPanel({ tournamentId }: { tournamentId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<TournamentBackup | null>(null);

  async function downloadBackup() {
    setBusy(true);
    setStatus(null);
    try {
      const data = await exportTournamentData(tournamentId);
      const backup = createTournamentBackup(tournamentId, data);
      downloadFile(
        JSON.stringify(backup, null, 2),
        "application/json",
        backupFileName(tournamentId)
      );
      setStatus({ kind: "ok", text: "Backup downloaded." });
    } catch (error: unknown) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Export failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function downloadReport(kind: "teams" | "matches" | "print") {
    setBusy(true);
    setStatus(null);
    try {
      const data = await exportTournamentData(tournamentId);
      const safeId = tournamentId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "tournament";
      if (kind === "teams") downloadFile(createTeamsCsv(data), "text/csv;charset=utf-8", `${safeId}-teams.csv`);
      if (kind === "matches") downloadFile(createMatchesCsv(data), "text/csv;charset=utf-8", `${safeId}-matches.csv`);
      if (kind === "print") downloadFile(createPrintableResultsHtml(data), "text/html;charset=utf-8", `${safeId}-printable-results.html`);
      setStatus({ kind: "ok", text: "Report downloaded." });
    } catch (error: unknown) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Report export failed." });
    } finally {
      setBusy(false);
    }
  }

  async function selectBackup(file: File | undefined) {
    setPending(null);
    setStatus(null);
    if (!file) return;
    try {
      setPending(parseTournamentBackup(await file.text()));
    } catch (error: unknown) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not read backup.",
      });
    }
  }

  async function restoreBackup() {
    if (!pending) return;
    const accepted = window.confirm(
      `Replace all data in “${tournamentId}” with the backup from “${pending.sourceTournamentId}”?\n\nThis cannot be undone unless you export the current data first.`
    );
    if (!accepted) return;
    setBusy(true);
    setStatus(null);
    try {
      await restoreTournamentData(tournamentId, pending.data);
      setStatus({ kind: "ok", text: "Tournament restored successfully." });
      setPending(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error: unknown) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Restore failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="admin-data"
      className="bg-white border border-cup-line rounded-xl p-6 shadow-sm space-y-5 scroll-mt-20"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-cup-accent">
          Safety & recovery
        </p>
        <h2 className="font-display text-lg font-semibold mt-1">Tournament data</h2>
        <p className="text-sm text-cup-muted mt-1 max-w-2xl">
          Download a complete local snapshot, or restore a validated Felice Cup backup into
          the current tournament ID.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
          <h3 className="font-medium">Export backup</h3>
          <p className="text-xs text-cup-muted">
            Includes settings, teams, students, schedules, scores, brackets, and Fair Play data.
          </p>
          <button
            type="button"
            disabled={busy || !tournamentId.trim()}
            onClick={() => void downloadBackup()}
            className="rounded-lg bg-cup-ink px-4 py-2 text-sm font-medium text-cup-paper disabled:opacity-50"
          >
            {busy ? "Working…" : "Download JSON backup"}
          </button>
        </div>

        <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
          <h3 className="font-medium">Reports</h3>
          <p className="text-xs text-cup-muted">Download spreadsheet-friendly data or an HTML results sheet ready to print or save as PDF.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void downloadReport("teams")} className="rounded-lg border border-cup-line bg-white px-3 py-2 text-sm font-medium disabled:opacity-50">Teams CSV</button>
            <button type="button" disabled={busy} onClick={() => void downloadReport("matches")} className="rounded-lg border border-cup-line bg-white px-3 py-2 text-sm font-medium disabled:opacity-50">Matches CSV</button>
            <button type="button" disabled={busy} onClick={() => void downloadReport("print")} className="rounded-lg border border-cup-line bg-white px-3 py-2 text-sm font-medium disabled:opacity-50">Printable results</button>
          </div>
        </div>

        <div className="rounded-lg border border-cup-line bg-cup-paper/40 p-4 space-y-3">
          <h3 className="font-medium">Restore backup</h3>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => void selectBackup(event.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:font-medium"
          />
          {pending ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
              <p><strong>Source:</strong> {pending.sourceTournamentId}</p>
              <p><strong>Exported:</strong> {new Date(pending.exportedAt).toLocaleString()}</p>
              <p><strong>Destination:</strong> {tournamentId}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void restoreBackup()}
                className="mt-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Replace current tournament data
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {status ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </section>
  );
}
