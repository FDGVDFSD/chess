import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { PolicyModalType } from "./PolicyModals.js";

const noticeKey = "chess-arena-storage-notice-v1";

export function PrivacyNoticeBanner({
  onOpenPolicy
}: {
  onOpenPolicy: (type: PolicyModalType) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(noticeKey) !== "acknowledged");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function acknowledge() {
    try {
      localStorage.setItem(noticeKey, "acknowledged");
    } catch {
      // The notice can still be dismissed for this page load when storage is unavailable.
    }
    setVisible(false);
  }

  return (
    <aside className="privacy-notice" role="region" aria-label="Privacy and storage notice">
      <div className="privacy-notice-copy">
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>Privacy & storage notice</strong>
          <span>
            Chess Arena currently uses essential browser storage for sign-in, security, and preferences.
            It does not intentionally use advertising or cross-site tracking cookies.
          </span>
        </div>
      </div>
      <div className="privacy-notice-actions">
        <button className="text-link" type="button" onClick={() => onOpenPolicy("cookies")}>
          Cookie & Storage Policy
        </button>
        <button className="primary" type="button" onClick={acknowledge}>
          Continue
        </button>
      </div>
    </aside>
  );
}
