-- Traductions persistantes : une file par document, mémoire par segment, budget réservé avant appel.
-- Les déclencheurs rendent la mise en file atomique avec la publication. Aucun appel réseau en SQL.
create table public.traduction_auto_reglages (
  id boolean primary key default true check (id),
  actif boolean not null default true,
  modele text not null default 'openai/gpt-oss-120b' check (char_length(modele) between 1 and 120),
  budget_jour integer not null default 200000 check (budget_jour between 0 and 10000000),
  glossaire text not null default '' check (char_length(glossaire) <= 12000)
);
insert into public.traduction_auto_reglages(id) values(true);

create table public.traduction_auto_file (
  type text not null check (type in ('contenu','produits','categories','matieres','blog')),
  cle text not null check (char_length(cle) between 1 and 200),
  generation bigint not null default 1 check (generation > 0),
  etat text not null default 'attente' check (etat in ('attente','en_cours','terminee')),
  prioritaire boolean not null default false,
  cache_a_invalider boolean not null default false,
  cache_generation bigint check (cache_generation > 0),
  lease uuid,
  bail_jusqua timestamptz,
  essais integer not null default 0 check (essais >= 0),
  prochain_essai timestamptz not null default now(),
  erreur text not null default '' check (char_length(erreur) <= 120),
  snapshot jsonb not null default '{}'::jsonb check (octet_length(snapshot::text) <= 24000000),
  humains jsonb not null default '{}'::jsonb check (jsonb_typeof(humains)='object' and octet_length(humains::text) <= 24000000),
  modifie_le timestamptz not null default now(),
  primary key(type,cle),
  check ((lease is null) = (bail_jusqua is null))
);
create index traduction_auto_file_attente on public.traduction_auto_file(prochain_essai) where etat <> 'terminee';

create table public.traduction_auto_memoire (
  cle text primary key check (cle ~ '^[a-f0-9]{64}$'),
  source text not null check (octet_length(source) between 1 and 200000),
  langue_source text not null check (langue_source in ('FR','EN','ES','DE','PT','HT','GCF')),
  langue text not null check (langue in ('FR','EN','ES','DE','PT','HT','GCF') and langue <> langue_source),
  contexte text not null check (char_length(contexte) between 1 and 1000),
  traduction text not null check (octet_length(traduction) <= 300000),
  origine text not null check (origine in ('auto','humain')),
  modifie_le timestamptz not null default now()
);
create table public.traduction_auto_budget (
  id uuid primary key default gen_random_uuid(),
  jour date not null default (now() at time zone 'UTC')::date,
  reserve integer not null check (reserve between 1 and 2000000),
  consomme integer check (consomme between 0 and 4000000),
  cree_le timestamptz not null default now()
);
create index traduction_auto_budget_jour on public.traduction_auto_budget(jour);

alter table public.traduction_auto_reglages enable row level security;
alter table public.traduction_auto_file enable row level security;
alter table public.traduction_auto_memoire enable row level security;
alter table public.traduction_auto_budget enable row level security;
revoke all on public.traduction_auto_reglages,public.traduction_auto_file,public.traduction_auto_memoire,public.traduction_auto_budget from public,anon,authenticated;
grant select,update on public.traduction_auto_reglages to service_role;
grant select on public.traduction_auto_file,public.traduction_auto_memoire,public.traduction_auto_budget to service_role;

