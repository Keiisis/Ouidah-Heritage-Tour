-- 03/11/2026 : correctif de documents_suivre_suppression (20261102_documents.sql). Son UPDATE sans WHERE sur
-- documents_compteurs était refusé par le garde-fou safeupdate de PostgREST (« UPDATE requires a WHERE clause ») : tout
-- DELETE de demande, devis, réservation ou commande passé par l'API échouait, effacement RGPD compris. Le recalage ne
-- touche plus que les compteurs décalés du dernier numéro restant. Migration additive (create or replace).
create or replace function public.documents_suivre_suppression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.documents where source = tg_argv[0] and source_id = old.id;
  update public.documents_compteurs c
     set dernier = m.dernier
    from (
      select c2.type, c2.annee, coalesce((select max(d.rang) from public.documents d where d.type = c2.type and d.annee = c2.annee), 0) as dernier
        from public.documents_compteurs c2
    ) m
   where c.type = m.type and c.annee = m.annee and c.dernier <> m.dernier;
  return old;
end;
$$;
revoke all on function public.documents_suivre_suppression() from public, anon, authenticated;
