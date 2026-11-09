// DAL réel, réponses PostgREST simulées ; aucune connexion externe ni secret réel.
import assert from 'node:assert/strict';
import {test} from 'node:test';
process.env.SUPABASE_URL='https://emcf-base.test';process.env.SUPABASE_SECRET_KEY='secret-synthetique';
const {lireOperation,lireOperationDocument,creerOperation,prendreOperation,enregistrerResultat,listerOperations,lireConfirmee}=await import('@/lib/serveur/emcf/operations');
const id='00000000-0000-4000-8000-000000000001',facture='00000000-0000-4000-8000-000000000002',admin='00000000-0000-4000-8000-000000000003';
const o={id,facture_id:facture,avoir_id:null,environnement:'production',ifu:'9999999999999',requete:{ifu:'9999999999999',type:'FV',items:[{name:'TEST',price:100,quantity:1,taxGroup:'A'}],operator:{name:'TEST'}},identite:{ifu:'9999999999999',raisonSociale:'TEST'},uid:'TEST-UID',calcul:{uid:'TEST-UID',total:100},securite:{dateTime:'2026-11-06T12:00:00',qrCode:'TEST-QR',codeMECeFDGI:'TEST-CODE',counters:'1/1 FV',nim:'TEST-NIM'},etat:'confirmee',erreur:null,cree_par:admin,cree_le:'2026-11-06T12:00:00Z',modifie_le:'2026-11-06T12:00:00Z'};
const v={factureId:facture,environnement:'production',ifu:o.ifu,requete:o.requete,identite:o.identite,creePar:admin};
function simuler(repondre){const appels=[];globalThis.fetch=async(url,init={})=>{const u=new URL(url);assert.equal(u.hostname,'emcf-base.test');appels.push({u,init});return repondre(u,init);};return appels;}

test('une absence est distincte de toutes pannes et ne divulgue pas le corps externe',async()=>{
 for(const [fn,absence] of [[()=>lireOperation(id),null],[()=>lireOperationDocument(facture,null,'production'),null],[()=>lireConfirmee(facture),null],[()=>listerOperations(),[]]]){
  simuler(()=>Response.json([]));assert.deepEqual(await fn(),absence);
  for(const panne of [()=>new Response('donnee-personnelle-TEST',{status:500}),()=>{throw Error('donnee-personnelle-TEST');},()=>new Response('{'),()=>Response.json({erreur:'donnee-personnelle-TEST'}),()=>Response.json([{}])]){
   simuler(panne);await assert.rejects(fn,e=>e.message==='emcf_lecture_indisponible');
  }
 }
 simuler(()=>Response.json([]));assert.equal(await lireConfirmee(facture),null);assert.equal(await lireOperation(id),null);assert.deepEqual(await listerOperations(),[]);
});
test('PDF : seulement une confirmation production du document exact',async()=>{
 const appels=simuler(()=>Response.json([o]));assert.deepEqual(await lireConfirmee(facture),o);
 const q=appels[0].u.searchParams;assert.equal(q.get('environnement'),'eq.production');assert.equal(q.get('etat'),'eq.confirmee');assert.equal(q.get('avoir_id'),'is.null');
 for(const patch of [{environnement:'test'},{etat:'attente'},{facture_id:admin},{avoir_id:admin},{uid:null},{calcul:null},{securite:null}]){
  simuler(()=>Response.json([{...o,...patch}]));await assert.rejects(()=>lireConfirmee(facture),/emcf_lecture_indisponible/);
 }
 simuler(()=>Response.json([o]));assert.equal((await lireOperationDocument(facture,null,'production')).id,id);
 await assert.rejects(()=>lireOperationDocument(facture,null,'test'),/emcf_lecture_indisponible/);
});
test('RPC : création et CAS exacts, refus nul distinct de panne sans données',async()=>{
 const appels=simuler(()=>Response.json(o));assert.deepEqual(await creerOperation(v),o);
 await prendreOperation(id,'preparee','envoi');await enregistrerResultat(id,'envoi',{etat:'attente',uid:o.uid,calcul:o.calcul});
 assert.deepEqual(appels.map(a=>a.u.pathname),['/rest/v1/rpc/emcf_operation_creer','/rest/v1/rpc/emcf_operation_prendre','/rest/v1/rpc/emcf_operation_resultat']);
 assert.equal(JSON.parse(appels[0].init.body).p_par,admin);assert.equal(JSON.parse(appels[0].init.body).p_avoir,null);
 assert.deepEqual(JSON.parse(appels[1].init.body),{p_id:id,p_de:'preparee',p_vers:'envoi'});
 for(const fn of [()=>creerOperation(v),()=>prendreOperation(id,'preparee','envoi'),()=>enregistrerResultat(id,'envoi',{etat:'incertaine',erreur:'transport'})]){
  simuler(()=>Response.json(null));assert.equal(await fn(),null);
  for(const panne of [()=>new Response('donnee-personnelle-TEST',{status:500}),()=>{throw Error('donnee-personnelle-TEST');},()=>new Response('{'),()=>Response.json({})]){
   simuler(panne);await assert.rejects(fn,e=>e.message==='emcf_ecriture_indisponible');
  }
 }
});
test('entrées d’identifiant et limites refusées sans requête',async()=>{
 const appels=simuler(()=>assert.fail('pas de requête'));
 assert.equal(await lireOperation('malforme'),null);assert.equal(await lireOperationDocument(facture,'malforme','test'),null);
 assert.equal(await lireConfirmee('malforme'),null);assert.equal(await lireConfirmee(facture,'malforme'),null);
 assert.equal(await creerOperation({...v,creePar:'malforme'}),null);assert.equal(await prendreOperation('malforme','preparee','envoi'),null);
 assert.equal(await enregistrerResultat('malforme','envoi',{etat:'attente'}),null);
 for(const limit of [0,-1,101,NaN,1.5])assert.equal(await listerOperations(limit),null);
 assert.equal(appels.length,0);
});

test('historique : opération ancienne visée conservée et panne de sa lecture non masquée',async()=>{
 const recente={...o,id:admin},ancienne={...o,etat:'attente',securite:null};
 const appels=simuler(u=>Response.json(u.searchParams.has('id')?[ancienne]:[recente]));
 assert.deepEqual(await listerOperations(50,id),[ancienne,recente]);
 assert.equal(appels.length,2);assert.equal(appels[1].u.searchParams.get('id'),`eq.${id}`);
 const memes=simuler(()=>Response.json([recente]));
 assert.deepEqual(await listerOperations(50,admin),[recente]);assert.equal(memes.length,1);
 const absente=simuler(u=>Response.json(u.searchParams.has('id')?[]:[recente]));
 assert.deepEqual(await listerOperations(50,id),[recente]);assert.equal(absente.length,2);
 simuler(u=>u.searchParams.has('id')?new Response('donnee-personnelle-TEST',{status:503}):Response.json([recente]));
 await assert.rejects(()=>listerOperations(50,id),e=>e.message==='emcf_lecture_indisponible');
 const invalide=simuler(()=>Response.json([recente]));
 assert.deepEqual(await listerOperations(50,'invalide'),[recente]);assert.equal(invalide.length,1);
});
