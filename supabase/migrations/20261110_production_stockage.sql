-- Le compartiment des documents avait été créé manuellement. Une base neuve doit aussi le recevoir.
-- Réaffirme les limites des trois compartiments privés, sans toucher aux fichiers existants.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('equipe-documents','equipe-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']),
  ('site-medias-depot','site-medias-depot',false,8388608,array['image/jpeg','image/png','image/webp']),
  ('oht-sauvegardes','oht-sauvegardes',false,1073741824,array['application/octet-stream','application/json'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Aucune politique de lecture ou d'écriture publique n'est créée. Les liens signés passent par le serveur.
