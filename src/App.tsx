import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  AlertTriangle,
  BadgeInfo,
  BookOpen,
  Bot,
  Crown,
  Flame,
  History,
  LogOut,
  Medal,
  MonitorSmartphone,
  Play,
  Puzzle as PuzzleIcon,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Swords,
  Target,
  Trash2,
  Trophy,
  User,
  UserX,
  Users,
  Volume2,
  Wifi,
  Zap
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { getGameResult, sideFromTurn, tryMove } from "../shared/chess.js";
import { isSupabaseConfigured } from "./lib/supabase.js";
import {
  createFriendRoomSupabase,
  joinFriendRoomSupabase,
  submitOnlineMoveSupabase,
  subscribeToOnlineGameRealtime
} from "./lib/supabaseOnline.js";
import type {
  Announcement,
  BoardTheme,
  BotLevel,
  GameEndReason,
  GameRecord,
  GameResult,
  GameSnapshot,
  LeaderboardRow,
  LastMove,
  PieceStyle,
  PlayerSeat,
  PublicUser,
  Side,
  TimeControl,
  UserSettings
} from "../shared/types.js";
import { AuthPanel } from "./components/AuthPanel.js";
import { ChessBoard } from "./components/ChessBoard.js";
import {
  buildGameRecord,
  capturedFromFen,
  formatResult,
  pieceSymbols,
  title
} from "./lib/chessDisplay.js";
import {
  blockPlayer,
  currentSession,
  getAnnouncements,
  getApiBaseUrl,
  getHistory,
  getLeaderboard,
  getToken,
  logout,
  saveGame,
  setToken,
  updateSettings
} from "./lib/api.js";
import { playSound, type SoundType } from "./lib/sounds.js";
import { PolicyModals, type PolicyModalType } from "./components/PolicyModals.js";
import { JarvisWidget } from "./components/JarvisWidget.js";
import { AdminPanel } from "./components/AdminPanel.js";
import { GameAnalysisView } from "./components/GameAnalysisView.js";
import { PuzzlesView } from "./components/PuzzlesView.js";
import { OpeningsView } from "./components/OpeningsView.js";
import { TournamentsView } from "./components/TournamentsView.js";
import { ProfileView } from "./components/ProfileView.js";
import { GameClock } from "./components/GameClock.js";
import { useBotWorker } from "./lib/useBotWorker.js";
import { useJarvisWorker } from "./lib/useJarvisWorker.js";

type View =
  | "dashboard"
  | "bot"
  | "two-player"
  | "online"
  | "puzzles"
  | "openings"
  | "tournaments"
  | "leaderboard"
  | "history"
  | "profile"
  | "settings"
  | "admin";

const timeControlsList: TimeControl[] = [
  { id: "bullet-1", name: "1+0 Bullet", category: "bullet", initialSec: 60, incSec: 0 },
  { id: "blitz-3", name: "3+0 Blitz", category: "blitz", initialSec: 180, incSec: 0 },
  { id: "blitz-5", name: "5+0 Blitz", category: "blitz", initialSec: 300, incSec: 0 },
  { id: "rapid-10", name: "10+0 Rapid", category: "rapid", initialSec: 600, incSec: 0 },
  { id: "unlimited", name: "Unlimited Time", category: "unlimited", initialSec: 0, incSec: 0 }
];

function detectMoveSound(chess: Chess, from: string, to: string): SoundType {
  const history = chess.history({ verbose: true });
  const lastEntry = history[history.length - 1];
  if (!lastEntry) return "move";
  if (chess.inCheck()) return "check";
  if (lastEntry.flags.includes("k") || lastEntry.flags.includes("q")) return "castle";
  if (lastEntry.captured) return "capture";
  return "move";
}

