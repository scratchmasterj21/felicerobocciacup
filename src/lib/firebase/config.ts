import { initializeApp, type FirebaseApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

let app: FirebaseApp | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  if (
    !apiKey ||
    !authDomain ||
    !databaseURL ||
    !projectId ||
    !storageBucket ||
    !messagingSenderId ||
    !appId
  ) {
    console.warn(
      "Firebase env vars missing. Set VITE_FIREBASE_* in .env.local"
    );
  }

  app = initializeApp({
    apiKey: apiKey ?? "",
    authDomain: authDomain ?? "",
    databaseURL: databaseURL ?? "",
    projectId: projectId ?? "",
    storageBucket: storageBucket ?? "",
    messagingSenderId: messagingSenderId ?? "",
    appId: appId ?? "",
  });
  return app;
}

export function getDb() {
  return getDatabase(getFirebaseApp());
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}
