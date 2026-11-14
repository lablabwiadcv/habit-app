const cloudSyncEnabled = import.meta.env.VITE_ENABLE_CLOUD === "true" || import.meta.env.VITE_ENABLE_CLOUD === "1";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = cloudSyncEnabled && Object.values(firebaseConfig).every(Boolean);
