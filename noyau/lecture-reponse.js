/**
 * Lire la réponse d'une passerelle SANS confondre « vide » et « incompris ».
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, ET QUI EST REVENU TROIS FOIS ──────────────
 *
 * Le catalogue du fondateur revenait vide. L'écran disait « COMPLET · 0
 * publication » pour ses six réseaux, chez quelqu'un qui publie tous les jours
 * depuis des années. Aucune erreur nulle part.
 *
 * La cause tenait en une ligne, écrite trois fois :
 *
 *     const media = Array.isArray(r?.media) ? r.media : []
 *
 * Si la passerelle range sa liste sous une autre clef — `data.media`, `items`,
 * `results` —, cette ligne ne dit pas « je n'ai pas trouvé », elle dit « il n'y
 * en a pas ». Un désaccord de FORME devient un compte à zéro, et rien ne le
 * signale : ni journal, ni écran, ni test.
 *
 * ── ET C'EST LA MÊME FAUTE QUE DEUX AUTRES DE CE PRODUIT ─────────────────────
 *
 *   · `verdictPour` jetait le message brut de la plateforme quand il ne savait
 *     pas le traduire — « YouTube a refusé », sans raison, alors que YouTube
 *     avait dit « Title is required » ;
 *   · une publication sans adresse était déclarée ÉCHOUÉE — « je ne sais pas le
 *     prouver » devenu « ça n'a pas marché ».
 *
 * Trois fois la même conversion silencieuse : « je n'ai pas compris » → « il n'y
 * a rien ». C'est la plus coûteuse des erreurs, parce qu'elle ressemble à une
 * réponse.
 *
 * ── CE QUE FAIT CE MODULE ────────────────────────────────────────────────────
 *
 * Il cherche la liste à plusieurs endroits plausibles. S'il la trouve, même
 * vide, il la rend : un compte réellement sans publication est une réponse
 * valable. S'il n'en trouve AUCUNE, il lève — en nommant les clefs réellement
 * présentes, pour que la forme inconnue se lise au lieu de se deviner.
 *
 * Module PUR : aucune requête, aucune dépendance. La règle se vérifie sur des
 * objets écrits à la main, y compris les formes qu'on n'a jamais vues.
 */

/** Descend un chemin pointé dans un objet. Rend `undefined` s'il casse. */
function descendre(objet, chemin) {
  return chemin.split('.').reduce((n, clef) => (n == null ? undefined : n[clef]), objet)
}

/**
 * La liste rangée sous l'un des chemins donnés.
 *
 * @param {object} reponse   ce que la passerelle a rendu
 * @param {string[]} chemins par ordre de préférence, ex. ['media', 'data.media']
 * @param {string} quoi      ce qu'on cherchait, pour le message d'erreur
 * @returns {Array}
 * @throws {Error} quand aucun chemin ne mène à une liste
 */
export function listeDe(reponse, chemins, quoi = 'la liste') {
  for (const chemin of chemins) {
    const valeur = descendre(reponse, chemin)
    // ⚠ On accepte une liste VIDE. Un compte sans publication est une réponse
    // parfaitement valable, et la refuser ferait passer un créateur qui débute
    // pour une panne.
    if (Array.isArray(valeur)) return valeur
  }
  throw new Error(formuler(reponse, chemins, quoi))
}

/**
 * L'objet rangé sous l'un des chemins donnés — même règle, autre forme.
 *
 * Sert aux réponses qui rendent un dictionnaire plutôt qu'une liste : les
 * abonnés par réseau, par exemple.
 */
export function objetDe(reponse, chemins, quoi = 'l’objet') {
  for (const chemin of chemins) {
    const valeur = descendre(reponse, chemin)
    if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) return valeur
  }
  throw new Error(formuler(reponse, chemins, quoi))
}

/**
 * Le message qui permet de réparer en une lecture.
 *
 * ⚠ Il nomme les clefs REÇUES, pas seulement celles attendues. « Je n'ai pas
 * trouvé `media` » laisse chercher ; « j'attendais media, la réponse contient
 * success, data, pagination » désigne la correction.
 *
 * ⚠ Et il ne recopie AUCUNE valeur — seulement des noms de champs. Une réponse
 * de passerelle contient les légendes du créateur et parfois des adresses
 * signées ; elles n'ont rien à faire dans un message d'erreur qui finit à
 * l'écran et dans les journaux.
 */
