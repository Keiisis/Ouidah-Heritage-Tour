// Opérateur uniquement, hors Vercel. Aucun chargement implicite de .env, aucune donnée en clair sur disque.
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {appendFile,mkdir,open,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {basename,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const MAGIC=Buffer.from('OHTBAK1\n');
export const BUCKET='oht-sauvegardes';
export const MAX_OCTETS=1024*1024*1024;
const erreur=(code)=>new Error(`Sauvegarde : ${code}.`);
const cleValide=cle=>Buffer.isBuffer(cle)&&cle.length===32;

export function configuration(env=process.env){
 if(env.OHT_SAUVEGARDE_ACTIVE!=='1')return null;
 if(!/^[a-f\d]{64}$/i.test(env.OHT_SAUVEGARDE_CLE??''))throw erreur('clé AES de 32 octets requise');
 if(['SUPABASE_SECRET_KEY','EQUIPE_SEL','BILLET_SECRET','EMPREINTE_SEL','PGPASSWORD','CRON_SECRET','SMTP_MDP','IMAP_MDP'].some(k=>env[k]&&env[k]===env.OHT_SAUVEGARDE_CLE))throw erreur('clé de chiffrement distincte requise');
 const dossier=env.OHT_SAUVEGARDE_DOSSIER;
 if(!dossier||!isAbsolute(dossier))throw erreur('dossier absolu requis');
 if(!env.PGHOST||!env.PGDATABASE||!env.PGUSER)throw erreur('connexion PostgreSQL incomplète');
 // Contrat libpq séparé : pas de conninfo/service prioritaire sur l'environnement, ni de socket ignorant TLS.
 if(!/^[a-z\d_-]{1,63}$/i.test(env.PGDATABASE)||! /^[a-z\d.-]+$/i.test(env.PGHOST)||env.PGSERVICE||env.PGSERVICEFILE)throw erreur('paramètres PostgreSQL séparés requis, sans URI ni service');
 if(env.PGSSLMODE!=='verify-full')throw erreur('PGSSLMODE verify-full requis');
 const envoi=env.OHT_SAUVEGARDE_ENVOI==='1';
 let origine;
 if(envoi){
  try{const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw 0;origine=u.origin;}catch{throw erreur('origine HTTPS Supabase requise');}
  if(!env.SUPABASE_SECRET_KEY)throw erreur('clé serveur Supabase requise');
 }
 return {dossier:resolve(dossier),cle:Buffer.from(env.OHT_SAUVEGARDE_CLE,'hex'),envoi,origine,secret:env.SUPABASE_SECRET_KEY,executable:env.OHT_PG_DUMP||'pg_dump',env};
}

/** Flux PostgreSQL → AES-GCM ; le fichier final n’existe qu’après clôture authentifiée. */
export async function chiffrer(source,fichier,cle){
 if(!cleValide(cle))throw erreur('clé invalide');
 const iv=randomBytes(12),chiffreur=createCipheriv('aes-256-gcm',cle,iv);
 chiffreur.setAAD(MAGIC);
 const part=`${fichier}.part`,sortie=createWriteStream(part,{flags:'wx',mode:0o600});
 sortie.write(Buffer.concat([MAGIC,iv]));
 let octets=0;
 const borne=new Transform({transform(chunk,encoding,fin){octets+=chunk.length;if(octets>MAX_OCTETS-MAGIC.length-28)return fin(erreur('archive supérieure à 1 Gio'));fin(null,chunk);}});
 await pipeline(source,borne,chiffreur,sortie);
 if(!octets)throw erreur('dump vide');
 await appendFile(part,chiffreur.getAuthTag());
 return {part,octets};
}

export async function empreinte(fichier){
 const hash=createHash('sha256');let octets=0;
 for await(const morceau of createReadStream(fichier)){octets+=morceau.length;hash.update(morceau);}
 return {sha256:hash.digest('hex'),octets};
}

/** Lecture pour une restauration opérateur : aucun octet n’est retourné avant vérification du tag GCM. */
export async function dechiffrer(fichier,cle){
 if(!cleValide(cle))throw erreur('clé invalide');
 const taille=(await stat(fichier)).size;
 if(taille>MAX_OCTETS||taille<MAGIC.length+29)throw erreur('taille invalide');
 const b=await readFile(fichier);
 if(!b.subarray(0,MAGIC.length).equals(MAGIC))throw erreur('format inconnu');
 const d=createDecipheriv('aes-256-gcm',cle,b.subarray(MAGIC.length,MAGIC.length+12));
 d.setAAD(MAGIC);d.setAuthTag(b.subarray(-16));
 try{return Buffer.concat([d.update(b.subarray(MAGIC.length+12,-16)),d.final()]);}catch{throw erreur('authenticité du fichier non vérifiée');}
}

export async function deposer(config,fichier,manifeste){
 if(!config.envoi)return false;
 const endpoint=`${config.origine}/storage/v1`,entetes={apikey:config.secret};
 // Ne jamais publier dans un compartiment passé public par erreur.
 const b=await fetch(`${endpoint}/bucket/${BUCKET}`,{headers:entetes,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!b.ok||(await b.json()).public!==false)throw erreur('compartiment privé indisponible');
 const objet=basename(fichier);
 for(const archive of [true,false]){
  const nom=archive?objet:`${objet}.json`,body=archive?createReadStream(fichier):JSON.stringify(manifeste);
  try{
   const r=await fetch(`${endpoint}/object/${BUCKET}/${encodeURIComponent(nom)}`,{method:'POST',headers:{...entetes,'content-type':archive?'application/octet-stream':'application/json','x-upsert':'false'},body,duplex:'half',redirect:'error',signal:AbortSignal.timeout(300000)});
   if(!r.ok)throw erreur('dépôt incomplet, copie locale conservée');
   await r.body?.cancel();
  }finally{if(archive)body.destroy();}
 }
 return true;
}

export async function sauvegarder(config){
 if(!config)return {active:false};
 await mkdir(config.dossier,{recursive:true,mode:0o700});
 const nom=`oht-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.ohtbak`,fichier=join(config.dossier,nom);
 // Verrou de processus local : un seul dump simultané. Une interruption laisse le verrou à examiner.
 let verrou;
 try{verrou=await open(join(config.dossier,'sauvegarde.verrou'),'wx',0o600);}catch{throw erreur('verrou existant, vérifier le processus avant reprise');}
 let enfant;
 try{
  await verrou.writeFile(JSON.stringify({pid:process.pid,debut:new Date().toISOString()}));
  // Les GRANT/REVOKE font partie de la sauvegarde : sans eux le serveur perd ses droits après restauration.
  enfant=spawn(config.executable,['--format=custom','--no-owner','--compress=0','--lock-wait-timeout=15000','--no-password'],{env:{...config.env,PGAPPNAME:'oht-sauvegarde'},windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:600000});
  enfant.stderr.resume(); // Une erreur pg_dump peut contenir l’hôte ou l’utilisateur : jamais recopiée dans le journal.
  const fin=new Promise((ok,non)=>{enfant.once('error',()=>non(erreur('pg_dump indisponible')));enfant.once('close',code=>code===0?ok():non(erreur('pg_dump a échoué')));});
  const chiffrement=chiffrer(enfant.stdout,fichier,config.cle);
  let archive;
  try{[archive]=await Promise.all([chiffrement,fin]);}
  catch(e){enfant.kill();enfant.stdout.destroy();await Promise.allSettled([chiffrement,fin]);throw e;}
  // Tous les noms viennent du UUID local ; aucun chemin de fichier n’est fourni par le serveur distant.
  await rename(archive.part,fichier);
  const manifeste={version:1,date:new Date().toISOString(),fichier:nom,format:'pg_dump custom',chiffrement:'AES-256-GCM',...(await empreinte(fichier)),portee:'Base PostgreSQL accessible au compte de sauvegarde, droits GRANT/REVOKE inclus ; rôles du cluster et fichiers binaires Supabase Storage exclus.',stockage:config.envoi?'Supabase privé, même projet':'Local uniquement'};
  await writeFile(`${fichier}.json`,JSON.stringify(manifeste,null,2)+'\n',{flag:'wx',mode:0o600});
  const envoye=await deposer(config,fichier,manifeste);
  return {active:true,fichier:nom,envoye,sha256:manifeste.sha256,octets:manifeste.octets};
 }catch(e){enfant?.kill();throw e;}finally{
  await verrou.close();
  // Seul ce verrou, créé exclusivement par cet appel, est retiré. Aucune archive n’est supprimée.
  const {unlink}=await import('node:fs/promises');await unlink(join(config.dossier,'sauvegarde.verrou'));
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await sauvegarder(configuration())));}catch(e){console.error(e instanceof Error&&e.message.startsWith('Sauvegarde :')?e.message:'Sauvegarde : échec, copie locale à vérifier.');process.exitCode=1;}
}
