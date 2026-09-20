import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import type { Side, TimeControl } from "../../shared/types.js";

interface GameClockProps {
  timeControl?: TimeControl;
  activeSide: Side | null;
  whiteMsRemaining?: number;
  blackMsRemaining?: number;
  turnStartedAt?: string;
  onTimeout?: (flaggedSide: Side) => void;
  disabled?: boolean;
}

export const GameClock = React.memo(function GameClock({
  timeControl,
  activeSide,
  whiteMsRemaining,
  blackMsRemaining,
  turnStartedAt,
  onTimeout,
  disabled
}: GameClockProps) {
  if (!timeControl || timeControl.category === "unlimited") {
    return null;
  }

  const controlled =
    typeof whiteMsRemaining === "number" &&
    typeof blackMsRemaining === "number" &&
    Boolean(turnStartedAt);

  const [whiteLocal, setWhiteLocal] = useState(timeControl.initialSec * 1000);
  const [blackLocal, setBlackLocal] = useState(timeControl.initialSec * 1000);
  const [now, setNow] = useState(() => Date.now());
  const timeoutKeyRef = useRef("");

  useEffect(() => {
    if (controlled || disabled || !activeSide) return;

    const interval = window.setInterval(() => {
      if (activeSide === "white") {
        setWhiteLocal((previous) => Math.max(0, previous - 100));
      } else {
        setBlackLocal((previous) => Math.max(0, previous - 100));
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [activeSide, controlled, disabled]);

  useEffect(() => {
    if (!controlled || disabled || !activeSide) return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [controlled, disabled, activeSide]);

  useEffect(() => {
    if (!controlled) {
      setWhiteLocal(timeControl.initialSec * 1000);
      setBlackLocal(timeControl.initialSec * 1000);
    }
  }, [timeControl.id, controlled, timeControl.initialSec]);

  const displayed = useMemo(() => {
    if (!controlled) {
      return { white: whiteLocal, black: blackLocal };
    }

    const started = Date.parse(turnStartedAt!);
    const elapsed = Number.isFinite(started) && activeSide ? Math.max(0, now - started) : 0;

    return {
      white:
        activeSide === "white"
          ? Math.max(0, (whiteMsRemaining ?? 0) - elapsed)
          : Math.max(0, whiteMsRemaining ?? 0),
      black:
        activeSide === "black"
          ? Math.max(0, (blackMsRemaining ?? 0) - elapsed)
          : Math.max(0, blackMsRemaining ?? 0)
    };
  }, [
    controlled,
    whiteLocal,
    blackLocal,
    whiteMsRemaining,
    blackMsRemaining,
    turnStartedAt,
    activeSide,
    now
  ]);

  useEffect(() => {
    if (disabled || !activeSide || !onTimeout) return;
    const remaining = activeSide === "white" ? displayed.white : displayed.black;
    if (remaining > 0) return;

    const key = `${activeSide}:${turnStartedAt ?? "local"}`;
    if (timeoutKeyRef.current === key) return;
    timeoutKeyRef.current = key;
    onTimeout(activeSide);
  }, [activeSide, disabled, displayed.white, displayed.black, onTimeout, turnStartedAt]);

  function formatTime(ms: number) {
    const safe = Math.max(0, ms);
    const totalSec = Math.floor(safe / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;

    if (safe <= 10000 && safe > 0) {
      const tenths = Math.floor((safe % 1000) / 100);
      return `${sec}.${tenths}s`;
    }

    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  }

  return (
    <div className="game-clock-container">
      <div
        className={`clock-box ${activeSide === "black" ? "active" : ""} ${displayed.black <= 10000 ? "low-time" : ""}`}
      >
        <Clock size={14} />
        <span>Black: {formatTime(displayed.black)}</span>
      </div>
      <div
        className={`clock-box ${activeSide === "white" ? "active" : ""} ${displayed.white <= 10000 ? "low-time" : ""}`}
      >
        <Clock size={14} />
        <span>White: {formatTime(displayed.white)}</span>
      </div>
    </div>
  );
});
