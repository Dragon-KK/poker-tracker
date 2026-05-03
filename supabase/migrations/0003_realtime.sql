-- Enable Supabase Realtime for game tables.
-- REPLICA IDENTITY FULL is required so that row-level filters (game_id=eq.X)
-- receive the full row payload on UPDATE and DELETE events.

ALTER TABLE public.buy_ins       REPLICA IDENTITY FULL;
ALTER TABLE public.clearouts     REPLICA IDENTITY FULL;
ALTER TABLE public.sponsorships  REPLICA IDENTITY FULL;
ALTER TABLE public.game_activity REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.buy_ins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clearouts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sponsorships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_activity;
