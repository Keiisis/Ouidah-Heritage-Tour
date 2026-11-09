// Prépare uniquement des fichiers SQL locaux. Aucune connexion, aucun secret, aucune application distante.
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const racine=new URL('../supabase/',import.meta.url);
const sqlNormalise=texte=>texte.replace(/\r\n/g,'\n');
export const empreinteSql=texte=>createHash('sha256').update(sqlNormalise(texte)).digest('hex');

export async function verifierMigrations(dossier=racine){
  const manifeste=JSON.parse(await readFile(new URL('migrations.manifest.json',dossier),'utf8'));
  const fichiers=(await readdir(new URL('migrations/',dossier))).filter(f=>f.endsWith('.sql')).sort();
  if(manifeste.version!==1||JSON.stringify(fichiers)!==JSON.stringify(manifeste.migrations.map(m=>m.fichier)))throw Error('Le manifeste ne correspond pas aux migrations présentes.');
  return Promise.all(manifeste.migrations.map(async m=>{
    if(!/^\d{8}_[a-z_]+\.sql$/.test(m.fichier)||! /^[a-f\d]{64}$/.test(m.sha256))throw Error('Entrée de manifeste invalide.');
    const sql=sqlNormalise(await readFile(new URL(`migrations/${m.fichier}`,dossier),'utf8'));
    if(empreinteSql(sql)!==m.sha256)throw Error(`Empreinte différente : ${m.fichier}. Réviser le manifeste après vérification du changement.`);
    return {...m,sql};
  }));
}

/** Une transaction par migration ; journal privé, noms complets pour distinguer les dates identiques. */
export function preparerMigration(m,precedente,{baseNeuve=false}={}){
  let sql=m.sql;
  // Ces deux sources historiques enveloppent déjà leur SQL. Le journal doit partager leur transaction.
  if(['20261104_assistant_base.sql','20261104_assistant_transmission.sql'].includes(m.fichier)){
    if((sql.match(/^begin;$/gm)??[]).length!==1||(sql.match(/^commit;$/gm)??[]).length!==1)throw Error(`Enveloppe SQL inattendue : ${m.fichier}.`);
    sql=sql.replace(/^begin;\n/m,'').replace(/^commit;\n/m,'');
  }
  if(/^(?:begin|commit|rollback|start transaction)\s*;/im.test(sql))throw Error(`Transaction interne à revoir : ${m.fichier}.`);
  return `-- Généré depuis le manifeste OHT ; vérifier le projet et les migrations déjà appliquées avant exécution.
-- ${m.fichier} / SHA-256 UTF-8 LF ${m.sha256}
begin;
select pg_advisory_xact_lock(648511);
create schema if not exists oht_ops;
revoke all on schema oht_ops from public,anon,authenticated,service_role;
create table if not exists oht_ops.migrations(fichier text primary key,sha256 text not null,applique_le timestamptz not null default now());
revoke all on oht_ops.migrations from public,anon,authenticated,service_role;
do $oht_garde$
begin
${baseNeuve?`  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')) then
    raise exception 'Le lot complet exige un schéma public sans table. Vérifier le point de reprise au lieu de tout rejouer.';
  end if;`:''}
  if exists(select 1 from oht_ops.migrations where fichier='${m.fichier}') then
    raise exception 'Migration déjà enregistrée : ne pas rejouer ni remplacer son empreinte.';
  end if;
${precedente?`  if not exists(select 1 from oht_ops.migrations where fichier='${precedente.fichier}' and sha256='${precedente.sha256}') then
    raise exception 'La migration précédente de ce lot manque ou son empreinte diffère.';
  end if;`:''}
end;
$oht_garde$;
${sql}
insert into oht_ops.migrations(fichier,sha256) values('${m.fichier}','${m.sha256}');
notify pgrst,'reload schema';
commit;
`;
}

export async function preparerLot(migrations,{apres,sortie}){
  const depart=apres?migrations.findIndex(m=>m.fichier===apres):-1;
  if(apres&&depart<0)throw Error('La dernière migration vérifiée est inconnue du manifeste.');
  const lot=migrations.slice(depart+1);
  if(!lot.length)throw Error('Aucune migration après cette référence.');
  // Un dossier neuf par lot : deux références de reprise ne peuvent pas mélanger leurs fichiers.
  await mkdir(dirname(sortie),{recursive:true});
  await mkdir(sortie);
  for(let i=0;i<lot.length;i++)await writeFile(resolve(sortie,`${String(i+1).padStart(3,'0')}-${lot[i].fichier}`),preparerMigration(lot[i],lot[i-1],{baseNeuve:!apres&&i===0}),{flag:'wx'});
  return lot.map(m=>m.fichier);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const {values}=parseArgs({options:{apres:{type:'string'},sortie:{type:'string'}}});
    const migrations=await verifierMigrations();
    if(values.apres&&!values.sortie)throw Error('--apres exige --sortie.');
    if(values.sortie){
      const fichiers=await preparerLot(migrations,{apres:values.apres,sortie:resolve(values.sortie)});
      console.log(JSON.stringify({preparees:fichiers.length,fichiers,applicationDistante:false}));
    }else console.log(JSON.stringify({verifiees:migrations.length,ordre:'nom complet croissant',empreinte:'SHA-256 UTF-8 LF',fichiers:migrations.map(m=>m.fichier),applicationDistante:false}));
  }catch(e){console.error(e instanceof Error?e.message:'Préparation interrompue.');process.exitCode=1;}
}
