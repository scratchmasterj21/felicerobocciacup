/**
 * Firebase Realtime Database paths for Felice Roboccia Cup.
 * Omit optional fields entirely — never write `null`.
 */

export const paths = {
  tournamentsRoot: () => "tournaments",
  tournamentMeta: (tournamentId: string) =>
    `tournaments/${tournamentId}/meta`,
  teams: (tournamentId: string) => `tournaments/${tournamentId}/teams`,
  team: (tournamentId: string, teamId: string) =>
    `tournaments/${tournamentId}/teams/${teamId}`,
  schools: (tournamentId: string) => `tournaments/${tournamentId}/schools`,
  school: (tournamentId: string, schoolId: string) =>
    `tournaments/${tournamentId}/schools/${schoolId}`,
  students: (tournamentId: string) =>
    `tournaments/${tournamentId}/students`,
  student: (tournamentId: string, studentId: string) =>
    `tournaments/${tournamentId}/students/${studentId}`,
  fairPlayIncidents: (tournamentId: string) =>
    `tournaments/${tournamentId}/fairPlayIncidents`,
  fairPlayIncident: (tournamentId: string, incidentId: string) =>
    `tournaments/${tournamentId}/fairPlayIncidents/${incidentId}`,
  qualifyingMatches: (tournamentId: string) =>
    `tournaments/${tournamentId}/qualifying/matches`,
  qualifyingMatch: (tournamentId: string, matchId: string) =>
    `tournaments/${tournamentId}/qualifying/matches/${matchId}`,
  finalsGradeMeta: (tournamentId: string, gradeId: string) =>
    `tournaments/${tournamentId}/finals/${gradeId}/meta`,
  finalsGradeRoot: (tournamentId: string, gradeId: string) =>
    `tournaments/${tournamentId}/finals/${gradeId}`,
  finalsMatches: (tournamentId: string, gradeId: string) =>
    `tournaments/${tournamentId}/finals/${gradeId}/matches`,
  finalsMatch: (
    tournamentId: string,
    gradeId: string,
    matchId: string
  ) =>
    `tournaments/${tournamentId}/finals/${gradeId}/matches/${matchId}`,
  resurrectionGroupRoot: (
    tournamentId: string,
    gradeId: string,
    group: string
  ) => `tournaments/${tournamentId}/resurrection/${gradeId}/${group}`,
  resurrectionMeta: (
    tournamentId: string,
    gradeId: string,
    group: string
  ) => `tournaments/${tournamentId}/resurrection/${gradeId}/${group}/meta`,
  resurrectionMatches: (tournamentId: string, gradeId: string, group: string) =>
    `tournaments/${tournamentId}/resurrection/${gradeId}/${group}/matches`,
  resurrectionMatch: (
    tournamentId: string,
    gradeId: string,
    group: string,
    matchId: string
  ) =>
    `tournaments/${tournamentId}/resurrection/${gradeId}/${group}/matches/${matchId}`,
  /** Super-admin list in RTDB (uids). Rules must mirror this. */
  adminUids: () => "config/adminUids",
  adminUid: (uid: string) => `config/adminUids/${uid}`,
};

