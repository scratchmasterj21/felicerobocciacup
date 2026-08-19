export const TOURNAMENT_BACKUP_FORMAT = "felice-roboccia-cup";
export const TOURNAMENT_BACKUP_VERSION = 1;

export interface TournamentBackup {
  format: typeof TOURNAMENT_BACKUP_FORMAT;
  version: typeof TOURNAMENT_BACKUP_VERSION;
  exportedAt: string;
  sourceTournamentId: string;
  data: Record<string, unknown>;
}

export function createTournamentBackup(
  tournamentId: string,
  data: Record<string, unknown>,
  now = new Date()
): TournamentBackup {
  return {
    format: TOURNAMENT_BACKUP_FORMAT,
    version: TOURNAMENT_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    sourceTournamentId: tournamentId,
    data,
  };
}

export function parseTournamentBackup(text: string): TournamentBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("This is not a Felice Cup backup file.");
  }
  const value = raw as Record<string, unknown>;
  if (value.format !== TOURNAMENT_BACKUP_FORMAT) {
    throw new Error("This file has an unsupported backup format.");
  }
  if (value.version !== TOURNAMENT_BACKUP_VERSION) {
    throw new Error(`Backup version ${String(value.version)} is not supported.`);
  }
  if (typeof value.sourceTournamentId !== "string" || !value.sourceTournamentId.trim()) {
    throw new Error("The backup does not include its source tournament ID.");
  }
  if (!value.data || typeof value.data !== "object" || Array.isArray(value.data)) {
    throw new Error("The backup does not contain tournament data.");
  }
  const data = value.data as Record<string, unknown>;
  if (!data.meta || typeof data.meta !== "object" || Array.isArray(data.meta)) {
    throw new Error("The backup is missing tournament metadata.");
  }
  return value as unknown as TournamentBackup;
}

export function backupFileName(tournamentId: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const safeId = tournamentId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "tournament";
  return `${safeId}-backup-${stamp}.json`;
}
