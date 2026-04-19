/**
 * Client-side admin check (routing / UX). Writes are enforced by RTDB rules:
 * default super-admin email below, or `config/adminUids/{uid}` = true.
 */

/** URL segment for admin UI (not linked publicly). Change if the path is leaked. */
const ADMIN_URL_SEGMENT = "adminp21";

/** Full path to admin dashboard, e.g. `/adminp21` */
export const ADMIN_APP_BASE_PATH = `/${ADMIN_URL_SEGMENT}`;

/** Full path to admin sign-in */
export const ADMIN_APP_LOGIN_PATH = `${ADMIN_APP_BASE_PATH}/login`;

/** Nested `path` values for `<Route>` under the layout (no leading slash). */
export const ADMIN_APP_ROUTES = {
  login: `${ADMIN_URL_SEGMENT}/login`,
  root: ADMIN_URL_SEGMENT,
} as const;

export const DEFAULT_ADMIN_EMAIL = "john.limpiada@felice.ed.jp";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Emails allowed to open the admin dashboard (must match rules for writes). */
export function getAdminEmailAllowlist(): Set<string> {
  const set = new Set<string>([normalizeEmail(DEFAULT_ADMIN_EMAIL)]);
  const extra = import.meta.env.VITE_ADMIN_EMAILS;
  if (typeof extra === "string" && extra.length > 0) {
    for (const part of extra.split(",")) {
      const t = part.trim();
      if (t) set.add(normalizeEmail(t));
    }
  }
  return set;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmailAllowlist().has(normalizeEmail(email));
}
