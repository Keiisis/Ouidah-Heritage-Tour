-- Le nom du pays ne se traduit pas (Kevin, 16/11/2026) : Benin, Benín, Benim, Benen, Bénen deviennent « Bénin »
-- dans les traductions publiées, les brouillons et la mémoire de traduction. « Beninese », « béninois », les clés JSON
-- (ariaBenin) et les URL (Plage_de_Ouidah_(Benin,_2013)) ne bougent pas. Restent intacts : les crédits photo (titres et
-- liens des œuvres tels que publiés par leurs auteurs) et le nom propre « Eglise pentecote Unie du Benin ».
create or replace function pg_temp.benin(t text) returns text language sql immutable as $f$
  select replace(regexp_replace(t, '(?<![[:alpha:]_/])(Benin|Benín|Benim|Benen|Bénen)(?![[:alpha:]_])', 'Bénin', 'g'),
                 'Eglise pentecote Unie du Bénin', 'Eglise pentecote Unie du Benin')
$f$;

update public.contenu_site set valeur = pg_temp.benin(valeur::text)::jsonb
where cle like '%:%' and cle not like '%credits-photos%' and valeur::text <> pg_temp.benin(valeur::text);

update public.contenu_site set brouillon = pg_temp.benin(brouillon::text)::jsonb
where cle like '%:%' and cle not like '%credits-photos%' and brouillon is not null and brouillon::text <> pg_temp.benin(brouillon::text);

update public.traduction_auto_memoire set traduction = pg_temp.benin(traduction)
where traduction <> pg_temp.benin(traduction);
