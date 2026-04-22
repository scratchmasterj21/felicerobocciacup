# Felice Roboccia Cup

Web app for **per-grade** competition: **preliminary round-robin** (divisions `A` / `B`), **standings** (3 / 1 / 0, tie-break `GD → GF → head-to-head`), **finals single elimination** with byes, and **final-match overtime** (8-minute one round) plus **sudden death** (closer A / B / tie per cycle). Built with **React**, **Vite**, **TypeScript**, **Tailwind CSS**, and **Firebase Realtime Database** + **Auth** (no Cloud Functions).

## Setup

1. `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and fill in Firebase web app config (`VITE_FIREBASE_*`). Optional: `VITE_SHOW_STUDENTS=true` shows the **Students** block on the admin dashboard (hidden by default).
3. In Firebase Console → **Authentication** → **Sign-in method** → enable **Google**.
4. In Firebase Console → **Realtime Database** → Rules: deploy [database.rules.json](database.rules.json).  
   By default, **writes** are allowed for `john.limpiada@felice.ed.jp` (Google sign-in) or any UID with `config/adminUids/{uid}` = `true` (set via Firebase Console).  
5. Add **Authorized domains** for your dev host (e.g. `localhost`) under Authentication → Settings if pop-up sign-in fails.

## Deploy (Netlify)

1. Connect the repo in [Netlify](https://www.netlify.com/) (or use the CLI). Build settings are in [netlify.toml](netlify.toml): **`npm run build`**, publish **`dist/`**.
2. In the site → **Environment variables**, add every `VITE_*` key from [.env.example](.env.example) (at minimum the Firebase web config and usually `VITE_DEFAULT_TOURNAMENT_ID`). Redeploy after changing env vars.
3. In Firebase Console → **Authentication** → **Settings** → **Authorized domains**, add your Netlify hostname (e.g. `yoursite.netlify.app` and any custom domain).

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build to `dist/`
- `npm run typecheck` — TypeScript
- `npm test` — Vitest (tournament engine)

## Manual validation checklist (2026-style counts)

Preliminary advancement uses `K = floor(2N/3)` per division; finals seeds alternate `A1, B1, A2, B2, …`.

| Grade | Division sizes | K per div | Finalists |
|-------|----------------|-----------|-----------|
| G1 | 5 + 5 | 3 + 3 | 6 |
| G2 | 4 + 4 | 2 + 2 | 4 |
| G3 | 7 + 7 | 4 + 4 | 8 |
| G4 | 5 + 5 | 3 + 3 | 6 |
| G5 | 5 + 4 | 3 + 2 | 5 |
| G6 | 5 + 6 | 3 + 4 | 7 |

After entering results for all RR matches, use **Admin → Finals → Preview seeds**, then **Generate bracket** per grade.

## Data shape (RTDB)

- `tournaments/{tournamentId}/meta` — `{ name, schoolYear, createdAt, tournamentKind?, divisionLabelA?, divisionLabelB?, qualifyingMode? }` — optional pool labels; optional **`tournamentKind`**: `"intraSchool"` (within one school, default if omitted for legacy data) vs **`"interSchool"`** (school vs other school). **`tournamentKind` is set at creation only**; it is not updated via partial meta saves. To change kind, delete meta and recreate or use a new `tournamentId`. **Inter-school** tournaments are created with **`qualifyingMode: "unified"`** by default (single league in Pool A). Optional **`qualifyingMode`**: omit or `"twoPools"` (default for intra-school) for separate A/B round-robins then alternating finals seeds (`A1`, `B1`, `A2`, `B2`, …); **`"unified"`** for a single combined league (all teams in division **A** only; division B unused). Top **K** finalists are taken by **rank order** (best-first) for the bracket. **Delete tournament meta** in the admin removes only this node; teams and matches are not deleted.
- `tournaments/{tournamentId}/schools/{schoolId}` — `{ name, shortLabel? }` — optional registry for multi-school events.
- `tournaments/{tournamentId}/teams/{teamId}` — `{ gradeId, divisionId, name, code?, schoolId? }` — optional `schoolId` references `schools/{schoolId}` for display (`Short · Team name`). Existing data without `schoolId` is unchanged.
- `tournaments/{tournamentId}/students/{studentId}` — `{ name, teamId? }`
- `tournaments/{tournamentId}/qualifying/matches/{matchId}` — RR match + scores (optional fields omitted). Optional `schedule`: `{ startAt: number (UTC ms), durationRegulationMinutes?: number, court?: string }` — omit the whole `schedule` object when unused. Clearing a schedule in the admin UI removes the `schedule` key in RTDB.
- `tournaments/{tournamentId}/finals/{gradeId}/matches/{matchId}` — knockout match tree (same optional `schedule` shape)

### Preliminary layout and multi-school

- **Tournament kind (admin):** before creating meta, choose **within-school** or **school vs other school**. Inter-school events are intended for tight schedules (e.g. ~1h preliminary + ~1h finals), two registered schools, and unified preliminary play; the app does not allow changing kind after meta exists without deleting meta or using another tournament ID.
- **Two pools (default):** divisions A and B each have their own round-robin; finalists alternate `A1`, `B1`, `A2`, `B2`, … For host vs partner, set **pool labels**, register **schools**, assign **team** `schoolId`.
- **Unified mode** (`qualifyingMode: "unified"`): one combined league—add all teams under **Pool A** only (Pool B unused), generate RR for A, then preview/generate finals from **standings rank** (best-first). **K** = `floor(2N/3)` with **N** = team count in Pool A.
- **School-vs-school preliminary:** when **every** team in a pool has a `schoolId` and **exactly two** schools appear in that pool, **Generate round-robin** builds only **cross-school** games (each team plays each team from the other school once). If any team is missing a school, or more than two schools are present, the app falls back to a **full** round-robin and may show a short admin alert.

### Match schedule & timezone

- **Admin** `datetime-local` inputs are interpreted as **Japan local time** (`Asia/Tokyo`); stored `startAt` is UTC milliseconds.
- **Regulation length**: if `durationRegulationMinutes` is omitted, the UI assumes **16 minutes** (two 8-minute halves). Finals also show the usual **+8 min extra** if regulation is tied.
- **Viewer**: preliminary schedule lists sort by `startAt` when set, then by round and team id; finals rounds sort by `startAt` within each round when set, then by bracket slot.

## Security

Rules allow **public read** on `tournaments` and **writes** for Google user **john.limpiada@felice.ed.jp** or any UID with `config/adminUids/{uid}` = `true`. Adjust [database.rules.json](database.rules.json) if you need a different default admin email or stricter read access.