function applyAnimationVars(settings: UserSettings) {
  const root = document.documentElement;
  root.style.setProperty("--move-speed", `${settings.animationSpeed}ms`);
  if (settings.reducedMotion) {
    root.classList.add("reduced-motion");
  } else {
    root.classList.remove("reduced-motion");
  }
}

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [policyModal, setPolicyModal] = useState<PolicyModalType>(null);
  const [reportTarget, setReportTarget] = useState<string | undefined>();

  // Announcement State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Selected game for post-analysis
  const [analyzingGame, setAnalyzingGame] = useState<GameRecord | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    currentSession()
      .then((session) => setUser(session.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));

    getAnnouncements()
      .then((res) => setAnnouncements(res.announcements.filter((a) => a.active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleLogout() {
      setUser(null);
      setView("dashboard");
    }
    window.addEventListener("chess-arena:logout", handleLogout);
    return () => window.removeEventListener("chess-arena:logout", handleLogout);
  }, []);

  useEffect(() => {
    if (user) {
      applyAnimationVars(user.settings);
    }
  }, [user?.settings.animationSpeed, user?.settings.reducedMotion]);

  if (loading) {
    return (
      <div className="loading-screen">
        <Crown size={42} />
        <span>Loading Chess Arena v2...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthPanel onAuthed={setUser} />;
  }

  function openReportModal(target?: string) {
    setReportTarget(target);
    setPolicyModal("report");
  }

  const baseNavItems: Array<{ view: View; label: string; icon: typeof Play }> = [
    { view: "dashboard", label: "Play", icon: Play },
    { view: "bot", label: "Bot", icon: Bot },
    { view: "online", label: "Online", icon: Wifi },
    { view: "puzzles", label: "Puzzles", icon: PuzzleIcon },
    { view: "openings", label: "Openings", icon: BookOpen },
    { view: "tournaments", label: "Tournaments", icon: Trophy },
    { view: "two-player", label: "2 Players", icon: Users },
    { view: "leaderboard", label: "Leaderboard", icon: Medal },
    { view: "history", label: "History", icon: History },
    { view: "profile", label: "Profile", icon: User },
    { view: "settings", label: "Settings", icon: Settings }
  ];

  if (user.role === "owner") {
    baseNavItems.push({ view: "admin", label: "👑 Admin", icon: Shield });
  }

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <Crown size={28} className={user.role === "owner" ? "icon-accent" : ""} />
            <div>
              <strong>Chess Arena v2</strong>
              <span>
                {user.username} {user.role === "owner" ? "👑 OWNER" : ""}
              </span>
            </div>
          </div>
          <nav>
            {baseNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.view}
                  className={view === item.view ? "active" : ""}
                  onClick={() => {
                    setView(item.view);
                    setAnalyzingGame(null);
                  }}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <button
            className="ghost logout"
            onClick={() => {
              void logout();
              setUser(null);
              setView("dashboard");
            }}
          >
            <LogOut size={18} /> Log out
          </button>
        </aside>

        <main className="main-panel">
          {/* Site Announcement Banner */}
          {announcements.length > 0 && view === "dashboard" && (
            <div className="announcement-banner">
              <Crown size={20} className="icon-accent" />
              <div>
                <strong>{announcements[0].title}</strong>
                <span>{announcements[0].content}</span>
              </div>
            </div>
          )}

          {analyzingGame ? (
            <GameAnalysisView
              game={analyzingGame}
              boardTheme={user.settings.boardTheme}
              pieceStyle={user.settings.pieceStyle}
              onClose={() => setAnalyzingGame(null)}
            />
          ) : (
            <>
              {view === "dashboard" ? (
                <Dashboard user={user} setView={setView} onOpenPolicy={(type) => setPolicyModal(type)} />
              ) : null}
              {view === "bot" ? (
                <BotGame user={user} onUserUpdate={setUser} onAnalyzeGame={(g) => setAnalyzingGame(g)} />
              ) : null}
              {view === "two-player" ? <TwoPlayerGame user={user} /> : null}
              {view === "online" ? (
                <OnlineGame user={user} onUserUpdate={setUser} onReportPlayer={openReportModal} />
              ) : null}
              {view === "puzzles" ? (
                <PuzzlesView
                  user={user}
                  onUserUpdate={setUser}
                  boardTheme={user.settings.boardTheme}
                  pieceStyle={user.settings.pieceStyle}
                />
              ) : null}
              {view === "openings" ? <OpeningsView /> : null}
              {view === "tournaments" ? (
                <TournamentsView user={user} onJoinTournament={() => setView("online")} />
              ) : null}
              {view === "leaderboard" ? <Leaderboard currentUser={user} /> : null}
              {view === "history" ? <HistoryView onSelectAnalysis={(g) => setAnalyzingGame(g)} /> : null}
              {view === "profile" ? <ProfileView user={user} /> : null}
              {view === "settings" ? (
                <SettingsView user={user} onUserUpdate={setUser} onOpenPolicy={(type) => setPolicyModal(type)} />
              ) : null}
              {view === "admin" && user.role === "owner" ? <AdminPanel currentUser={user} /> : null}
            </>
          )}
        </main>
      </div>

      {/* Floating J.A.R.V.I.S. AI Widget (Owner Only) */}
      <JarvisWidget
        user={user}
        onOpenAdminPanel={() => setView("admin")}
      />

      <PolicyModals
        type={policyModal}
        onClose={() => setPolicyModal(null)}
        targetUsername={reportTarget}
        onAccountDeleted={() => {
          setUser(null);
          setView("dashboard");
        }}
      />
    </>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Dashboard({
  user,
  setView,
  onOpenPolicy
}: {
  user: PublicUser;
  setView: (view: View) => void;
  onOpenPolicy: (type: PolicyModalType) => void;
}) {
  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);

  useEffect(() => {
    getHistory()
      .then((res) => setRecentGames(res.games.slice(0, 3)))
      .catch(() => {});
  }, []);

  const challenge = user.dailyChallenge ?? { target: 2, completed: 0 };
  const challengeProgress = Math.min(100, Math.round((challenge.completed / challenge.target) * 100));

  return (
    <section className="dashboard">
      <div className="dashboard-hero">
        <div className="hero-meta">
          <span className="hero-rating">RATING {user.rating}</span>
          <span className="hero-streak">
            <Flame size={16} /> {user.streak ?? 1} Day Streak
          </span>
          <span className="hero-best">
            <Crown size={16} /> Best: {user.bestRating ?? user.rating}
          </span>
        </div>

        <h1 className="hero-greeting">
          {getGreeting()}, {user.username}!
        </h1>
        <p className="hero-subtitle">Ready to play? Jump into a game or challenge the bot ladder.</p>

        <div className="hero-actions">
          <button className="hero-btn primary-glow" onClick={() => setView("bot")}>
            <Play size={20} /> Play Now
          </button>
          <button className="hero-btn secondary-glow" onClick={() => setView("online")}>
            <Wifi size={20} /> Quick Match
          </button>
          <button className="hero-btn secondary-glow" onClick={() => setView("puzzles")}>
            <PuzzleIcon size={20} /> Daily Puzzle
          </button>
        </div>
      </div>

      <div className="stat-strip">
        <AnimatedStat label="Wins" value={user.wins} />
        <AnimatedStat label="Losses" value={user.losses} />
        <AnimatedStat label="Draws" value={user.draws} />
        <AnimatedStat label="Total Games" value={user.wins + user.losses + user.draws} />
      </div>

      <div className="mode-grid">
        <div className="mode-card clickable" onClick={() => setView("bot")}>
          <div className="mode-card-header">
            <Bot size={28} className="icon-accent" />
            <span className="mode-badge">Single Player</span>
          </div>
          <strong>Bot Ladder</strong>
          <span>Level 1 → 10 (God Mode)</span>
          <button className="primary small-btn mt-2">Play Bot</button>
        </div>

        <div className="mode-card clickable" onClick={() => setView("online")}>
          <div className="mode-card-header">
            <Wifi size={28} className="icon-accent" />
            <span className="mode-badge">Multiplayer</span>
          </div>
          <strong>Online Room</strong>
          <span>Friend codes & Matchmaking</span>
          <button className="primary small-btn mt-2">Play Online</button>
        </div>

        <div className="mode-card clickable" onClick={() => setView("puzzles")}>
          <div className="mode-card-header">
            <PuzzleIcon size={28} className="icon-accent" />
            <span className="mode-badge">Tactics</span>
          </div>
          <strong>Chess Puzzles</strong>
          <span>Solve Mate & Tactical Puzzles</span>
          <button className="primary small-btn mt-2">Solve Puzzles</button>
        </div>

        <div className="mode-card clickable" onClick={() => setView("openings")}>
          <div className="mode-card-header">
            <BookOpen size={28} className="icon-accent" />
            <span className="mode-badge">Theory</span>
          </div>
          <strong>Openings Explorer</strong>
          <span>Master Sicilian, Ruy Lopez & More</span>
          <button className="secondary small-btn mt-2">Explore Books</button>
        </div>
      </div>

      <div className="dashboard-lower-grid">
        <div className="dash-card">
          <div className="dash-card-header">
            <History size={20} />
            <strong>Recent Games</strong>
          </div>
          {recentGames.length === 0 ? (
            <p className="muted py-2">No games played yet. Click Play Now to start!</p>
          ) : (
            <div className="recent-list">
              {recentGames.map((g) => {
                const isWhite = g.players.white.id === user.id;
                const opponent = isWhite ? g.players.black : g.players.white;
                const won = (isWhite && g.result === "white") || (!isWhite && g.result === "black");
                const draw = g.result === "draw";
                return (
                  <div key={g.id} className="recent-item">
                    <span className={`result-dot ${won ? "win" : draw ? "draw" : "loss"}`}>
                      {won ? "W" : draw ? "D" : "L"}
                    </span>
                    <div className="recent-info">
                      <strong>
                        vs {opponent.username} {opponent.rating ? `(${opponent.rating})` : ""}
                      </strong>
                      <span>
                        {formatResult(g.result, g.reason)} • {g.moves.length} moves
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <Target size={20} />
            <strong>Daily Challenge</strong>
          </div>
          <div className="challenge-body">
            <div className="challenge-title">
              <span>Win or complete 2 games today</span>
              <strong>
                Progress {challenge.completed} / {challenge.target}
              </strong>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${challengeProgress}%` }} />
            </div>
            <p className="muted text-sm mt-2">
              {challenge.completed >= challenge.target
                ? "🎉 Daily Challenge Complete! Great job!"
                : "Complete games to earn streak points and rating progress."}
            </p>
          </div>
        </div>
      </div>

      <footer className="dashboard-footer">
        <div className="footer-privacy">
          <Shield size={16} />
          <span>Chess Arena v2 Platform</span>
        </div>
        <div className="policy-links">
          <button type="button" className="text-link" onClick={() => onOpenPolicy("privacy")}>
            Privacy Policy
          </button>
          <span>•</span>
          <button type="button" className="text-link" onClick={() => onOpenPolicy("terms")}>
            Terms
          </button>
          <span>•</span>
          <button type="button" className="text-link" onClick={() => onOpenPolicy("guidelines")}>
            Community Guidelines
          </button>
          <span>•</span>
          <button type="button" className="text-link" onClick={() => onOpenPolicy("report")}>
            Report a Problem
          </button>
        </div>
      </footer>
    </section>
  );
}

function BotGame({
  user,
  onUserUpdate,
  onAnalyzeGame
}: {
  user: PublicUser;
  onUserUpdate: (user: PublicUser) => void;
  onAnalyzeGame?: (game: GameRecord) => void;
}) {
  const [level, setLevel] = useState<BotLevel>(4);
  const [playerColor, setPlayerColor] = useState<Side>("white");
  const [timeControl, setTimeControl] = useState<TimeControl>(timeControlsList[3]);
  const [fen, setFen] = useState(() => new Chess().fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<LastMove | undefined>();
  const [startedAt, setStartedAt] = useState(new Date().toISOString());
  const [gameId, setGameId] = useState(() => crypto.randomUUID());
  const [outcome, setOutcome] = useState<{ result: GameResult; reason: GameEndReason } | null>(null);
  const [lastCompletedGame, setLastCompletedGame] = useState<GameRecord | null>(null);
  const [saveStatus, setSaveStatus] = useState("");
  const botThinkingRef = useRef(false);
  const gameEndSoundPlayed = useRef(false);

  const botSeat: PlayerSeat = {
    username: level === 10 ? "God Mode Bot" : `Bot Level ${level}`,
    kind: "bot",
    rating: 700 + level * 140
  };
  const humanSeat: PlayerSeat = {
    id: user.id,
    username: user.username,
    role: user.role,
    kind: "human",
    rating: user.rating
  };
  const white = playerColor === "white" ? humanSeat : botSeat;
  const black = playerColor === "black" ? humanSeat : botSeat;
  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = sideFromTurn(chess.turn());

  const botEnabled = !outcome && turn !== playerColor && !chess.isGameOver();
  const { move: workerMove, thinking: workerThinking } = useBotWorker(fen, level, botEnabled);

  useEffect(() => {
    botThinkingRef.current = workerThinking;
  }, [workerThinking]);

  useEffect(() => {
    if (!workerMove || !botEnabled) return;

    const timer = window.setTimeout(() => {
      const active = new Chess(fen);
      if (active.turn() === (playerColor === "white" ? "w" : "b") || active.isGameOver()) return;

      const made = active.move(workerMove);
      if (!made) return;

      const nextMoves = [...moves, made.san];
      setFen(active.fen());
      setMoves(nextMoves);
      setLastMove({ from: made.from, to: made.to, san: made.san });

      const soundType = detectMoveSound(active, made.from, made.to);
      playSound(soundType, user.settings);

      const result = getGameResult(active);
      if (result) finishGame(result.result, result.reason, active.fen(), nextMoves);
    }, user.settings.botDelayMs);

    return () => window.clearTimeout(timer);
  }, [workerMove, botEnabled, fen, moves, playerColor, user.settings.botDelayMs]);

  function newGame() {
    const fresh = new Chess();
    setFen(fresh.fen());
    setMoves([]);
    setLastMove(undefined);
    setStartedAt(new Date().toISOString());
    setGameId(crypto.randomUUID());
    setOutcome(null);
    setLastCompletedGame(null);
    setSaveStatus("");
    botThinkingRef.current = false;
    gameEndSoundPlayed.current = false;
    playSound("gameStart", user.settings);
  }

  function makeMove(move: { from: string; to: string; promotion?: string }) {
    if (turn !== playerColor || outcome) {
      return;
    }
    const active = new Chess(fen);
    const made = tryMove(active, move.from, move.to, move.promotion ?? "q");
    if (!made) {
      return;
    }
    const nextMoves = [...moves, made.san];
    setFen(active.fen());
    setMoves(nextMoves);
    setLastMove({ from: made.from, to: made.to, san: made.san });

    const soundType = detectMoveSound(active, made.from, made.to);
    playSound(soundType, user.settings);

    const result = getGameResult(active);
    if (result) {
      finishGame(result.result, result.reason, active.fen(), nextMoves);
    }
  }

  function resign() {
    finishGame(playerColor === "white" ? "black" : "white", "resign", fen, moves);
  }

  function finishGame(result: GameResult, reason: GameEndReason, finalFen: string, finalMoves: string[]) {
    if (outcome) {
      return;
    }
    setOutcome({ result, reason });

    if (!gameEndSoundPlayed.current) {
      gameEndSoundPlayed.current = true;
      playSound("gameEnd", user.settings);
    }

    const record = buildGameRecord({
      id: gameId,
      mode: "bot",
      timeControl,
      white,
      black,
      result,
      reason,
      moves: finalMoves,
      finalFen,
      startedAt
    });
    setLastCompletedGame(record);
    setSaveStatus("Saving...");
    saveGame(record)
      .then(() => currentSession())
      .then((session) => {
        onUserUpdate(session.user);
        setSaveStatus("Saved to history");
      })
      .catch((error) => setSaveStatus(error instanceof Error ? error.message : "Could not save game."));
  }

  return (
    <section className="play-screen">
      <div className="toolbar">
        <div>
          <span className="eyebrow">Bot Mode</span>
          <h1>{level === 10 ? "God Mode challenge" : `Level ${level} training`}</h1>
        </div>
        <div className="toolbar-actions">
          <select
            className="setting-item select inline-select"
            value={timeControl.id}
            onChange={(e) => {
              const tc = timeControlsList.find((t) => t.id === e.target.value);
              if (tc) setTimeControl(tc);
            }}
          >
            {timeControlsList.map((tc) => (
              <option key={tc.id} value={tc.id}>
                {tc.name}
              </option>
            ))}
          </select>

          <label className="compact-label">
            Level
            <input
              type="range"
              min={1}
              max={10}
              value={level}
              onChange={(event) => setLevel(Number(event.target.value) as BotLevel)}
            />
            <strong>{level}</strong>
          </label>

          <div className="segmented small">
            <button className={playerColor === "white" ? "active" : ""} onClick={() => setPlayerColor("white")}>
              White
            </button>
            <button className={playerColor === "black" ? "active" : ""} onClick={() => setPlayerColor("black")}>
              Black
            </button>
          </div>
          <button className="secondary" onClick={newGame}>
            <RefreshCw size={16} /> New Game
          </button>
        </div>
      </div>

      <GameLayout
        user={user}
        fen={fen}
        moves={moves}
        lastMove={lastMove}
        settings={user.settings}
        orientation={playerColor}
        interactiveSide={outcome || botThinkingRef.current ? null : playerColor}
        timeControl={timeControl}
        onTimeout={(flagged) => finishGame(flagged === "white" ? "black" : "white", "timeout", fen, moves)}
        onMove={makeMove}
        white={white}
        black={black}
        status={
          outcome
            ? formatResult(outcome.result, outcome.reason)
            : botThinkingRef.current
            ? "Bot is thinking..."
            : `${title(turn)} to move`
        }
        actions={
          <>
            <button className="danger" onClick={resign} disabled={Boolean(outcome)}>
              Resign
            </button>
            {level === 10 ? <span className="god-badge">God Mode</span> : null}
            {outcome && lastCompletedGame && onAnalyzeGame && (
              <button className="primary" onClick={() => onAnalyzeGame(lastCompletedGame)}>
                🔍 Analyze Game
              </button>
            )}
          </>
        }
        result={outcome}
        footer={saveStatus}
      />
    </section>
  );
}

function TwoPlayerGame({ user }: { user: PublicUser }) {
  const [fen, setFen] = useState(() => new Chess().fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<LastMove | undefined>();
  const [startedAt, setStartedAt] = useState(new Date().toISOString());
  const [gameId, setGameId] = useState(() => crypto.randomUUID());
  const [outcome, setOutcome] = useState<{ result: GameResult; reason: GameEndReason } | null>(null);
  const [whiteName, setWhiteName] = useState(user.username);
  const [blackName, setBlackName] = useState("Friend");
  const [saveStatus, setSaveStatus] = useState("");
  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = sideFromTurn(chess.turn());
  const white: PlayerSeat = { id: user.id, username: whiteName || user.username, kind: "human", rating: user.rating };
  const black: PlayerSeat = { username: blackName || "Friend", kind: "guest", rating: 1000 };
  const gameEndSoundPlayed = useRef(false);

  function reset() {
    const fresh = new Chess();
    setFen(fresh.fen());
    setMoves([]);
    setLastMove(undefined);
    setStartedAt(new Date().toISOString());
    setGameId(crypto.randomUUID());
    setOutcome(null);
    setSaveStatus("");
    gameEndSoundPlayed.current = false;
    playSound("gameStart", user.settings);
  }

  function makeMove(move: { from: string; to: string; promotion?: string }) {
    if (outcome) {
      return;
    }
    const active = new Chess(fen);
    const made = tryMove(active, move.from, move.to, move.promotion ?? "q");
    if (!made) {
      return;
    }
    const nextMoves = [...moves, made.san];
    setFen(active.fen());
    setMoves(nextMoves);
    setLastMove({ from: made.from, to: made.to, san: made.san });

    const soundType = detectMoveSound(active, made.from, made.to);
    playSound(soundType, user.settings);

    const result = getGameResult(active);
    if (result) {
      finish(result.result, result.reason, active.fen(), nextMoves);
    }
  }

  function finish(result: GameResult, reason: GameEndReason, finalFen: string, finalMoves: string[]) {
    if (outcome) {
      return;
    }
    setOutcome({ result, reason });

    if (!gameEndSoundPlayed.current) {
      gameEndSoundPlayed.current = true;
      playSound("gameEnd", user.settings);
    }

    setSaveStatus("Saving...");
    saveGame(
      buildGameRecord({
        id: gameId,
        mode: "pass-and-play",
        white,
        black,
        result,
        reason,
        moves: finalMoves,
        finalFen,
        startedAt
      })
    )
      .then(() => setSaveStatus("Saved to history"))
      .catch((error) => setSaveStatus(error instanceof Error ? error.message : "Could not save game."));
  }

  return (
    <section className="play-screen">
      <div className="toolbar">
        <div>
          <span className="eyebrow">Same Screen</span>
          <h1>Two-player board</h1>
        </div>
        <div className="toolbar-actions">
          <input className="name-input" value={whiteName} onChange={(event) => setWhiteName(event.target.value)} />
          <input className="name-input" value={blackName} onChange={(event) => setBlackName(event.target.value)} />
          <button className="secondary" onClick={reset}>
            <RefreshCw size={16} /> New Game
          </button>
        </div>
      </div>
      <GameLayout
        user={user}
        fen={fen}
        moves={moves}
        lastMove={lastMove}
        settings={user.settings}
        orientation={user.settings.autoFlip ? turn : "white"}
        interactiveSide={outcome ? null : "both"}
        onMove={makeMove}
        white={white}
        black={black}
        status={outcome ? formatResult(outcome.result, outcome.reason) : `${title(turn)} to move`}
        actions={
          <button className="danger" onClick={() => finish(turn === "white" ? "black" : "white", "resign", fen, moves)} disabled={Boolean(outcome)}>
            {title(turn)} resigns
          </button>
        }
        result={outcome}
        footer={saveStatus}
      />
    </section>
  );
}

interface OnlineAck {
  ok: boolean;
  error?: string;
  queued?: boolean;
  roomCode?: string;
  gameId?: string;
  playerColor?: Side;
  snapshot?: GameSnapshot;
}

type ConnectionStatus = "connected" | "reconnecting" | "offline";

function OnlineGame({
  user,
  onUserUpdate,
  onReportPlayer
}: {
  user: PublicUser;
  onUserUpdate: (u: PublicUser) => void;
  onReportPlayer: (target?: string) => void;
}) {
  const [socketReady, setSocketReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("offline");
  const [message, setMessage] = useState("Connecting...");
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [playerColor, setPlayerColor] = useState<Side | null>(null);
  const [preferredColor, setPreferredColor] = useState<Side>("white");
  const [joinCode, setJoinCode] = useState("");
  const [queued, setQueued] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const gameEndSoundPlayed = useRef(false);
  const prevSnapshotRef = useRef<GameSnapshot | null>(null);

  useEffect(() => {
    const socket = io(getApiBaseUrl() || undefined, {
      auth: { token: getToken() },
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketReady(true);
      setConnectionStatus("connected");
      setMessage("Online server ready");
    });
    socket.on("connect_error", (error) => {
      setSocketReady(false);
      setConnectionStatus("offline");
      setMessage(error.message);
    });
    socket.on("disconnect", () => {
      setSocketReady(false);
      setConnectionStatus("offline");
    });
    socket.io.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
    });
    socket.io.on("reconnect", () => {
      setSocketReady(true);
      setConnectionStatus("connected");
      setMessage("Reconnected");
    });
    socket.on("game:update", (state: GameSnapshot) => applySnapshot(state));
    socket.on("random:matched", (payload: { snapshot: GameSnapshot; playerColor: Side }) => {
      setQueued(false);
      setPlayerColor(payload.playerColor);
      applySnapshot(payload.snapshot);
      setMessage("Random match found");
      playSound("gameStart", user.settings);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function applySnapshot(state: GameSnapshot) {
    const prev = prevSnapshotRef.current;

    if (prev && state.moves.length > prev.moves.length && state.status === "active") {
      const tempChess = new Chess();
      for (const san of state.moves) {
        tempChess.move(san);
      }
      if (tempChess.inCheck()) {
        playSound("check", user.settings);
      } else {
        const lastEntry = tempChess.history({ verbose: true });
        const last = lastEntry[lastEntry.length - 1];
        if (last?.captured) {
          playSound("capture", user.settings);
        } else if (last?.flags.includes("k") || last?.flags.includes("q")) {
          playSound("castle", user.settings);
        } else {
          playSound("move", user.settings);
        }
      }
    }

    if (state.status === "complete" && prev?.status !== "complete" && !gameEndSoundPlayed.current) {
      gameEndSoundPlayed.current = true;
      playSound("gameEnd", user.settings);
    }

    prevSnapshotRef.current = state;
    setSnapshot(state);

    const color = state.players.white?.id === user.id ? "white" : state.players.black?.id === user.id ? "black" : null;
    setPlayerColor(color);
  }

  function emit(event: string, payload: unknown, onOk?: (ack: OnlineAck) => void) {
    const socket = socketRef.current;
    if (!socket) {
      setMessage("Socket is not connected.");
      return;
    }
    socket.emit(event, payload, (ack: OnlineAck) => {
      if (!ack.ok) {
        setMessage(ack.error ?? "Online action failed.");
        return;
      }
      if (ack.snapshot) {
        applySnapshot(ack.snapshot);
      }
      if (ack.playerColor) {
        setPlayerColor(ack.playerColor);
      }
      onOk?.(ack);
    });
  }

  function createRoom() {
    if (isSupabaseConfigured) {
      createFriendRoomSupabase(user, preferredColor, { id: "blitz_5_0", name: "5 min Blitz", category: "blitz", initialSec: 300, incSec: 0 })
        .then(({ roomCode, gameId, playerColor: color }) => {
          setQueued(false);
          setPlayerColor(color);
          setMessage(`Room ${roomCode} is ready`);
          subscribeToOnlineGameRealtime(gameId, (snap) => applySnapshot(snap));
        })
        .catch((err) => setMessage(err.message));
      return;
    }

    emit("friend:create", { preferredColor }, (ack) => {
      setQueued(false);
      setMessage(`Room ${ack.roomCode} is ready`);
    });
  }

  function joinRoom() {
    if (isSupabaseConfigured) {
      joinFriendRoomSupabase(user, joinCode)
        .then(({ gameId, playerColor: color, snapshot: snap }) => {
          setQueued(false);
          setPlayerColor(color);
          applySnapshot(snap);
          setMessage("Joined friend room");
          playSound("gameStart", user.settings);
          subscribeToOnlineGameRealtime(gameId, (updatedSnap) => applySnapshot(updatedSnap));
        })
        .catch((err) => setMessage(err.message));
      return;
    }

    emit("friend:join", { roomCode: joinCode }, () => {
      setQueued(false);
      setMessage("Joined friend room");
      playSound("gameStart", user.settings);
    });
  }

  function joinRandom() {
    emit("random:join", null, (ack) => {
      setQueued(Boolean(ack.queued));
      setMessage(ack.queued ? "Waiting for a random opponent" : "Random match found");
    });
  }

  function leaveQueue() {
    emit("random:leave", null, () => {
      setQueued(false);
      setMessage("Left random queue");
    });
  }

  function handleOnlineMove(move: { from: string; to: string; promotion?: string }) {
    if (!snapshot) return;
    const tempChess = new Chess(snapshot.fen);
    const made = tryMove(tempChess, move.from, move.to, move.promotion ?? "q");
    if (made) {
      const soundType = detectMoveSound(tempChess, move.from, move.to);
      playSound(soundType, user.settings);
    }

    if (isSupabaseConfigured) {
      submitOnlineMoveSupabase(snapshot.id, tempChess.fen(), `${move.from}${move.to}`, move.from, move.to)
        .catch((err) => setMessage(err.message));
      return;
    }

    emit("game:move", { gameId: snapshot.id, ...move });
  }

  function handleRematch() {
    if (!snapshot) return;
    gameEndSoundPlayed.current = false;
    emit("game:rematch", { gameId: snapshot.id });
  }

  async function handleToggleBlock(opponentUsername: string) {
    try {
      const res = await blockPlayer(opponentUsername);
      onUserUpdate(res.user);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not block player.");
    }
  }

  const moves = snapshot?.moves ?? [];
  const turn = snapshot?.turn ?? "white";
  const waiting = snapshot?.status === "waiting";
  const canAcceptDraw = Boolean(snapshot?.drawOfferFrom && snapshot.drawOfferFrom !== playerColor && snapshot.status === "active");

  const connectionLabel = connectionStatus === "connected" ? "Connected" : connectionStatus === "reconnecting" ? "Reconnecting" : "Offline";

  const opponentSeat = playerColor === "white" ? snapshot?.players.black : snapshot?.players.white;
  const isOpponentBlocked = Boolean(opponentSeat?.username && user.blockedUsers?.includes(opponentSeat.username));

  return (
    <section className="play-screen">
      <div className="toolbar">
        <div>
          <span className="eyebrow">Online Server</span>
          <h1>Friend and random games</h1>
        </div>
        <div className="toolbar-actions">
          <div className="connection-indicator">
            <span className={`connection-dot ${connectionStatus}`} />
            {connectionLabel}
          </div>
          <span className={socketReady ? "status-pill online" : "status-pill"}>{message}</span>
        </div>
      </div>

      <div className="online-controls">
        <div className="control-group">
          <div className="segmented small">
            <button className={preferredColor === "white" ? "active" : ""} onClick={() => setPreferredColor("white")}>
              White
            </button>
            <button className={preferredColor === "black" ? "active" : ""} onClick={() => setPreferredColor("black")}>
              Black
            </button>
          </div>
          <button className="primary" disabled={!socketReady} onClick={createRoom}>
            Create room
          </button>
        </div>
        <div className="control-group">
          <input
            className="code-input"
            placeholder="ROOM"
            maxLength={5}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          />
          <button className="secondary" disabled={!socketReady || joinCode.length < 5} onClick={joinRoom}>
            Join
          </button>
        </div>
        <div className="control-group">
          {queued ? (
            <button className="danger" onClick={leaveQueue}>
              Leave queue
            </button>
          ) : (
            <button className="primary" disabled={!socketReady} onClick={joinRandom}>
              Random match
            </button>
          )}
        </div>
      </div>

      {snapshot ? (
        <GameLayout
          user={user}
          fen={snapshot.fen}
          moves={moves}
          lastMove={snapshot.lastMove}
          settings={user.settings}
          orientation={playerColor ?? "white"}
          interactiveSide={snapshot.status === "active" ? playerColor : null}
          onMove={handleOnlineMove}
          white={snapshot.players.white ?? { username: "Waiting", kind: "guest" }}
          black={snapshot.players.black ?? { username: "Waiting", kind: "guest" }}
          status={waiting ? `Room ${snapshot.roomCode} waiting` : snapshot.result ? formatResult(snapshot.result, snapshot.reason) : `${title(turn)} to move`}
          actions={
            <>
              <button className="danger" disabled={snapshot.status !== "active"} onClick={() => emit("game:resign", { gameId: snapshot.id })}>
                Resign
              </button>
              <button className="secondary" disabled={snapshot.status !== "active"} onClick={() => emit("game:draw-offer", { gameId: snapshot.id })}>
                Offer draw
              </button>
              {canAcceptDraw ? (
                <button className="primary" onClick={() => emit("game:draw-accept", { gameId: snapshot.id })}>
                  Accept draw
                </button>
              ) : null}
              <button className="secondary" disabled={snapshot.status !== "complete"} onClick={handleRematch}>
                Rematch
              </button>
            </>
          }
          safetyActions={
            opponentSeat && opponentSeat.kind === "human" && opponentSeat.username !== user.username ? (
              <div className="opponent-safety-bar">
                <button className="text-btn danger-text" onClick={() => onReportPlayer(opponentSeat.username)}>
                  <AlertTriangle size={14} /> Report {opponentSeat.username}
                </button>
                <button className="text-btn" onClick={() => handleToggleBlock(opponentSeat.username)}>
                  <UserX size={14} /> {isOpponentBlocked ? "Unblock" : "Block"} {opponentSeat.username}
                </button>
              </div>
            ) : null
          }
          result={snapshot.result ? { result: snapshot.result, reason: snapshot.reason ?? "manual" } : null}
          footer={playerColor ? `You are playing as ${playerColor}` : ""}
        />
      ) : (
        <div className="empty-state">
          <Wifi size={38} />
          <strong>Start or join a game</strong>
          <span>Friend rooms and random matches work between browsers connected to this server.</span>
        </div>
      )}
    </section>
  );
}

function GameLayout({
  user,
  fen,
  moves,
  lastMove,
  settings,
  orientation,
  interactiveSide,
  timeControl,
  onTimeout,
  onMove,
  white,
  black,
  status,
  actions,
  safetyActions,
  result,
  footer
}: {
  user: PublicUser;
  fen: string;
  moves: string[];
  lastMove?: LastMove;
  settings: UserSettings;
  orientation: Side;
  interactiveSide: Side | "both" | null;
  timeControl?: TimeControl;
  onTimeout?: (flaggedSide: Side) => void;
  onMove: (move: { from: string; to: string; promotion?: string }) => void;
  white: PlayerSeat;
  black: PlayerSeat;
  status: string;
  actions: React.ReactNode;
  safetyActions?: React.ReactNode;
  result?: { result: GameResult; reason: GameEndReason } | null;
  footer?: string;
}) {
  const captured = capturedFromFen(fen);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const isCheck = chess.inCheck();

  const turn = sideFromTurn(chess.turn());
  const activeClockSide = result ? null : interactiveSide === "both" ? turn : interactiveSide;

  // Calculate J.A.R.V.I.S. calculation & overlay for Owner
  const { result: jarvisAnalysis } = useJarvisWorker(fen, user.role === "owner" && !result);

  return (
    <div className="game-layout">
      <div className="board-column">
        <div className="player-row top">
          <PlayerBadge side="black" player={black} />
          <CaptureTray side="white" pieces={captured.white} pieceStyle={settings.pieceStyle} />
        </div>

        <ChessBoard
          fen={fen}
          orientation={orientation}
          theme={settings.boardTheme}
          pieceStyle={settings.pieceStyle}
          legalHints={settings.legalHints}
          lastMove={lastMove}
          isCheck={isCheck}
          interactiveSide={interactiveSide}
          jarvisRecommendedMove={jarvisAnalysis?.bestMove}
          onMove={onMove}
          onInvalidMove={() => playSound("invalid", settings)}
        />

        <div className="player-row">
          <PlayerBadge side="white" player={white} />
          <CaptureTray side="black" pieces={captured.black} pieceStyle={settings.pieceStyle} />
        </div>

        <GameClock
          timeControl={timeControl}
          activeSide={activeClockSide}
          onTimeout={onTimeout}
          disabled={Boolean(result)}
        />
      </div>

      <aside className="game-side">
        <div className="status-card">
          <Shield size={20} />
          <strong>{status}</strong>
          {footer ? <span>{footer}</span> : null}
        </div>

        <div className="action-row">
          {actions}
          {user.role === "owner" && jarvisAnalysis?.bestMove && (
            <button
              className="jarvis-execute-btn full mt-2"
              onClick={() => jarvisAnalysis.bestMove && onMove(jarvisAnalysis.bestMove)}
            >
              <Play size={16} /> Execute J.A.R.V.I.S. Move ({jarvisAnalysis.bestMove.san})
            </button>
          )}
        </div>
        {safetyActions}
        <MoveList moves={moves} />
        {result ? (
          <div className="result-banner">
            <Crown size={20} />
            <strong>{formatResult(result.result, result.reason)}</strong>
          </div>
        ) : null}
      </aside>

      {/* Floating J.A.R.V.I.S. Widget with Live FEN */}
      <JarvisWidget
        user={user}
        fen={fen}
        onExecuteMove={onMove}
      />
    </div>
  );
}

function PlayerBadge({ side, player }: { side: Side; player: PlayerSeat }) {
  return (
    <div className="player-badge">
      <span className={`side-dot ${side}`} />
      <strong>{player.username}</strong>
      {player.role === "owner" && <span className="god-badge">👑 OWNER</span>}
      {player.rating ? <span>{player.rating}</span> : null}
      {player.connected === false ? <em>offline</em> : null}
    </div>
  );
}

function CaptureTray({ pieces, side, pieceStyle }: { pieces: string[]; side: Side; pieceStyle: PieceStyle }) {
  return (
    <div className="capture-tray" aria-label={`${side} captured pieces`}>
      {pieces.map((piece, index) => (
        <span key={`${piece}-${index}`}>{pieceSymbols[pieceStyle][`${side === "white" ? "w" : "b"}${piece}`]}</span>
      ))}
    </div>
  );
}

function MoveList({ moves }: { moves: string[] }) {
  const pairs = [];
  for (let index = 0; index < moves.length; index += 2) {
    pairs.push({ number: index / 2 + 1, white: moves[index], black: moves[index + 1] });
  }
  return (
    <div className="move-list">
      <div className="panel-title">
        <Swords size={18} />
        <strong>Moves</strong>
      </div>
      <div className="moves-scroll">
        {pairs.length === 0 ? <span className="muted">No moves yet</span> : null}
        {pairs.map((pair) => (
          <div className="move-pair" key={pair.number}>
            <span>{pair.number}.</span>
            <strong>{pair.white}</strong>
            <strong>{pair.black ?? ""}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaderboard({ currentUser }: { currentUser: PublicUser }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState("");

  function load() {
    getLeaderboard()
      .then((result) => {
        setRows(result.rows);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load leaderboard."));
  }

  useEffect(load, []);

  const medalIcons = ["🥇", "🥈", "🥉"];
  const userRankIndex = rows.findIndex((r) => r.userId === currentUser.id);
  const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null;

  return (
    <section className="table-screen">
      <div className="toolbar">
        <div>
          <span className="eyebrow">Live Ratings</span>
          <h1>Leaderboard</h1>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="pinned-rank-card">
        <div className="rank-left">
          <div className="rank-badge">
            {userRank && userRank <= 3 ? medalIcons[userRank - 1] : `#${userRank ?? "-"}`}
          </div>
          <div>
            <span className="eyebrow">Your Standing</span>
            <h2 className="rank-name">
              {currentUser.username} {currentUser.role === "owner" ? "👑 OWNER" : ""}
            </h2>
          </div>
        </div>
        <div className="rank-stats font-numeric">
          <div>
            <span>Rating</span>
            <strong>{currentUser.rating}</strong>
          </div>
          <div>
            <span>Record</span>
            <strong>
              {currentUser.wins}W - {currentUser.losses}L - {currentUser.draws}D
            </strong>
          </div>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      <div className="data-table">
        <div className="table-row header">
          <span>#</span>
          <span>Player</span>
          <span>Rating</span>
          <span>W</span>
          <span>L</span>
          <span>D</span>
        </div>
        {rows.map((row, index) => (
          <div
            className={`table-row${index < 3 ? ` rank-${index + 1}` : ""}${
              row.userId === currentUser.id ? " active-user-row" : ""
            }`}
            key={row.userId}
          >
            <span>{index < 3 ? medalIcons[index] : index + 1}</span>
            <strong>
              {row.username} {row.role === "owner" ? "👑 OWNER" : ""}
              {row.userId === currentUser.id ? " (You)" : ""}
            </strong>
            <span>{row.rating}</span>
            <span>{row.wins}</span>
            <span>{row.losses}</span>
            <span>{row.draws}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryView({ onSelectAnalysis }: { onSelectAnalysis: (game: GameRecord) => void }) {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [error, setError] = useState("");

  function load() {
    getHistory()
      .then((result) => {
        setGames(result.games);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load history."));
  }

  useEffect(load, []);

  return (
    <section className="table-screen">
      <div className="toolbar">
        <div>
          <span className="eyebrow">Saved Games</span>
          <h1>Game history</h1>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="history-list">
        {games.length === 0 ? (
          <div className="empty-state compact">
            <History size={30} />
            <strong>No saved games yet</strong>
          </div>
        ) : null}
        {games.map((game) => (
          <article className="history-card" key={game.id}>
            <div>
              <strong>
                {game.players.white.username} vs {game.players.black.username}
              </strong>
              <span>{new Date(game.endedAt).toLocaleString()}</span>
            </div>
            <div>
              <span>{title(game.mode.replace(/-/g, " "))}</span>
              <strong>{formatResult(game.result, game.reason)}</strong>
            </div>
            <p>{game.moves.length ? game.moves.join(" ") : "No moves recorded"}</p>
            <div className="mt-2">
              <button className="primary small-btn" onClick={() => onSelectAnalysis(game)}>
                🔍 Analyze Game with J.A.R.V.I.S.
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsView({
  user,
  onUserUpdate,
  onOpenPolicy
}: {
  user: PublicUser;
  onUserUpdate: (user: PublicUser) => void;
  onOpenPolicy: (type: PolicyModalType) => void;
}) {
  const [draft, setDraft] = useState<UserSettings>(user.settings);
  const [status, setStatus] = useState("");
  const saveTimer = useRef<number | null>(null);

  const applyAndSave = useCallback(
    (newSettings: UserSettings) => {
      onUserUpdate({ ...user, settings: newSettings });
      applyAnimationVars(newSettings);

      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        setStatus("Saving...");
        updateSettings(newSettings)
          .then((result) => {
            onUserUpdate(result.user);
            setStatus("Saved");
          })
          .catch((error) => setStatus(error instanceof Error ? error.message : "Could not save settings."));
      }, 600);
    },
    [user, onUserUpdate]
  );

  function patch(settings: Partial<UserSettings>) {
    const newDraft = { ...draft, ...settings };
    setDraft(newDraft);
    applyAndSave(newDraft);
  }

  return (
    <section className="settings-screen">
      <div className="page-heading">
        <span className="eyebrow">Preferences</span>
        <h1>Settings</h1>
      </div>
      <div className="settings-grid">
        <SettingSelect
          label="Board theme"
          value={draft.boardTheme}
          options={["emerald", "midnight", "walnut", "royal"]}
          onChange={(value) => patch({ boardTheme: value as BoardTheme })}
        />
        <SettingSelect
          label="Piece style"
          value={draft.pieceStyle}
          options={["classic", "neo", "letters"]}
          onChange={(value) => patch({ pieceStyle: value as PieceStyle })}
        />
        <Toggle label="Sound" checked={draft.soundEnabled} onChange={(checked) => patch({ soundEnabled: checked })} icon={<Volume2 size={18} />} />
        <label className="setting-item">
          <span className="volume-row">
            <Volume2 size={18} />
            Volume
          </span>
          <div className="volume-row">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.soundVolume}
              onChange={(event) => patch({ soundVolume: Number(event.target.value) })}
            />
            <strong>{Math.round(draft.soundVolume * 100)}%</strong>
          </div>
        </label>
        <Toggle label="Legal hints" checked={draft.legalHints} onChange={(checked) => patch({ legalHints: checked })} icon={<BadgeInfo size={18} />} />
        <Toggle label="Auto flip" checked={draft.autoFlip} onChange={(checked) => patch({ autoFlip: checked })} icon={<RefreshCw size={18} />} />
        <Toggle
          label="Reduced motion"
          checked={draft.reducedMotion}
          onChange={(checked) => patch({ reducedMotion: checked })}
          icon={<MonitorSmartphone size={18} />}
        />
        {user.role === "owner" && (
          <Toggle
            label="J.A.R.V.I.S. AI Engine"
            checked={draft.jarvisEnabled ?? true}
            onChange={(checked) => patch({ jarvisEnabled: checked })}
            icon={<Bot size={18} />}
          />
        )}
      </div>

      <div className="settings-actions">
        {status ? <span>{status}</span> : null}
      </div>

      <div className="settings-safety-block">
        <h3>Privacy & Account Safety</h3>
        <p className="muted">Manage your data rights, community safety, and account deletion options.</p>
        <div className="safety-btn-grid">
          <button className="secondary" onClick={() => onOpenPolicy("guidelines")}>
            <Shield size={16} /> Community Guidelines
          </button>
          <button className="secondary" onClick={() => onOpenPolicy("privacy")}>
            <Shield size={16} /> Privacy Policy
          </button>
          <button className="secondary" onClick={() => onOpenPolicy("report")}>
            <AlertTriangle size={16} /> Report a Problem
          </button>
          <button className="danger" onClick={() => onOpenPolicy("delete")}>
            <Trash2 size={16} /> Delete Account & Data
          </button>
        </div>
      </div>
    </section>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="setting-item">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {title(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  icon
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: React.ReactNode;
}) {
  return (
    <label className="toggle-item">
      <span>
        {icon}
        {label}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function AnimatedStat({ label, value }: { label: string; value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 600;
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        ref.current = requestAnimationFrame(tick);
      }
    }

    ref.current = requestAnimationFrame(tick);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [value]);

  return (
    <div className="stat">
      <strong>{display}</strong>
      <span>{label}</span>
    </div>
  );
}
