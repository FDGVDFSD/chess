import { useState } from "react";
import { Calendar, Crown, Lock, Mail, Shield, UserPlus } from "lucide-react";
import { login, setToken, signup } from "../lib/api.js";
import type { PublicUser } from "../../shared/types.js";
import { PolicyModals, type PolicyModalType } from "./PolicyModals.js";

interface AuthPanelProps { onAuthed: (user: PublicUser) => void; }

export function AuthPanel({ onAuthed }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);
  const [birthYear, setBirthYear] = useState<number>(2005);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loginName, setLoginName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [policyModal, setPolicyModal] = useState<PolicyModalType>(null);
  const currentYear = new Date().getFullYear();
  const isUnder13 = birthYear > currentYear - 13;

  async function submit() {
    setError("");
    if (mode === "signup") {
      if (signupStep === 1) {
        if (!birthYear || birthYear < 1920 || birthYear > currentYear) { setError("Please select a valid birth year."); return; }
        setSignupStep(2); return;
      }
      if (signupStep === 2) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim())) { setError("Enter a valid email address."); return; }
        if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
        setSignupStep(3); return;
      }
    }
    setBusy(true);
    try {
      const result = mode === "signup" ? await signup(email, password, username, birthYear) : await login(loginName || email, password);
      setToken(result.token);
      onAuthed(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <main className="auth-screen">
        <section className="brand-panel" aria-label="Chess Arena">
          <div className="brand-header"><div className="brand-mark"><Crown size={38} /></div><div><h1 className="brand-title">Chess Arena</h1><span className="brand-tagline">Play • Improve • Compete</span></div></div>
          <h2 className="brand-subtitle">Play chess your way</h2>
          <ul className="feature-list">
            <li>♟️ 10 Bot levels — from Beginner to God Mode</li><li>🌐 Online friend rooms and matchmaking</li><li>👥 Same-device 2-player chess</li><li>🏆 Elo rating, leaderboard & game history</li><li>🎨 Multiple board and piece themes</li><li>🔊 Sound, animation and accessibility controls</li>
          </ul>
          <div className="privacy-badge-panel">
            <div className="privacy-badge-title"><Shield size={18} /><strong>Safe & Privacy-Focused</strong></div>
            <p>We collect only the information needed to run your Chess Arena account and games. We don't ask for unnecessary personal information.</p>
            <div className="policy-links"><button type="button" className="text-link" onClick={() => setPolicyModal("privacy")}>Privacy Policy</button><span>•</span><button type="button" className="text-link" onClick={() => setPolicyModal("terms")}>Terms</button><span>•</span><button type="button" className="text-link" onClick={() => setPolicyModal("guidelines")}>Community Guidelines</button><span>•</span><button type="button" className="text-link" onClick={() => setPolicyModal("report")}>Report a Problem</button></div>
          </div>
        </section>
        <section className="auth-card">
          <div className="segmented">
            <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setSignupStep(1); setError(""); }}><UserPlus size={16} /> Sign up</button>
            <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}><Lock size={16} /> Log in</button>
          </div>
          {mode === "signup" ? (
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <div className="step-row"><span className={signupStep === 1 ? "step active" : "step"}>1</span><span className={signupStep === 2 ? "step active" : "step"}>2</span><span className={signupStep === 3 ? "step active" : "step"}>3</span></div>
              {signupStep === 1 && <><label>Select Birth Year<span className="input-shell"><Calendar size={16} /><select value={birthYear} onChange={(e) => setBirthYear(Number(e.target.value))} className="setting-item select inline-select">{Array.from({ length: 90 }, (_, i) => currentYear - i).map((yr) => <option key={yr} value={yr}>{yr}</option>)}</select></span></label>{isUnder13 && <div className="age-notice"><Shield size={16} /><span><strong>Under 13 Account Notice:</strong> Neutral age verification active. Data collection is strictly minimized in compliance with U.S. privacy guidelines.</span></div>}</>}
              {signupStep === 2 && <><label>Email<span className="input-shell"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></span></label><label>Password<span className="input-shell"><Lock size={16} /><input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></span></label></>}
              {signupStep === 3 && <label>Username<span className="input-shell"><Crown size={16} /><input value={username} pattern="[a-zA-Z0-9_ ]{3,18}" onChange={(event) => setUsername(event.target.value)} placeholder="e.g. GrandmasterFlex" required /></span></label>}
              <div className="auth-btn-row">{signupStep > 1 && <button className="secondary" type="button" onClick={() => setSignupStep((prev) => (prev - 1) as 1 | 2)}>Back</button>}<button className="primary full" disabled={busy} type="submit">{signupStep < 3 ? "Next" : busy ? "Creating Account..." : "Create Account"}</button></div>
            </form>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <label>Email<span className="input-shell"><Mail size={16} /><input type="email" value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="email" required /></span></label>
              <label>Password<span className="input-shell"><Lock size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></span></label>
              <button className="primary full" disabled={busy} type="submit">{busy ? "Signing in..." : "Log in"}</button>
            </form>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </section>
      </main>
      <PolicyModals type={policyModal} onClose={() => setPolicyModal(null)} />
    </>
  );
}
