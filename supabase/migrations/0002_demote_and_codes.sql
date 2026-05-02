-- PokerLedger migration 0002: temporary join codes + demote member
-- Apply after 0001_initial_schema.sql.
-- Run in Supabase: SQL Editor → New query → paste → Run.

-- ─── Add code_active flag to poker_tables ────────────────────────────────────
ALTER TABLE public.poker_tables
  ADD COLUMN IF NOT EXISTS code_active BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Update rpc_create_table: generate code server-side, start inactive ───────
-- p_join_code is kept optional for backward compat; if omitted, server generates one.
CREATE OR REPLACE FUNCTION public.rpc_create_table(p_name TEXT, p_join_code TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id  UUID := gen_random_uuid();
  code  TEXT;
  i     INT  := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(trim(p_name)) < 1 THEN RAISE EXCEPTION 'Invalid name'; END IF;

  IF p_join_code IS NOT NULL THEN
    code := upper(trim(p_join_code));
  ELSE
    LOOP
      code := '';
      FOR i IN 1..6 LOOP
        code := code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               floor(random() * 32 + 1)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.poker_tables WHERE join_code = code);
      i := i + 1;
      IF i > 20 THEN RAISE EXCEPTION 'Could not generate a unique join code'; END IF;
    END LOOP;
  END IF;

  IF code !~ '^[A-Z2-9]{4,12}$' THEN RAISE EXCEPTION 'Invalid join code'; END IF;

  INSERT INTO public.poker_tables (id, name, join_code, created_by, code_active)
  VALUES (v_id, trim(p_name), code, auth.uid(), false);

  INSERT INTO public.table_members (table_id, user_id, is_auth)
  VALUES (v_id, auth.uid(), true);

  RETURN v_id;
END;
$$;

-- ─── Update rpc_join_table: require code_active = true ───────────────────────
CREATE OR REPLACE FUNCTION public.rpc_join_table(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid UUID;
  code  TEXT := upper(trim(p_code));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO v_tid
  FROM public.poker_tables
  WHERE join_code = code AND code_active = true
  LIMIT 1;

  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'Table not found or join code is not active';
  END IF;

  INSERT INTO public.table_members (table_id, user_id, is_auth)
  VALUES (v_tid, auth.uid(), false)
  ON CONFLICT (table_id, user_id) DO NOTHING;

  RETURN v_tid;
END;
$$;

-- ─── rpc_generate_table_code: creator generates a fresh active code ───────────
CREATE OR REPLACE FUNCTION public.rpc_generate_table_code(p_table_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  i        INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF (SELECT created_by FROM public.poker_tables WHERE id = p_table_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the table creator can manage the join code';
  END IF;

  LOOP
    new_code := '';
    FOR i IN 1..6 LOOP
      new_code := new_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                     floor(random() * 32 + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.poker_tables WHERE join_code = new_code AND id <> p_table_id
    );
    i := i + 1;
    IF i > 20 THEN RAISE EXCEPTION 'Could not generate a unique join code'; END IF;
  END LOOP;

  UPDATE public.poker_tables
  SET join_code = new_code, code_active = true
  WHERE id = p_table_id;

  RETURN new_code;
END;
$$;

-- ─── rpc_deactivate_table_code: creator disables the active code ─────────────
CREATE OR REPLACE FUNCTION public.rpc_deactivate_table_code(p_table_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF (SELECT created_by FROM public.poker_tables WHERE id = p_table_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the table creator can manage the join code';
  END IF;

  UPDATE public.poker_tables SET code_active = false WHERE id = p_table_id;
END;
$$;

-- ─── rpc_demote_member: creator revokes auth from a member ───────────────────
CREATE OR REPLACE FUNCTION public.rpc_demote_member(p_table_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Only the creator may demote
  IF (SELECT created_by FROM public.poker_tables WHERE id = p_table_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the table creator can demote members';
  END IF;

  -- Creator cannot demote themselves
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot demote yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.table_members
    WHERE table_id = p_table_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this table';
  END IF;

  UPDATE public.table_members
  SET is_auth = false
  WHERE table_id = p_table_id AND user_id = p_user_id;
END;
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_generate_table_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_deactivate_table_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_demote_member(UUID, UUID) TO authenticated;
