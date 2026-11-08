import { getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig.js";

const app = isFirebaseConfigured
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export function observeAuth(onUser, onError) {
  if (!auth) throw new Error("Firebase is not configured.");
  return onAuthStateChanged(auth, onUser, onError);
}

export function signInWithGoogle() {
  if (!auth) throw new Error("Firebase is not configured.");
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signInWithEmail(email, password) {
  if (!auth) throw new Error("Firebase is not configured.");
  return signInWithEmailAndPassword(auth, email, password);
}

export function registerWithEmail(email, password) {
  if (!auth) throw new Error("Firebase is not configured.");
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signOutAccount() {
  if (!auth) throw new Error("Firebase is not configured.");
  return signOut(auth);
}

function stateDocument(userId) {
  if (!db) throw new Error("Firebase is not configured.");
  return doc(db, "users", userId, "daymark", "state");
}

export async function getOrCreateCloudState(userId, localState) {
  const reference = stateDocument(userId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      return { state: snapshot.data().state, created: false };
    }
    transaction.set(reference, {
      state: localState,
      updatedAt: serverTimestamp(),
    });
    return { state: localState, created: true };
  });
}

export function saveCloudState(userId, state) {
  return setDoc(stateDocument(userId), {
    state,
    updatedAt: serverTimestamp(),
  });
}

export function watchCloudState(userId, onState, onError) {
  return onSnapshot(
    stateDocument(userId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.hasPendingWrites || !snapshot.exists()) return;
      onState(snapshot.data().state);
    },
    onError,
  );
}