function formuler(reponse, chemins, quoi) {
  const recues =
    reponse && typeof reponse === 'object' ? Object.keys(reponse).slice(0, 12) : [typeof reponse]

  return (
    `Réponse de forme inconnue pour ${quoi} : ` +
    `attendu ${chemins.join(' ou ')}, reçu {${recues.join(', ')}}.`
  )
}

/**
 * La même recherche, mais qui rend une liste vide au lieu de lever.
 *
 * ── QUAND CETTE VARIANTE EST LA BONNE, ET SEULEMENT ALORS ────────────────────
 *
 * Sur le chemin de PUBLICATION. Là, une forme inattendue ne doit pas faire
 * échouer un envoi : d'autres signaux restent — l'identifiant de demande, le
 * statut HTTP — et la file sait conclure sans la liste des plateformes. Lever
 * ici transformerait un désaccord de forme en publication perdue.
 *
 * ⚠ Elle ne doit JAMAIS servir sur un chemin de lecture. C'est précisément
 * l'usage qui a vidé le catalogue du fondateur et effacé ses connexions : là,
 * « je n'ai pas compris » doit se dire.
 *
 * Elle laisse une trace, pour que le désaccord se voie quand même dans les
 * journaux plutôt que de disparaître entièrement.
 */
export function listeOuVide(reponse, chemins, quoi = 'la liste', tracer = null) {
  try {
    return listeDe(reponse, chemins, quoi)
  } catch (e) {
    tracer?.(e.message)
    return []
  }
}

/**
 * Ce qu'on a le droit de MONTRER au créateur d'un désaccord technique.
 *
 * ── LE DÉFAUT QUE ÇA FERME ───────────────────────────────────────────────────
 *
 * Je venais de faire remonter à l'écran le message brut d'un import raté, pour
 * qu'il puisse se lire au lieu de se deviner. Un test l'a attrapé aussitôt : ce
 * message pouvait contenir « AGREGATEUR_CLE est absente ».
 *
 * EXG-CNX-004 est catégorique — le nom de l'agrégateur, et par extension notre
 * plomberie, ne doit JAMAIS atteindre l'utilisateur final. Il a choisi
 * Momentum, pas la passerelle derrière ; lui faire lire nos noms de variables,
 * c'est lui refiler un problème qui n'est pas le sien.
 *
 * ── CE QUI PASSE, ET CE QUI NE PASSE PAS ─────────────────────────────────────
 *
 * Passe : un désaccord de FORME. « attendu media, reçu {success, data} » nomme
 * des champs de la plateforme, se recopie tel quel, et c'est exactement ce qui
 * permet de réparer en une lecture.
 *
 * Ne passe pas : tout ce qui nomme notre configuration. Le créateur n'y peut
 * rien, et Réglages a déjà un écran fait pour ça.
 *
 * ⚠ Le filtre est une LISTE DE REFUS, pas une liste d'autorisations : un
 * message inconnu passe. L'inverse ferait taire les messages utiles qu'on n'a
 * pas encore vus — c'est-à-dire précisément ceux qui servent.
 */
/**
 * ⚠ LES SÉPARATEURS SONT TOLÉRÉS DANS LES MOTIFS.
 *
 * Mon premier jet écrivait `/uploadpost/i` — et laissait donc passer
 * « Upload-Post API error », c'est-à-dire la formulation exacte de leur SDK.
 * Un filtre qui rate la graphie réelle de ce qu'il filtre ne filtre rien ; un
 * test l'a attrapé dans la minute.
 */
const INTERDITS = [
  /agr[ée]gateur/i,
  /upload[\s_-]?post/i,
  /ayrshare/i,
  /api[\s_-]?key/i,
  /\bbearer\b/i,
  /apikey/i,
]

export function messageMontrable(message) {
  const m = String(message ?? '').trim()
  if (!m) return null
  if (INTERDITS.some((i) => i.test(m))) {
    // On ne dit pas « erreur inconnue » : on dit ce qui est vrai et ce qu'il
    // faut faire, sans nommer la plomberie.
    return 'Momentum n’a pas pu joindre le service de publication. Regarde Réglages pour le détail.'
  }
  return m
}

