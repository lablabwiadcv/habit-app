import { useState } from "react";
import Icon from "./Icon.jsx";

export default function AccountSyncDialog({
  open,
  onClose,
  configured,
  user,
  status,
  error,
  onRetry,
}) {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestError, setRequestError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const runAuth = async (operationName, ...args) => {
    setBusy(true);
    setRequestError("");
    try {
      const { [operationName]: operation } = await import("../firebase.js");
      await operation(...args);
    } catch (authError) {
      console.error("Firebase account action failed.", authError);
      setRequestError(authError instanceof Error ? authError.message : "The account request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop account-sync-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="edit-modal account-sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-sync-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="account-sync-header">
          <div className="account-sync-brand">
            <span className="account-sync-brand-icon"><Icon name="Cloud" size={17} /></span>
            <span>DAYMARK CLOUD</span>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close account dialog">
            <Icon name="X" size={18} />
          </button>
        </div>
        {user ? (
          <div className="account-sync-status" aria-labelledby="account-sync-title">
            <div className="account-sync-hero-icon"><Icon name="Cloud" size={25} /></div>
            <h2 id="account-sync-title">Your Daymark is connected</h2>
            <p>Signed in as <strong>{user.email || user.displayName || "Google account"}</strong></p>
            <p role={status === "error" ? "alert" : "status"}>
              {status === "saving" ? "Syncing your latest changes…" :
                status === "synced" ? "Your Daymark data is synced." :
                  status === "error" ? error || "Sync could not finish." :
                    "Loading your cloud data…"}
            </p>
            {status === "error" && (
              <button type="button" className="subtle-btn" onClick={onRetry}>Retry sync</button>
            )}
            <button type="button" className="subtle-btn" disabled={busy} onClick={() => runAuth("signOutAccount")}>
              Sign out
            </button>
          </div>
        ) : !configured ? (
          <div className="account-sync-status" aria-labelledby="account-sync-title">
            <h2 id="account-sync-title">Connect Daymark Cloud</h2>
            <p>Firebase is not connected yet. Add your Firebase web app settings to <code>.env.local</code>, then enable Email/Password and Google sign-in in Firebase Authentication.</p>
            <p>Your current data remains saved on this device.</p>
          </div>
        ) : (
          <>
            <div className="account-sync-hero">
              <div className="account-sync-hero-icon"><Icon name="Cloud" size={25} /></div>
              <h2 id="account-sync-title">Your day, in sync</h2>
              <p>Sign in to pick up your Daymark routine on any device.</p>
            </div>
            <p className="account-sync-description">
              If your cloud account is new, this device’s Daymark data will be uploaded.
            </p>
            <button
              type="button"
              className="account-google-button"
              disabled={busy}
              onClick={() => runAuth("signInWithGoogle")}
            >
              <span className="account-google-mark" aria-hidden="true">G</span>
              <span>Continue with Google</span>
            </button>
            <div className="account-sync-divider"><span>or continue with email</span></div>
            <form onSubmit={(event) => {
              event.preventDefault();
              runAuth(mode === "register" ? "registerWithEmail" : "signInWithEmail", email, password);
            }}>
              <label>
                Email
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                <span className="account-password-label">
                  Password
                  {mode === "register" && <small>At least 6 characters</small>}
                </span>
                <input
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  minLength={mode === "register" ? 6 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {(requestError || error) && <p className="account-sync-error" role="alert">{requestError || error}</p>}
              <button className="primary-btn" disabled={busy}>
                {busy ? "Connecting…" : mode === "register" ? "Create account" : "Sign in"}
              </button>
            </form>
            <button
              type="button"
              className="text-button account-mode-toggle"
              disabled={busy}
              onClick={() => {
                setRequestError("");
                setMode((current) => current === "sign-in" ? "register" : "sign-in");
              }}
            >
              {mode === "sign-in" ? (
                <>New to Daymark? <strong>Create an account</strong></>
              ) : (
                <>Already have an account? <strong>Sign in</strong></>
              )}
            </button>
            <p className="account-sync-privacy">
              <span className="account-sync-lock" aria-hidden="true"><Icon name="LockKeyhole" size={13} /></span>
              <span>Your account can access only its own Daymark data. Export remains available as a separate backup.</span>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
