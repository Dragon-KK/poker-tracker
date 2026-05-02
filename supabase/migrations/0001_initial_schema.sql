-- PokerLedger initial schema + RLS
-- Apply in Supabase: SQL Editor → New query → paste → Run.

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Profiles ───────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_shared"
ON public.profiles FOR SELECT TO authenticated
USING (true);

CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ─── Tables (poker_tables) ───────────────────────────────────────────────────
CREATE TABLE public.poker_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Table membership ───────────────────────────────────────────────────────
CREATE TABLE public.table_members (
  table_id UUID NOT NULL REFERENCES public.poker_tables (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  is_auth BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, user_id)
);

CREATE INDEX idx_table_members_user ON public.table_members (user_id);

-- Helper functions (SECURITY DEFINER; must run after table_members exists)
CREATE OR REPLACE FUNCTION public.is_table_member(p_table UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.table_members m
    WHERE m.table_id = p_table AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_table_auth(p_table UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.table_members m
    WHERE m.table_id = p_table AND m.user_id = auth.uid() AND m.is_auth
  );
$$;

CREATE OR REPLACE FUNCTION public.table_has_member(p_table UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.table_members m
    WHERE m.table_id = p_table AND m.user_id = p_user
  );
$$;

ALTER TABLE public.poker_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_select_member"
ON public.poker_tables FOR SELECT TO authenticated
USING (public.is_table_member(id));

CREATE POLICY "pt_insert_self"
ON public.poker_tables FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "pt_update_auth"
ON public.poker_tables FOR UPDATE TO authenticated
USING (public.is_table_auth(id))
WITH CHECK (public.is_table_auth(id));

ALTER TABLE public.table_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tm_select_member"
ON public.table_members FOR SELECT TO authenticated
USING (public.is_table_member(table_id));

CREATE POLICY "tm_update_auth_promote"
ON public.table_members FOR UPDATE TO authenticated
USING (public.is_table_auth(table_id))
WITH CHECK (public.is_table_auth(table_id));

-- ─── Games ────────────────────────────────────────────────────────────────────
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.poker_tables (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  session_date DATE NOT NULL,
  default_buyin NUMERIC NOT NULL DEFAULT 100,
  chip_mult NUMERIC NOT NULL DEFAULT 10,
  peak_chips NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_games_table ON public.games (table_id);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "games_select_member"
ON public.games FOR SELECT TO authenticated
USING (public.is_table_member(table_id));

CREATE POLICY "games_insert_auth"
ON public.games FOR INSERT TO authenticated
WITH CHECK (public.is_table_auth(table_id));

CREATE POLICY "games_update_auth"
ON public.games FOR UPDATE TO authenticated
USING (public.is_table_auth(table_id))
WITH CHECK (public.is_table_auth(table_id));

-- ─── Players in a session ─────────────────────────────────────────────────────
CREATE TABLE public.game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  clearout_amount NUMERIC,
  UNIQUE (game_id, user_id)
);

CREATE INDEX idx_game_players_game ON public.game_players (game_id);

ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gp_select_member"
ON public.game_players FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_member(g.table_id))
);

CREATE POLICY "gp_mutate_auth"
ON public.game_players FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
);

CREATE POLICY "gp_update_auth"
ON public.game_players FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
);

-- ─── Buy-ins ─────────────────────────────────────────────────────────────────
CREATE TABLE public.buy_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_buy_ins_game ON public.buy_ins (game_id);

ALTER TABLE public.buy_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_select_member"
ON public.buy_ins FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_member(g.table_id))
);

CREATE POLICY "bi_insert_auth"
ON public.buy_ins FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
);

-- ─── Sponsorships ────────────────────────────────────────────────────────────
CREATE TABLE public.sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  sponsored_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sponsor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  sponsor_name TEXT,
  amount NUMERIC NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sponsor_game ON public.sponsorships (game_id);

ALTER TABLE public.sponsorships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_select_member"
ON public.sponsorships FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_member(g.table_id))
);

CREATE POLICY "sp_insert_auth"
ON public.sponsorships FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
);

-- ─── Payments ───────────────────────────────────────────────────────────────
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.poker_tables (id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_table ON public.payments (table_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pay_select_member"
ON public.payments FOR SELECT TO authenticated
USING (public.is_table_member(table_id));

CREATE POLICY "pay_insert_auth_parties"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  public.table_has_member(table_id, from_user_id)
  AND public.table_has_member(table_id, to_user_id)
  AND (
    public.is_table_auth(table_id)
    OR auth.uid() = from_user_id
    OR auth.uid() = to_user_id
  )
);

CREATE POLICY "pay_update_parties_auth"
ON public.payments FOR UPDATE TO authenticated
USING (
  public.is_table_member(table_id)
  AND (
    public.is_table_auth(table_id)
    OR auth.uid() = from_user_id
    OR auth.uid() = to_user_id
  )
)
WITH CHECK (
  public.is_table_member(table_id)
  AND (
    public.is_table_auth(table_id)
    OR auth.uid() = from_user_id
    OR auth.uid() = to_user_id
  )
);

-- ─── Session activity log ────────────────────────────────────────────────────
CREATE TABLE public.game_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  detail TEXT DEFAULT ''
);

CREATE INDEX idx_ga_game ON public.game_activity (game_id, created_at DESC);

ALTER TABLE public.game_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ga_select_member"
ON public.game_activity FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_member(g.table_id))
);

CREATE POLICY "ga_insert_auth"
ON public.game_activity FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
  AND actor_user_id = auth.uid()
);

-- ─── RPCs: create / join ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_create_table(p_name TEXT, p_join_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  code TEXT := upper(trim(p_join_code));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF length(trim(p_name)) < 1 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;
  IF code !~ '^[A-Z2-9]{4,12}$' THEN
    RAISE EXCEPTION 'Invalid join code';
  END IF;
  INSERT INTO public.poker_tables (id, name, join_code, created_by)
  VALUES (v_id, trim(p_name), code, auth.uid());
  INSERT INTO public.table_members (table_id, user_id, is_auth)
  VALUES (v_id, auth.uid(), true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_join_table(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid UUID;
  code TEXT := upper(trim(p_code));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_tid FROM public.poker_tables WHERE join_code = code LIMIT 1;
  IF v_tid IS NULL THEN RAISE EXCEPTION 'Table not found'; END IF;
  INSERT INTO public.table_members (table_id, user_id, is_auth)
  VALUES (v_tid, auth.uid(), false)
  ON CONFLICT (table_id, user_id) DO NOTHING;
  RETURN v_tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_promote_member(p_table_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_table_auth(p_table_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.table_members
    WHERE table_id = p_table_id AND user_id = p_user_id
  ) THEN RAISE EXCEPTION 'Not a member'; END IF;
  UPDATE public.table_members SET is_auth = true
  WHERE table_id = p_table_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_table_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_table_auth(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.table_has_member(UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_create_table(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_join_table(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_promote_member(UUID, UUID) TO authenticated;

-- ─── New user profile ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''), split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Grants (covers local / fresh projects)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