/**
 * Le message, CAVIARDÉ plutôt qu'effacé.
 *
 * ── LE DÉFAUT QUE ÇA FERME, ET IL EST DE MOI ─────────────────────────────────
 *
 * `messageMontrable` remplace le message ENTIER dès qu'il croise le nom de la
 * passerelle. C'est juste sur un écran ordinaire — le créateur a choisi
 * Momentum, pas la plomberie derrière (EXG-CNX-004).
 *
 * Mais leur SDK préfixe ses erreurs par « Upload-Post API error: … ». TOUTES
 * leurs erreurs contiennent donc le mot interdit, et toutes devenaient la même
 * phrase creuse. J'ai passé la soirée à construire un diagnostic pour lire leur
 * réponse — et mon propre filtre l'effaçait avant qu'elle n'arrive à l'écran.
 * Le fondateur a vu trois « refusé » identiques, sans la moindre raison.
 *
 * On remplace donc les IDENTITÉS, pas la phrase : le nom de la passerelle
 * devient « la passerelle », une clef devient « la clef », et la raison — qui
 * est la seule chose utile — reste lisible.
 *
 * ⚠ La contrainte est tenue à la lettre : le nom du fournisseur n'atteint
 * jamais l'utilisateur. Il est simplement remplacé au lieu de tout emporter.
 */
export function caviarder(message) {
  const m = String(message ?? '').trim()
  if (!m) return null

  return (
    m
      // Le nom du fournisseur, quelle que soit sa graphie.
      .replace(/upload[\s_-]?post/gi, 'la passerelle')
      .replace(/ayrshare/gi, 'la passerelle')
      .replace(/agr[ée]gateur/gi, 'passerelle')
      /**
       * ⚠ LA VALEUR D'ABORD, LE MOT ENSUITE.
       *
       * `Apikey abc123` doit devenir « la clef », pas « la clef abc123 » : si on
       * remplaçait d'abord le mot, la valeur resterait en clair — c'est-à-dire
       * exactement le secret qu'on prétend protéger.
       */
      .replace(/\b(api[\s_-]?key|apikey|bearer|token)\b[\s:=]*\S+/gi, 'la clef')
      .replace(/\b(api[\s_-]?key|apikey|bearer)\b/gi, 'la clef')
      // Une variable d'environnement nommée dans un message est de la plomberie.
      .replace(/\bAGREGATEUR_[A-Z_]+\b/g, 'la configuration')
      .trim() || null
  )
}

/**
 * Le mot à mot d'une plateforme, rendu lisible par un humain.
 *
 * ── ⚠ POURQUOI CE N'EST PAS UNE COQUETTERIE ──────────────────────────────────
 *
 * EXG-TEC-013 exige que le message de la plateforme accompagne le nôtre. Vérifié
 * en vrai sur un refus Google, ce message fait 280 caractères, contient trois
 * retours à la ligne et écrit les apostrophes en `&#39;`. Il voyage ensuite dans
 * une adresse de retour, et s'affiche tel quel.
 *
 * Le résultat est illisible — donc personne ne le lit — donc l'exigence est
 * tenue sur le papier et perdue en pratique. Ce qui compte dans « You can't sign
 * in to this app because it doesn't comply with Google's OAuth 2.0 policy »,
 * c'est la première phrase.
 *
 * ⚠ ON COUPE, ON NE RÉÉCRIT PAS. Le journal garde le message ENTIER : c'est là
 * qu'on répare. Ici on rend ce qu'un humain peut lire d'un coup d'œil.
 */
export function motAMot(brut, max = 180) {
  const m = String(brut ?? '')
    // Les entités que les plateformes envoient en clair dans du JSON.
    .replace(/&#0*39;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    // Retours à la ligne et espaces multiples : une seule ligne.
    .replace(/\s+/g, ' ')
    .trim()

  if (!m) return null
  if (m.length <= max) return m

  /**
   * On coupe à la fin d'une phrase quand il y en a une avant la limite : la
   * première phrase d'un message de plateforme porte presque toujours la cause,
   * et le reste explique quoi faire à un développeur, pas au créateur.
   */
  const fin = m.slice(0, max)
  const phrase = fin.search(/[.!?](?=[^.!?]*$)/)
  return phrase > 40 ? fin.slice(0, phrase + 1) : `${fin.trimEnd()}…`
}
