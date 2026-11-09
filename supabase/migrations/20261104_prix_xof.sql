-- 04/11/2026 : devise de compte unique XOF, en entiers (règles devises validées par Kevin le 04/11). Le prix d'un article de
-- la boutique se tient désormais en FCFA (prix_xof) ; prix_eur n'est plus qu'un dérivé, recalculé par la base à chaque
-- écriture au taux fixe BCEAO (1 € = 655,957 FCFA), pour que les lectures existantes restent justes pendant la bascule.
-- Migration additive, sans perte : prix_xof est rempli une seule fois depuis prix_eur (aller-retour exact au centime :
-- l'écart d'arrondi est au plus 0,5 / 655,957 € < 0,005 €). Les commandes passées gardent leurs propres montants.
alter table public.boutique_produits add column if not exists prix_xof integer check (prix_xof is null or prix_xof >= 0);
update public.boutique_produits set prix_xof = round(prix_eur * 655.957)::integer where prix_xof is null and prix_eur is not null;

create or replace function public.boutique_prix_derive() returns trigger language plpgsql set search_path = public as $$
begin
  -- prix_xof fait foi ; une écriture qui ne donne que prix_eur (ancienne saisie) le convertit une fois
  if new.prix_xof is null and new.prix_eur is not null and (tg_op = 'INSERT' or new.prix_eur is distinct from old.prix_eur) then
    new.prix_xof := round(new.prix_eur * 655.957)::integer;
  end if;
  new.prix_eur := case when new.prix_xof is null then null else round(new.prix_xof / 655.957, 2) end;
  return new;
end $$;
revoke all on function public.boutique_prix_derive() from public, anon, authenticated;

drop trigger if exists boutique_prix_derive on public.boutique_produits;
create trigger boutique_prix_derive before insert or update on public.boutique_produits for each row execute function public.boutique_prix_derive();
