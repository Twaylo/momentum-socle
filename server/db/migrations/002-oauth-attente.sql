-- La mémoire courte de l'aller-retour vers la plateforme.
--
-- Une ligne créée quand le créateur part autoriser, effacée à son retour. Elle
-- ne survit pas à l'échange : c'est un jeton de passage, pas un enregistrement.
--
-- ⚠ L'ÉTAT EST À USAGE UNIQUE ET PÉRIME EN DIX MINUTES. Sans état, un lien de
-- retour forgé rattacherait le compte d'un inconnu. Le garder au-delà de
-- l'échange rouvrirait la même porte plus tard.
--
-- ⚠ LA REDIRECTION EST FIGÉE AU DÉPART, et relue au retour telle qu'elle est
-- partie. Les plateformes comparent cette adresse CARACTÈRE PAR CARACTÈRE entre
-- l'aller et le retour : la recalculer au retour, à partir d'un domaine qui a pu
-- changer entre-temps, donne « redirect_uri_mismatch » — un message qui ne dit
-- pas laquelle des deux versions est fausse.
--
-- ⚠ LE VÉRIFIEUR PKCE EST CHIFFRÉ. YouTube ne s'en sert pas, mais TikTok et X
-- l'exigeront : la colonne existe déjà, et elle ne stocke rien en clair.

create table if not exists oauth_attente (
  etat               text        primary key,
  reseau             text        not null,
  verifieur_chiffre  text,
  redirection        text        not null,
  cree_le            timestamptz not null default now(),
  perime_le          timestamptz not null
);

-- Le ménage des états périmés se fait par cet index, sans parcourir la table.
create index if not exists oauth_attente_perime_le on oauth_attente (perime_le);
