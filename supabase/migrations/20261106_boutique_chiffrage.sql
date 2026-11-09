-- Commande encore non chiffrée : compléter les prix absents depuis le catalogue, sans écraser ses prix déjà figés.
-- Aucun paiement n'est créé ; la confirmation et le règlement gardent leurs contrôles séparés.
create or replace function public.chiffrer_commande_boutique(p_id uuid, p_par uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.boutique_commandes;
  l jsonb;
  v_lignes jsonb := '[]'::jsonb;
  prix numeric;
  quantite numeric;
  total numeric := 0;
begin
  if not exists(select 1 from public.equipe_profils where id=p_par and role='admin' and etat='actif') then
    return jsonb_build_object('erreur','refuse');
  end if;
  select * into c from public.boutique_commandes where id=p_id for update;
  if not found or c.statut <> 'a_confirmer' or c.total_xof is not null or c.total_eur is not null then
    return jsonb_build_object('erreur','etat');
  end if;
  -- Verrous partagés stables : un prix catalogue ne change pas à mi-panier.
  perform 1 from public.boutique_produits where slug in (select x->>'slug' from jsonb_array_elements(c.lignes) x)
    order by id for share;
  for l in select x from jsonb_array_elements(c.lignes) x loop
    if jsonb_typeof(l->'quantite') is distinct from 'number' then return jsonb_build_object('erreur','champs'); end if;
    quantite := (l->>'quantite')::numeric;
    if quantite < 1 or quantite <> trunc(quantite) or quantite > 2147483647 then return jsonb_build_object('erreur','champs'); end if;
    if l->>'prix_xof' is not null then
      if jsonb_typeof(l->'prix_xof') is distinct from 'number' then return jsonb_build_object('erreur','prix'); end if;
      prix := (l->>'prix_xof')::numeric;
    elsif l->>'prix_eur' is not null then
      -- Ancienne ligne EUR : conserver ce prix de commande, jamais le remplacer par le catalogue d'aujourd'hui.
      if jsonb_typeof(l->'prix_eur') is distinct from 'number' or (l->>'prix_eur')::numeric < 0 then return jsonb_build_object('erreur','prix'); end if;
      prix := round((l->>'prix_eur')::numeric * 655.957);
      l := jsonb_set(l,'{prix_xof}',to_jsonb(prix));
    else
      select prix_xof into prix from public.boutique_produits where slug = l->>'slug';
      if not found or prix is null then return jsonb_build_object('erreur','prix'); end if;
      l := jsonb_set(l,'{prix_xof}',to_jsonb(prix));
    end if;
    if prix < 0 or prix <> trunc(prix) or prix > 2147483647 then return jsonb_build_object('erreur','prix'); end if;
    total := total + prix * quantite;
    if total > 2147483647 then return jsonb_build_object('erreur','montant'); end if;
    v_lignes := v_lignes || jsonb_build_array(l);
  end loop;
  update public.boutique_commandes set lignes=v_lignes, total_xof=total::integer, total_eur=round(total/655.957,2) where id=c.id;
  return jsonb_build_object('ok',true,'total_xof',total);
end;
$$;
revoke all on function public.chiffrer_commande_boutique(uuid,uuid) from public,anon,authenticated;
grant execute on function public.chiffrer_commande_boutique(uuid,uuid) to service_role;

create or replace function public.boutique_commande_montants_figes()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.statut <> 'a_confirmer' and new.statut = 'a_confirmer' then
    raise exception 'commande_figee' using errcode='P0001';
  end if;
  if (old.statut <> 'a_confirmer' or new.statut <> 'a_confirmer')
    and row(new.lignes,new.total_xof,new.total_eur,new.devise,new.contact,new.remise,new.reference)
      is distinct from row(old.lignes,old.total_xof,old.total_eur,old.devise,old.contact,old.remise,old.reference) then
    raise exception 'commande_figee' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger boutique_commande_montants_figes before update on public.boutique_commandes
for each row execute function public.boutique_commande_montants_figes();
