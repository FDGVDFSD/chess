-- ==========================================
-- CHESS ARENA SUPABASE DATABASE SCHEMA (v2)
-- ==========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'owner' | 'user'
  rating INT NOT NULL DEFAULT 1000,
  format_ratings JSONB NOT NULL DEFAULT '{"bullet": 1000, "blitz": 1000, "rapid": 1000}'::jsonb,
  puzzle_rating INT NOT NULL DEFAULT 1200,
  best_rating INT NOT NULL DEFAULT 1000,
  streak INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason TEXT,
  blocked_users TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are readable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. ONLINE GAMES TABLE
CREATE TABLE IF NOT EXISTS public.online_games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code VARCHAR(6) UNIQUE,
  mode VARCHAR(20) NOT NULL DEFAULT 'friend', -- 'friend' | 'random'
  white_user_id UUID REFERENCES public.profiles(id),
  black_user_id UUID REFERENCES public.profiles(id),
  white_username TEXT NOT NULL,
  black_username TEXT NOT NULL,
  fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  turn VARCHAR(5) NOT NULL DEFAULT 'white',
  status VARCHAR(20) NOT NULL DEFAULT 'waiting', -- 'waiting' | 'active' | 'complete' | 'abandoned'
  result VARCHAR(20), -- 'white' | 'black' | 'draw' | 'abandoned'
  reason VARCHAR(30), -- 'checkmate' | 'stalemate' | 'resign' | 'timeout' | 'draw_offer'
  time_control JSONB NOT NULL DEFAULT '{"id": "blitz_5_0", "name": "5 min Blitz", "initialSec": 300, "incSec": 0}'::jsonb,
  white_ms_remaining INT,
  black_ms_remaining INT,
  last_move_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for Online Games
ALTER TABLE public.online_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Online games readable by everyone"
  ON public.online_games FOR SELECT USING (true);

CREATE POLICY "Players can update their active games"
  ON public.online_games FOR UPDATE
  USING (auth.uid() = white_user_id OR auth.uid() = black_user_id);

CREATE POLICY "Authenticated users can create games"
  ON public.online_games FOR INSERT
  WITH CHECK (auth.uid() = white_user_id OR auth.uid() = black_user_id);

-- 3. MATCHMAKING QUEUE TABLE
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  rating INT NOT NULL DEFAULT 1000,
  preferred_color VARCHAR(10) NOT NULL DEFAULT 'white',
  time_control_id VARCHAR(30) NOT NULL DEFAULT 'blitz_5_0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for Matchmaking
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their queue entries"
  ON public.matchmaking_queue FOR ALL USING (auth.uid() = user_id);

-- 4. ANNOUNCEMENTS & AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_username TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- MATCHMAKING & ROOM CODE FUNCTIONS
-- ==========================================

-- Function to generate 6-character room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to join matchmaking queue or produce a instant pairing
CREATE OR REPLACE FUNCTION join_random_matchmaking(
  p_user_id UUID,
  p_username TEXT,
  p_rating INT,
  p_preferred_color TEXT,
  p_time_control_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_opponent RECORD;
  v_game_id UUID;
  v_room_code TEXT;
  v_white_id UUID;
  v_black_id UUID;
  v_white_name TEXT;
  v_black_name TEXT;
BEGIN
  -- Search for opponent in queue within rating window (+/- 250 Elo)
  SELECT * INTO v_opponent
  FROM public.matchmaking_queue
  WHERE user_id != p_user_id
    AND time_control_id = p_time_control_id
    AND rating BETWEEN (p_rating - 250) AND (p_rating + 250)
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    -- Match Found! Remove opponent from queue
    DELETE FROM public.matchmaking_queue WHERE id = v_opponent.id;

    -- Determine white/black
    IF p_preferred_color = 'white' OR v_opponent.preferred_color = 'black' THEN
      v_white_id := p_user_id; v_white_name := p_username;
      v_black_id := v_opponent.user_id; v_black_name := v_opponent.username;
    ELSE
      v_white_id := v_opponent.user_id; v_white_name := v_opponent.username;
      v_black_id := p_user_id; v_black_name := p_username;
    END IF;

    v_room_code := generate_room_code();

    -- Create game
    INSERT INTO public.online_games (
      room_code, mode, white_user_id, black_user_id, white_username, black_username, status
    ) VALUES (
      v_room_code, 'random', v_white_id, v_black_id, v_white_name, v_black_name, 'active'
    ) RETURNING id INTO v_game_id;

    RETURN jsonb_build_object('matched', true, 'game_id', v_game_id, 'room_code', v_room_code);
  ELSE
    -- No match yet: Insert player into queue
    DELETE FROM public.matchmaking_queue WHERE user_id = p_user_id;
    INSERT INTO public.matchmaking_queue (user_id, username, rating, preferred_color, time_control_id)
    VALUES (p_user_id, p_username, p_rating, p_preferred_color, p_time_control_id);

    RETURN jsonb_build_object('matched', false, 'queued', true);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
