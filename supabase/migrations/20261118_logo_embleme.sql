-- Barre de navigation et pied de page : l'emblème rond original d'OHT remplace la bannière « OUIDAH » (la patronne, via
-- Kevin le 10/11). La clé « logo » disparaît de la navigation ; elle n'est retirée que si elle porte encore la bannière.
update public.contenu_site set valeur = valeur - 'logo'
  where (cle = 'fr.nav' or cle like '%:fr.nav') and valeur #>> '{logo,src}' = '/brand/oht-logo.png';
update public.contenu_site set brouillon = brouillon - 'logo'
  where (cle = 'fr.nav' or cle like '%:fr.nav') and brouillon #>> '{logo,src}' = '/brand/oht-logo.png';
