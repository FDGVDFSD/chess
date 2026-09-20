import { useState } from "react";
import { AlertTriangle, CheckCircle, Shield, Trash2, X } from "lucide-react";
import { deleteAccount, reportPlayer } from "../lib/api.js";

export type PolicyModalType =
  | "privacy"
  | "terms"
  | "cookies"
  | "refunds"
  | "accessibility"
  | "licenses"
  | "guidelines"
  | "report"
  | "delete"
  | null;

interface PolicyModalsProps {
  type: PolicyModalType;
  onClose: () => void;
  targetUsername?: string;
  onAccountDeleted?: () => void;
}

const lastUpdated = "September 19, 2026";

export function PolicyModals({ type, onClose, targetUsername, onAccountDeleted }: PolicyModalsProps) {
  const [reportTarget, setReportTarget] = useState(targetUsername ?? "");
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!type) return null;

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await reportPlayer(reportTarget, reportReason, reportDetails);
      setReportSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAccount() {
    setError("");
    setBusy(true);
    try {
      await deleteAccount();
      onClose();
      onAccountDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account.");
      setBusy(false);
    }
  }

  const closeButton = (
    <button className="primary full mt-4" onClick={onClose}>
      Close
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close modal">
          <X size={20} />
        </button>

        {type === "privacy" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Shield size={28} className="icon-accent" />
              <h2>Privacy Policy</h2>
            </div>
            <p className="policy-subtitle">Last updated {lastUpdated}. This describes the current Chess Arena v2 app behavior and is not a legal certification.</p>

            <div className="policy-section">
              <h3>Data we collect</h3>
              <ul>
                <li><strong>Account:</strong> email, username, password credentials handled by Supabase Auth, and birth year used for age screening.</li>
                <li><strong>Chess activity:</strong> moves, results, ratings, game history, reports, and moderation records.</li>
                <li><strong>Preferences:</strong> board/theme/accessibility settings and essential session state.</li>
                <li><strong>Technical processing:</strong> hosting/authentication services may process request, security, and connection metadata needed to operate the service.</li>
              </ul>
            </div>

            <div className="policy-section">
              <h3>13+ service</h3>
              <p>New Chess Arena accounts are intended for users age 13 or older. The signup flow blocks account creation when the selected birth year indicates the user is under 13. Chess Arena does not claim a verified parental-consent program.</p>
            </div>

            <div className="policy-section">
              <h3>How data is used</h3>
              <p>Data is used to authenticate accounts, run games and matchmaking, maintain ratings/history, enforce safety rules, troubleshoot the service, and remember user preferences. Chess Arena does not intentionally sell personal data or run cross-site advertising trackers.</p>
            </div>

            <div className="policy-section">
              <h3>Third parties</h3>
              <p>Chess Arena currently relies on Supabase for authentication/database/realtime services, Netlify for hosting, and GitHub for source control and issue reporting. Those providers may process technical data under their own policies.</p>
            </div>

            <div className="policy-section">
              <h3>Email</h3>
              <p>Current emails are transactional account messages such as confirmation and password recovery. Chess Arena does not currently operate a marketing mailing list. If marketing email is added later, an unsubscribe mechanism should be provided before launch.</p>
            </div>

            <div className="policy-section">
              <h3>Your choices and deletion</h3>
              <p>You can permanently delete your account and associated Chess Arena data from Settings. You can also report a privacy or safety issue through the in-app Report a Problem form or the project issue tracker.</p>
            </div>

            <div className="policy-section">
              <h3>Contact</h3>
              <p>Project contact: GitHub account <strong>dvilrgamerz</strong>. Live service: chess-arena-v2.netlify.app. Do not send passwords, access tokens, or other secrets in public issues.</p>
            </div>
            {closeButton}
          </article>
        )}

        {type === "terms" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Shield size={28} className="icon-accent" />
              <h2>Terms of Service</h2>
            </div>
            <p className="policy-subtitle">Last updated {lastUpdated}.</p>

            <div className="policy-section">
              <h3>1. Eligibility</h3>
              <p>Chess Arena accounts are intended for users age 13 or older. You must provide accurate signup information and keep your login credentials secure.</p>
            </div>

            <div className="policy-section">
              <h3>2. Fair play and acceptable use</h3>
              <p>Do not cheat in human-vs-human rated games, abuse other players, automate attacks, interfere with the service, impersonate others, or attempt to access accounts or data without authorization.</p>
            </div>

            <div className="policy-section">
              <h3>3. Service availability</h3>
              <p>Chess Arena is an evolving software project. Features may change, be interrupted, contain bugs, or be removed. The service is provided without a guarantee of uninterrupted availability.</p>
            </div>

            <div className="policy-section">
              <h3>4. Ratings and moderation</h3>
              <p>Ratings, bans, reports, leaderboards, and moderation decisions are application features. Accounts may be restricted for security, abuse, cheating, or rule violations.</p>
            </div>

            <div className="policy-section">
              <h3>5. Payments</h3>
              <p>Chess Arena currently does not offer paid subscriptions, in-app purchases, or hidden fees. If paid features are introduced later, pricing and refund terms should be shown before charging users.</p>
            </div>

            <div className="policy-section">
              <h3>6. Contact</h3>
              <p>Questions or reports can be submitted through Chess Arena's Report a Problem feature or the dvilrgamerz/chess GitHub issue tracker.</p>
            </div>
            {closeButton}
          </article>
        )}

        {type === "cookies" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Shield size={28} className="icon-accent" />
              <h2>Cookie & Browser Storage Policy</h2>
            </div>
            <p className="policy-subtitle">Last updated {lastUpdated}.</p>

            <div className="policy-section">
              <h3>Essential storage</h3>
              <p>Chess Arena uses browser storage for authentication/session handling, security state, app preferences, and remembering that you acknowledged the privacy notice. This storage is necessary for core account features.</p>
            </div>

            <div className="policy-section">
              <h3>No advertising trackers</h3>
              <p>The current app does not intentionally install advertising, behavioral profiling, or cross-site tracking cookies. If analytics or advertising is added later, this policy and any required consent controls should be updated first.</p>
            </div>

            <div className="policy-section">
              <h3>Clearing storage</h3>
              <p>You can clear site data using your browser settings. Doing so may sign you out and reset local preferences.</p>
            </div>
            {closeButton}
          </article>
        )}

        {type === "refunds" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Shield size={28} className="icon-accent" />
              <h2>Refund Policy</h2>
            </div>
            <p className="policy-subtitle">Last updated {lastUpdated}.</p>
            <div className="policy-section">
              <h3>Current status</h3>
              <p>Chess Arena currently has no paid subscription, purchase checkout, or in-app payment system. Because the current service does not charge users, there is currently nothing to refund.</p>
            </div>
            <div className="policy-section">
              <h3>Future paid features</h3>
              <p>If paid features are introduced, the applicable price, billing terms, cancellation method, and refund rules should be disclosed before the user completes a purchase.</p>
            </div>
            {closeButton}
          </article>
        )}

        {type === "accessibility" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Shield size={28} className="icon-accent" />
              <h2>Accessibility Statement</h2>
            </div>
            <p className="policy-subtitle">Chess Arena aims to improve accessibility continuously; this is not a claim of formal WCAG certification.</p>
            <div className="policy-section">
              <h3>Current features</h3>
              <ul>
                <li>Keyboard-focusable controls and visible focus treatment.</li>
                <li>Reduced-motion setting.</li>
                <li>Text labels for important icon controls.</li>
                <li>Responsive layout and high-contrast dark interface.</li>
                <li>Show/hide password controls with accessible labels.</li>
              </ul>
            </div>
            <div className="policy-section">
              <h3>Feedback</h3>
              <p>If a control is difficult to use with a keyboard, screen reader, zoom, or another assistive technology, report the exact screen and problem through Report a Problem.</p>
            </div>
            {closeButton}
          </article>
        )}

        {type === "licenses" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Shield size={28} className="icon-accent" />
              <h2>Third-Party & Asset Notices</h2>
            </div>
            <div className="policy-section">
              <h3>Core open-source libraries</h3>
              <ul>
                <li>React / React DOM — MIT</li>
                <li>Supabase JavaScript client — MIT</li>
                <li>chess.js — BSD-2-Clause</li>
                <li>Lucide React icons — ISC</li>
              </ul>
            </div>
            <div className="policy-section">
              <h3>Fonts and images</h3>
              <p>The main UI uses the device/system font stack and does not require a bundled commercial font. Project assets should only be added when their license or permission allows the intended use.</p>
            </div>
            <div className="policy-section">
              <h3>Repository notices</h3>
              <p>See THIRD_PARTY_NOTICES.md in the repository for the maintained dependency summary. Dependency licenses remain subject to their original license texts.</p>
            </div>
            {closeButton}
          </article>
        )}

        {type === "guidelines" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Shield size={28} className="icon-accent" />
              <h2>Community Guidelines</h2>
            </div>
            <p className="policy-subtitle">Chess Arena is built for clean, fair, and friendly competition.</p>
            <div className="policy-section">
              <h3>1. Fair Play & Anti-Cheating</h3>
              <p>Engine assistance, bot automation during human online games, account manipulation, or intentionally exploiting rating systems is prohibited unless a mode clearly says assistance is allowed.</p>
            </div>
            <div className="policy-section">
              <h3>2. Respect</h3>
              <p>Do not harass, threaten, discriminate against, impersonate, or abuse other players.</p>
            </div>
            <div className="policy-section">
              <h3>3. Privacy & Safety</h3>
              <p>Do not publish another person's private information or attempt to obtain passwords, tokens, addresses, phone numbers, or account credentials.</p>
            </div>
            {closeButton}
          </article>
        )}

        {type === "report" && (
          <article className="policy-doc">
            <div className="policy-header">
              <AlertTriangle size={28} className="icon-danger" />
              <h2>Report a Player / Problem</h2>
            </div>
            {reportSuccess ? (
              <div className="policy-success">
                <CheckCircle size={40} className="icon-accent" />
                <h3>Report Submitted</h3>
                <p>Thank you for helping keep Chess Arena safe. The report has been recorded for review.</p>
                <button className="primary full mt-4" onClick={onClose}>Done</button>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="modal-form">
                <label>
                  Report Target / Player
                  <input className="name-input" value={reportTarget} onChange={(e) => setReportTarget(e.target.value)} placeholder="Username or Game ID" required />
                </label>
                <label>
                  Reason
                  <select className="setting-item select" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                    <option value="harassment">Harassment or Abusive Behavior</option>
                    <option value="cheating">Cheating / Engine Assistance</option>
                    <option value="spam">Spam or Unwanted Messaging</option>
                    <option value="personal_info">Sharing Personal Information</option>
                    <option value="privacy">Privacy / Data Concern</option>
                    <option value="accessibility">Accessibility Problem</option>
                    <option value="other">Other Violation</option>
                  </select>
                </label>
                <label>
                  Details (Optional)
                  <textarea className="report-textarea" rows={3} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="Provide context or description of the issue..." />
                </label>
                {error && <p className="form-error">{error}</p>}
                <div className="modal-actions">
                  <button className="secondary" type="button" onClick={onClose}>Cancel</button>
                  <button className="danger" type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit Report"}</button>
                </div>
              </form>
            )}
          </article>
        )}

        {type === "delete" && (
          <article className="policy-doc">
            <div className="policy-header">
              <Trash2 size={28} className="icon-danger" />
              <h2>Delete Account & Data</h2>
            </div>
            <p className="policy-subtitle danger-text">This action is permanent and cannot be undone.</p>
            <p>Deleting your account removes your Chess Arena profile, ratings, completed game records, stats, saved preferences, and account authentication record as handled by the deletion backend.</p>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions mt-4">
              <button className="secondary" type="button" onClick={onClose} disabled={busy}>Keep My Account</button>
              <button className="danger" type="button" onClick={handleDeleteAccount} disabled={busy}>{busy ? "Deleting..." : "Permanently Delete Account"}</button>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
