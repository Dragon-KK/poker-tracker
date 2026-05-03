-- DELETE policies for the undo-last-action feature.
-- The original schema only granted SELECT and INSERT on these tables, so
-- DELETE was silently denied by RLS. Allow auth members of the parent
-- table to delete their game's rows.

CREATE POLICY "bi_delete_auth"
ON public.buy_ins FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
);

CREATE POLICY "sp_delete_auth"
ON public.sponsorships FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
);

CREATE POLICY "ga_delete_auth"
ON public.game_activity FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
);

-- The clearouts table is not in the committed schema but exists in the
-- live deployment. Apply the same policy if the table is present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clearouts') THEN
    EXECUTE $POL$
      CREATE POLICY "co_delete_auth"
      ON public.clearouts FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND public.is_table_auth(g.table_id))
      )
    $POL$;
  END IF;
END $$;
