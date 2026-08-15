-- Les comptes sociaux connectés. Une ligne par compte chez un réseau.
--
-- ⚠ L'UNICITÉ EST (reseau, externe_id), PAS L'IDENTIFIANT INTERNE.
-- Reconnecter la même chaîne YouTube doit METTRE À JOUR la ligne existante, pas
-- en créer une deuxième. Sans cette contrainte, un créateur qui reconnecte après
-- une erreur se retrouve avec deux lignes pour une chaîne : l'écran en montre
-- deux, et rien ne dit laquelle porte le jeton valable.
--
-- ⚠ LES DEUX JETONS SONT CHIFFRÉS AU REPOS, jamais écrits en clair. La colonne
-- porte le texte chiffré produit par server/chiffrement.js.
--
-- ⚠ expire_le PEUT ÊTRE NULL, et ça ne veut pas dire « expiré ». Ça veut dire
-- « le réseau ne l'a pas dit ». Trois états, jamais deux : mesuré, mesuré à
-- zéro, pas mesuré. Sans échéance connue, on ne rafraîchit pas — le faire à
-- chaque appel brûlerait le quota et finirait par faire révoquer l'application.

create table if not exists comptes_sociaux (
  id                              bigserial   primary key,
  reseau                          text        not null,
  externe_id                      text        not null,
  nom                             text,

  jeton_acces_chiffre             text        not null,
  jeton_rafraichissement_chiffre  text,
  expire_le                       timestamptz,
  refresh_expire_le               timestamptz,

  -- Les portées réellement accordées, telles que la plateforme les rend.
  -- Ce n'est pas la même chose que celles demandées : la sonde compare les deux.
  portees                         text,

  -- 'actif' | 'a_reconnecter'. Un refus définitif de la plateforme bascule ici,
  -- pour que l'écran le dise au lieu d'afficher un compte qui ne répond plus.
  etat                            text        not null default 'actif',

  -- La dernière erreur reçue, gardée telle quelle. Aucun catch vide : un refus
  -- avalé produirait un compte « connecté » qui ne l'est pas.
  derniere_erreur                 text,
  derniere_erreur_le              timestamptz,

  cree_le                         timestamptz not null default now(),
  maj_le                          timestamptz not null default now(),

  constraint comptes_sociaux_unicite unique (reseau, externe_id)
);