create function public.traduction_auto_fusion_humains(p_avant jsonb,p_apres jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare l text; e jsonb; resultat jsonb:=p_avant;
begin
  for l,e in select key,value from jsonb_each(p_apres) loop
    if p_avant->l->'source'=e->'source' then e:=e||jsonb_build_object('avant',p_avant->l->'avant'); end if;
    resultat:=jsonb_set(resultat,array[l],e);
  end loop;
  return resultat;
end;
$$;
create function public.traduction_auto_planifier(p_type text,p_cle text,p_forcer boolean default true,p_humains jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into traduction_auto_file(type,cle,humains,prioritaire) values(p_type,p_cle,p_humains,p_forcer)
  on conflict(type,cle) do update set generation=traduction_auto_file.generation+1,
    etat='attente',prioritaire=true,prochain_essai=now(),erreur='',essais=0,modifie_le=now(),
    humains=traduction_auto_fusion_humains(traduction_auto_file.humains,excluded.humains)
  where p_forcer;
  -- Le bail existant reste occupé jusqu'à sa libération/expiration : un ancien appel Groq ne double pas le suivant.
end;
$$;

create function public.traduction_auto_initialiser(p_cles text[],p_forcer boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare k text;
begin
  if cardinality(p_cles)>1000 then raise exception 'Trop de rubriques'; end if;
  foreach k in array coalesce(p_cles,'{}'::text[]) loop
    if k !~ '^[a-z][a-z-]{0,30}(\.[A-Za-z][A-Za-z0-9_]{0,40})?$' then raise exception 'Rubrique invalide'; end if;
    perform traduction_auto_planifier('contenu',k,p_forcer);
  end loop;
  for k in select id::text from boutique_produits where publie loop perform traduction_auto_planifier('produits',k,p_forcer); end loop;
  for k in select slug from boutique_categories loop perform traduction_auto_planifier('categories',k,p_forcer); end loop;
  for k in select slug from boutique_matieres loop perform traduction_auto_planifier('matieres',k,p_forcer); end loop;
  for k in select id::text from blog_articles where traduction_de is null and etat='publie' loop perform traduction_auto_planifier('blog',k,p_forcer); end loop;
end;
$$;

create function public.traduction_auto_changement()
returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; ancien jsonb; k text; t text; l text; s jsonb; h jsonb:='{}'; reference jsonb; avant jsonb;
begin
  if current_setting('oht.traduction_auto',true)='oui' then return null; end if;
  r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  ancien:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  if tg_table_name='contenu_site' then
    -- Toute publication est durable, même avant le premier cron ; le moteur ignore les clés non traduisibles.
    k:=regexp_replace(r->>'cle','^(EN|ES|DE|PT|HT|GCF):','');
    avant:=ancien->'valeur';
    reference:=nullif(current_setting('oht.traduction_reference',true),'')::jsonb;
    if reference->>'cle'=r->>'cle' and reference ? 'avant' then avant:=reference->'avant'; end if;
    if (tg_op='DELETE' or tg_op='INSERT' and r->'valeur' is distinct from 'null'::jsonb
       or tg_op='UPDATE' and r->'valeur' is distinct from ancien->'valeur') then
      if r->>'cle'<>k then
        l:=split_part(r->>'cle',':',1);
        select jsonb_build_object('cle',k,'valeur',valeur) into s from contenu_site where cle=k;
        s:=coalesce(s,jsonb_build_object('cle',k,'valeur',null));
        h:=jsonb_build_object(l,jsonb_build_object('source',s,'avant',avant,'apres',r->'valeur'));
      elsif jsonb_typeof(r->'valeur'->'FR')='object' and jsonb_typeof(avant)='object' then
        s:=jsonb_build_object('cle',k,'valeur',jsonb_build_object('FR',r->'valeur'->'FR'));
        foreach l in array array['EN','ES','DE','PT','HT','GCF'] loop
          if r->'valeur'->l is distinct from avant->l then
            h:=h||jsonb_build_object(l,jsonb_build_object('source',s,'avant',avant->l,'apres',r->'valeur'->l));
          end if;
        end loop;
      end if;
      perform traduction_auto_planifier('contenu',k,true,h);
    end if;
  elsif tg_table_name='blog_articles' then
    k:=coalesce(r->>'traduction_de',r->>'id');
    -- Un brouillon d'agent reste privé ; l'état des variantes compte pour les collisions et retraits.
    if tg_op='DELETE' or (r->>'etat'='publie' or ancien->>'etat'='publie') and
      (r-array['version','modifie_le','modifie_par','cree_le'] is distinct from ancien-array['version','modifie_le','modifie_par','cree_le']) then
      if r->>'traduction_de' is not null and r->>'etat'='publie' then
        select to_jsonb(a)-array['version','modifie_le','modifie_par','cree_le'] into s from blog_articles a where id=k::uuid;
        h:=jsonb_build_object(r->>'langue',jsonb_build_object('source',s,'avant',ancien,'apres',r));
      end if;
      perform traduction_auto_planifier('blog',k,true,h);
    end if;
  else
    t:=replace(tg_table_name,'boutique_','');
    k:=case when t='produits' then r->>'id' else r->>'slug' end;
    foreach l in array array['EN','ES','DE','PT','HT','GCF'] loop
      if r->'traductions'->l is distinct from ancien->'traductions'->l then
        h:=h||jsonb_build_object(l,jsonb_build_object('source',r-array['traductions','modifie_le','cree_le'],
          'avant',ancien->'traductions'->l,'apres',r->'traductions'->l));
      end if;
    end loop;
    if t='produits' then
      if tg_op='DELETE' or (coalesce((r->>'publie')::boolean,false) or coalesce((ancien->>'publie')::boolean,false)) and
        (jsonb_build_array(r->'nom',r->'lieu',r->'dimensions',r->'description',r->'entretien',r->'photos',r->'publie',r->'traductions')
         is distinct from jsonb_build_array(ancien->'nom',ancien->'lieu',ancien->'dimensions',ancien->'description',ancien->'entretien',ancien->'photos',ancien->'publie',ancien->'traductions')) then
        perform traduction_auto_planifier(t,k,true,h);
      end if;
    elsif tg_op='DELETE' or jsonb_build_array(r->'nom',r->'photo',r->'traductions') is distinct from jsonb_build_array(ancien->'nom',ancien->'photo',ancien->'traductions') then
      perform traduction_auto_planifier(t,k,true,h);
    end if;
  end if;
  return null;
end;
$$;
create trigger traduction_auto_contenu after insert or update or delete on public.contenu_site for each row execute function public.traduction_auto_changement();
create trigger traduction_auto_produits after insert or update or delete on public.boutique_produits for each row execute function public.traduction_auto_changement();
create trigger traduction_auto_categories after insert or update or delete on public.boutique_categories for each row execute function public.traduction_auto_changement();
create trigger traduction_auto_matieres after insert or update or delete on public.boutique_matieres for each row execute function public.traduction_auto_changement();
create trigger traduction_auto_blog after insert or update or delete on public.blog_articles for each row execute function public.traduction_auto_changement();

-- La référence vient de relire() côté serveur, fusion du publié avec les defaults du registre.
-- Le CAS de contenu_ecrire valide qu'elle correspond toujours à la version effectivement remplacée.
create function public.contenu_publier_traduction(p_cle text,p_valeur jsonb,p_version integer,p_auteur uuid,p_avant jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare precedent text; v integer;
begin
  if p_avant is null or octet_length(p_avant::text)>4000000 then raise exception 'Référence invalide'; end if;
  precedent:=current_setting('oht.traduction_reference',true);
  perform set_config('oht.traduction_reference',jsonb_build_object('cle',p_cle,'avant',p_avant)::text,true);
  v:=contenu_ecrire(p_cle,p_valeur,p_version,p_auteur,'publie');
  perform set_config('oht.traduction_reference',coalesce(precedent,''),true);
  return v;
end;
$$;
revoke all on function public.contenu_publier_traduction(text,jsonb,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.contenu_publier_traduction(text,jsonb,integer,uuid,jsonb) to service_role;

create function public.traduction_auto_consignes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.modele is distinct from old.modele or new.glossaire is distinct from old.glossaire then
    update traduction_auto_file set generation=generation+1,etat='attente',prochain_essai=now(),erreur='',essais=0,modifie_le=now();
  end if;
  return null;
end;
$$;
create trigger traduction_auto_consignes after update on public.traduction_auto_reglages for each row execute function public.traduction_auto_consignes();

create function public.traduction_auto_prendre()
returns jsonb language plpgsql security definer set search_path=public as $$
declare j traduction_auto_file; d jsonb; s jsonb; v jsonb;
begin
  -- ponytail : un seul appel de traitement à la fois ; répartir les baux si le débit le justifie un jour.
  perform pg_advisory_xact_lock(64091109);
  if not (select actif from traduction_auto_reglages where id) or exists(select 1 from traduction_auto_file where bail_jusqua>now()) then return null; end if;
  select * into j from traduction_auto_file where etat<>'terminee' and prochain_essai<=now()
    order by prioritaire desc,prochain_essai,type,cle limit 1 for update skip locked;
  if not found then return null; end if;
  update traduction_auto_file set lease=gen_random_uuid(),bail_jusqua=now()+interval '3 minutes',etat='en_cours',essais=essais+1
    where type=j.type and cle=j.cle returning * into j;
  if j.type='contenu' then
    select to_jsonb(c) into s from contenu_site c where cle=j.cle;
    s:=coalesce(s,jsonb_build_object('cle',j.cle,'valeur',null,'brouillon',null,'version',0));
    select coalesce(jsonb_object_agg(split_part(c.cle,':',1),to_jsonb(c)),'{}') into v from contenu_site c where cle in
      ('EN:'||j.cle,'ES:'||j.cle,'DE:'||j.cle,'PT:'||j.cle,'HT:'||j.cle,'GCF:'||j.cle);
    d:=jsonb_build_object('source',s,'variantes',v);
  elsif j.type='produits' then
    select jsonb_build_object('source',to_jsonb(p)) into d from boutique_produits p where id=j.cle::uuid;
  elsif j.type='categories' then
    select jsonb_build_object('source',to_jsonb(p)) into d from boutique_categories p where slug=j.cle;
  elsif j.type='matieres' then
    select jsonb_build_object('source',to_jsonb(p)) into d from boutique_matieres p where slug=j.cle;
  else
    select to_jsonb(a) into s from blog_articles a where id=j.cle::uuid and traduction_de is null;
    select coalesce(jsonb_agg(to_jsonb(a) order by langue),'[]') into v from blog_articles a where traduction_de=j.cle::uuid;
    d:=jsonb_build_object('source',s,'variantes',v);
  end if;
  return to_jsonb(j)||jsonb_build_object('donnees',coalesce(d,jsonb_build_object('source',null)));
end;
$$;

create function public.traduction_auto_memoriser(p_entrees jsonb,p_type text default null,p_cle text default null,p_generation bigint default null,p_lease uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare e jsonb; m traduction_auto_memoire; n integer:=0;
begin
  if jsonb_typeof(p_entrees)<>'array' or jsonb_array_length(p_entrees)>500 or octet_length(p_entrees::text)>4000000 then raise exception 'Mémoire invalide'; end if;
  if exists(select 1 from jsonb_array_elements(p_entrees) entree where entree->>'origine'='humain') then
    perform 1 from traduction_auto_file where type=p_type and cle=p_cle and generation=p_generation and lease=p_lease and bail_jusqua>now() for update;
    if not found then return 0; end if;
  end if;
  for e in select value from jsonb_array_elements(p_entrees) loop
    insert into traduction_auto_memoire(cle,source,langue_source,langue,contexte,traduction,origine)
      values(e->>'cle',e->>'source',e->>'langue_source',e->>'langue',e->>'contexte',e->>'traduction',e->>'origine')
    on conflict(cle) do nothing;
    select * into m from traduction_auto_memoire where cle=e->>'cle' for update;
    if m.source is distinct from e->>'source' or m.langue_source is distinct from e->>'langue_source'
       or m.langue is distinct from e->>'langue' or m.contexte is distinct from e->>'contexte' then raise exception 'Clé mémoire incohérente'; end if;
    if m.origine<>'humain' or e->>'origine'='humain' then
      update traduction_auto_memoire set traduction=e->>'traduction',origine=e->>'origine',modifie_le=now() where cle=m.cle;
    end if;
    n:=n+1;
  end loop;
  return n;
end;
$$;

create function public.traduction_auto_reserver_budget(p_jetons integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare r traduction_auto_reglages; total bigint; v uuid;
begin
  if p_jetons is null or p_jetons not between 1 and 2000000 then raise exception 'Réservation invalide'; end if;
  select * into r from traduction_auto_reglages where id for update;
  if not r.actif then return null; end if;
  select coalesce(sum(coalesce(consomme,reserve)),0) into total from traduction_auto_budget where jour=(now() at time zone 'UTC')::date;
  if total+p_jetons>r.budget_jour then return null; end if;
  insert into traduction_auto_budget(reserve) values(p_jetons) returning id into v;
  return v;
end;
$$;
create function public.traduction_auto_solder_budget(p_reservation uuid,p_jetons integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_jetons is not null and p_jetons not between 0 and 4000000 then raise exception 'Consommation invalide'; end if;
  -- Inconnue après interruption : garder la réserve. Une réponse rejouée ne diminue pas la consommation.
  update traduction_auto_budget set consomme=p_jetons where id=p_reservation and consomme is null and p_jetons is not null;
end;
$$;

create function public.traduction_auto_reporter(p_type text,p_cle text,p_generation bigint,p_lease uuid,p_erreur text,p_attente_secondes integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if char_length(p_erreur)>120 or p_attente_secondes not between 0 and 604800 then raise exception 'Reprise invalide'; end if;
  update traduction_auto_file set etat='attente',lease=null,bail_jusqua=null,
    prochain_essai=case when generation=p_generation then now()+make_interval(secs=>p_attente_secondes) else now() end,
    erreur=case when generation=p_generation then p_erreur else '' end
    where type=p_type and cle=p_cle and lease=p_lease;
  get diagnostics n=row_count;
  return n=1;
end;
$$;

create function public.traduction_auto_finaliser(p_type text,p_cle text,p_generation bigint,p_lease uuid,p_traductions jsonb,p_snapshot jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare j traduction_auto_file; lang text; v_valeur jsonb; c contenu_site; a blog_articles; cible blog_articles; ver integer; cle_cible text; precedent text; delai text;
begin
  if jsonb_typeof(p_traductions)<>'object' or p_snapshot is null or octet_length(p_snapshot::text)>24000000 then raise exception 'Résultat invalide'; end if;
  select * into j from traduction_auto_file where type=p_type and cle=p_cle for update;
  if not found or p_lease is null or p_generation is null or j.lease is distinct from p_lease or j.generation<>p_generation or j.bail_jusqua<=now() then
    perform traduction_auto_reporter(p_type,p_cle,p_generation,p_lease,'',0);
    return 'obsolete';
  end if;
  if not (select actif from traduction_auto_reglages where id) then
    perform traduction_auto_reporter(p_type,p_cle,p_generation,p_lease,'desactive',60);
    return 'desactive';
  end if;
  precedent:=current_setting('oht.traduction_auto',true);
  delai:=current_setting('lock_timeout');
  perform set_config('oht.traduction_auto','oui',true);
  -- Une écriture humaine peut tenir une ligne en attendant son trigger de file : ne jamais l'attendre ici.
  perform set_config('lock_timeout','250ms',true);
  begin
    if p_type='contenu' then
      if p_traductions->>'mode' not in ('cles','imbrique') or jsonb_typeof(p_traductions->'valeurs')<>'object'
        or (p_traductions->'valeurs')-array['EN','ES','DE','PT','HT','GCF']<>'{}'::jsonb then raise exception 'Langues invalides'; end if;
      perform 1 from contenu_site where cle=p_cle or cle in ('EN:'||p_cle,'ES:'||p_cle,'DE:'||p_cle,'PT:'||p_cle,'HT:'||p_cle,'GCF:'||p_cle) order by cle for update nowait;
      if p_traductions->>'mode'='imbrique' then
        insert into contenu_site(cle) values(p_cle) on conflict(cle) do nothing;
        select * into c from contenu_site where cle=p_cle for update;
        v_valeur:=coalesce(c.valeur,'{}'::jsonb)||(p_traductions->'valeurs');
        update contenu_site set valeur=v_valeur,version=version+1,modifie_le=now(),publie_le=now() where cle=p_cle returning version into ver;
        insert into contenu_versions(cle,version,etat,valeur) values(p_cle,ver,'publie',v_valeur);
      else
        for lang,v_valeur in select key,value from jsonb_each(p_traductions->'valeurs') loop
          cle_cible:=lang||':'||p_cle;
          insert into contenu_site(cle) values(cle_cible) on conflict(cle) do nothing;
          update contenu_site set valeur=v_valeur,version=version+1,modifie_le=now(),publie_le=now() where cle=cle_cible returning version into ver;
          insert into contenu_versions(cle,version,etat,valeur) values(cle_cible,ver,'publie',v_valeur);
        end loop;
      end if;
    elsif p_type in ('produits','categories','matieres') then
      if p_traductions-array['EN','ES','DE','PT','HT','GCF']<>'{}'::jsonb then raise exception 'Langues invalides'; end if;
      if p_type='produits' then
        perform 1 from boutique_produits where id=p_cle::uuid and publie for update nowait;
        if not found then raise no_data_found; end if;
        update boutique_produits set traductions=traductions||p_traductions,modifie_le=clock_timestamp() where id=p_cle::uuid;
      elsif p_type='categories' then
        perform 1 from boutique_categories where slug=p_cle for update nowait;
        if not found then raise no_data_found; end if;
        update boutique_categories set traductions=traductions||p_traductions,modifie_le=clock_timestamp() where slug=p_cle;
      else
        perform 1 from boutique_matieres where slug=p_cle for update nowait;
        if not found then raise no_data_found; end if;
        update boutique_matieres set traductions=traductions||p_traductions,modifie_le=clock_timestamp() where slug=p_cle;
      end if;
    elsif p_type='blog' then
      select * into a from blog_articles where id=p_cle::uuid and traduction_de is null and etat='publie' for update nowait;
      if not found then raise no_data_found; end if;
      perform 1 from blog_articles where traduction_de=a.id order by id for update nowait;
      if p_traductions-array['FR','EN','ES','DE','PT','HT','GCF']<>'{}'::jsonb or p_traductions ? a.langue then raise exception 'Langues invalides'; end if;
      for lang,v_valeur in select key,value from jsonb_each(p_traductions) loop
        select * into cible from blog_articles where traduction_de=a.id and langue=lang;
        if found and cible.etat<>'publie' then continue; end if;
        if cible.id is null then
          if exists(select 1 from blog_articles where langue=lang and slug=a.slug) then raise unique_violation; end if;
          insert into blog_articles(langue,traduction_de,slug,titre,chapo,corps,couverture_src,couverture_alt,categorie,mots_cles,auteur_id,etat,publie_le,seo_titre,seo_description,temps_lecture)
          values(lang,a.id,a.slug,v_valeur->>'titre',coalesce(v_valeur->>'chapo',''),coalesce(v_valeur->>'corps',''),a.couverture_src,v_valeur->>'couverture_alt',v_valeur->>'categorie',
            array(select jsonb_array_elements_text(coalesce(v_valeur->'mots_cles','[]'))),a.auteur_id,'publie',a.publie_le,v_valeur->>'seo_titre',v_valeur->>'seo_description',coalesce((v_valeur->>'temps_lecture')::integer,1));
        else
          update blog_articles set titre=v_valeur->>'titre',chapo=coalesce(v_valeur->>'chapo',''),corps=coalesce(v_valeur->>'corps',''),couverture_src=a.couverture_src,
            couverture_alt=v_valeur->>'couverture_alt',categorie=v_valeur->>'categorie',mots_cles=array(select jsonb_array_elements_text(coalesce(v_valeur->'mots_cles','[]'))),
            seo_titre=v_valeur->>'seo_titre',seo_description=v_valeur->>'seo_description',temps_lecture=coalesce((v_valeur->>'temps_lecture')::integer,1) where id=cible.id;
        end if;
      end loop;
    else raise exception 'Type invalide'; end if;
  exception
    when lock_not_available then
      perform set_config('oht.traduction_auto',coalesce(precedent,''),true); perform set_config('lock_timeout',delai,true);
      perform traduction_auto_reporter(p_type,p_cle,p_generation,p_lease,'',1); return 'occupe';
    when unique_violation then
      perform set_config('oht.traduction_auto',coalesce(precedent,''),true); perform set_config('lock_timeout',delai,true);
      perform traduction_auto_reporter(p_type,p_cle,p_generation,p_lease,'collision',3600); return 'collision';
    when no_data_found then
      perform set_config('oht.traduction_auto',coalesce(precedent,''),true); perform set_config('lock_timeout',delai,true);
      update traduction_auto_file set etat='terminee',lease=null,bail_jusqua=null,erreur='source_retiree' where type=p_type and cle=p_cle;
      return 'obsolete';
  end;
  perform set_config('oht.traduction_auto',coalesce(precedent,''),true); perform set_config('lock_timeout',delai,true);
  update traduction_auto_file set etat='terminee',prioritaire=false,lease=null,bail_jusqua=null,snapshot=p_snapshot,humains='{}',erreur='',cache_a_invalider=true,cache_generation=p_generation,modifie_le=now() where type=p_type and cle=p_cle;
  return 'applique';
end;
$$;

-- La donnée et son obligation d'invalidation sont atomiques. Le serveur acquitte seulement APRÈS revalidateTag.
-- Ce rattrapage reste utilisable sans clé fournisseur et avec les traductions automatiques désactivées.
-- Le document transporte cache_generation, identité du commit traduit, et non generation, qui change dès la source.
create function public.traduction_auto_acquitter_cache(p_documents jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if p_documents is null or jsonb_typeof(p_documents)<>'array' or jsonb_array_length(p_documents)>100 or octet_length(p_documents::text)>50000 then raise exception 'Acquittement invalide'; end if;
  update traduction_auto_file f set cache_a_invalider=false
    from jsonb_to_recordset(p_documents) as d(type text,cle text,generation bigint)
    where f.type=d.type and f.cle=d.cle and f.cache_generation=d.generation and f.cache_a_invalider;
  get diagnostics n=row_count;
  return n;
end;
$$;
revoke all on function public.traduction_auto_acquitter_cache(jsonb) from public,anon,authenticated;
grant execute on function public.traduction_auto_acquitter_cache(jsonb) to service_role;

revoke all on function public.traduction_auto_fusion_humains(jsonb,jsonb),public.traduction_auto_planifier(text,text,boolean,jsonb),public.traduction_auto_changement(),public.traduction_auto_consignes() from public,anon,authenticated,service_role;
revoke all on function public.traduction_auto_initialiser(text[],boolean),public.traduction_auto_prendre(),public.traduction_auto_memoriser(jsonb,text,text,bigint,uuid),public.traduction_auto_reserver_budget(integer),public.traduction_auto_solder_budget(uuid,integer),public.traduction_auto_reporter(text,text,bigint,uuid,text,integer),public.traduction_auto_finaliser(text,text,bigint,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.traduction_auto_initialiser(text[],boolean),public.traduction_auto_prendre(),public.traduction_auto_memoriser(jsonb,text,text,bigint,uuid),public.traduction_auto_reserver_budget(integer),public.traduction_auto_solder_budget(uuid,integer),public.traduction_auto_reporter(text,text,bigint,uuid,text,integer),public.traduction_auto_finaliser(text,text,bigint,uuid,jsonb,jsonb) to service_role;
