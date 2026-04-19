/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_DATABASE_URL: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** Optional comma-separated extra admin emails (must also be added to database.rules.json for writes). */
  readonly VITE_ADMIN_EMAILS?: string;
  /** Set to `"true"` to show the Students section on the admin dashboard. */
  readonly VITE_SHOW_STUDENTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
