export type Side = "white" | "black";
export type ChessTurn = "w" | "b";
export type BotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type GameMode = "bot" | "pass-and-play" | "friend" | "random";
export type GameStatus = "waiting" | "active" | "complete";
export type GameResult = Side | "draw" | "abandoned";
export type GameEndReason =
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resign"
  | "disconnect"
  | "agreement"
  | "timeout"
  | "manual";

export type BoardTheme = "emerald" | "midnight" | "walnut" | "royal";
export type PieceStyle = "classic" | "neo" | "letters";
export type UserRole = "user" | "owner";

export type TimeFormatCategory = "bullet" | "blitz" | "rapid" | "custom" | "unlimited";

export interface TimeControl {
  id: string;
  name: string;
  category: TimeFormatCategory;
  initialSec: number;
  incSec: number;
}

export interface FormatRatings {
  bullet: number;
  blitz: number;
  rapid: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
}

export interface UserSettings {
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  soundEnabled: boolean;
  soundVolume: number;
  legalHints: boolean;
  autoFlip: boolean;
  reducedMotion: boolean;
  animationSpeed: number;
  botDelayMs: number;
  jarvisEnabled?: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  rating: number;
  formatRatings: FormatRatings;
  puzzleRating: number;
  bestRating: number;
  streak: number;
  xp: number;
  level: number;
  isBanned?: boolean;
  banReason?: string;
  birthYear?: number;
  dailyChallenge: {
    target: number;
    completed: number;
    lastDate: string;
  };
  blockedUsers?: string[];
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  settings: UserSettings;
}

export interface LeaderboardRow {
  userId: string;
  username: string;
  role: UserRole;
  rating: number;
  formatRatings: FormatRatings;
  puzzleRating: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
}

export interface PlayerSeat {
  id?: string;
  username: string;
  role?: UserRole;
  kind: "human" | "bot" | "guest";
  connected?: boolean;
  rating?: number;
}

export interface LastMove {
  from: string;
  to: string;
  san: string;
}

export interface GameSnapshot {
  id: string;
  mode: GameMode;
  roomCode?: string;
  timeControl?: TimeControl;
  whiteTimeRemainingMs?: number;
  blackTimeRemainingMs?: number;
  turnStartedAt?: string;
  status: GameStatus;
  fen: string;
  turn: Side;
  players: {
    white?: PlayerSeat;
    black?: PlayerSeat;
  };
  moves: string[];
  lastMove?: LastMove;
  isCheck: boolean;
  result?: GameResult;
  reason?: GameEndReason;
  startedAt: string;
  endedAt?: string;
  drawOfferFrom?: Side;
}

export interface GameRecord {
  id: string;
  mode: GameMode;
  timeControl?: TimeControl;
  players: {
    white: PlayerSeat;
    black: PlayerSeat;
  };
  result: GameResult;
  reason: GameEndReason;
  moves: string[];
  finalFen: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface Puzzle {
  id: string;
  title: string;
  fen: string;
  solutionMoves: string[]; // SAN or move pairs
  rating: number;
  category: "mate" | "tactic" | "fork" | "pin" | "skewer";
  description: string;
}

export type MoveQuality = "best" | "great" | "inaccuracy" | "mistake" | "blunder";

export interface SingleMoveAnalysis {
  moveNumber: number;
  playerSide: Side;
  san: string;
  fenBefore: string;
  fenAfter: string;
  quality: MoveQuality;
  evalBefore: number;
  evalAfter: number;
  bestMoveSan?: string;
  explanation: string;
}

export interface GameAnalysisReport {
  gameId: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteBlunders: number;
  blackBlunders: number;
  whiteMistakes: number;
  blackMistakes: number;
  moves: SingleMoveAnalysis[];
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  active: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminUsername: string;
  action: string;
  target?: string;
  reason?: string;
  timestamp: string;
}

export interface ReportItem {
  id: string;
  reporterUserId: string;
  reporterUsername: string;
  target: string;
  reason: string;
  details?: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
}

export interface SystemAnalytics {
  totalUsers: number;
  activeToday: number;
  gamesPlayedToday: number;
  totalGamesPlayed: number;
  onlinePlayersCount: number;
  botGamesCount: number;
  onlineGamesCount: number;
  reportsCount: number;
  bannedUsersCount: number;
  maintenanceMode: boolean;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface ApiError {
  error: string;
}
