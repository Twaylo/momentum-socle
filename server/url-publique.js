/**
 * L'adresse publique du serveur — celle qui construit l'adresse de retour OAuth.
 *
 * ⚠ C'EST LE POINT LE PLUS COÛTEUX DU CHANTIER.
 *
 * L'adresse de retour se déclare dans la console de la plateforme, et les
 * plateformes la comparent CARACTÈRE PAR CARACTÈRE avec celle qu'on envoie. Un
 * `http` au lieu d'un `https`, une barre finale en trop, et l'échange échoue sur
 * « redirect_uri_mismatch » — un message qui ne dit pas laquelle des deux est
 * fausse.
 *
 * D'où la déduction automatique depuis l'hébergeur plutôt qu'une recopie à la
 * main : une variable qu'on ne saisit pas est une faute de frappe qu'on ne fait
 * pas.
 */

/** Enlève la barre finale : elle compte dans la comparaison de la plateforme. */
function sansBarreFinale(url) {
  return url.replace(/\/+$/, '')
}

/**
 * @returns {string} l'origine publique, sans barre finale. Chaîne vide si
 * inconnue — l'appelant doit le dire, pas inventer une adresse.
 */
export function urlPublique() {
  const explicite = process.env.URL_PUBLIQUE
  if (explicite) return sansBarreFinale(explicite)

  // Railway fournit le domaine sans protocole, et sert toujours en https.
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN
  if (railway) return sansBarreFinale(`https://${railway}`)

  // Render, si l'hébergeur change un jour : lui donne l'URL complète.
  const render = process.env.RENDER_EXTERNAL_URL
  if (render) return sansBarreFinale(render)

  return ''
}

/**
 * L'adresse de retour d'un réseau, telle qu'elle doit être déclarée dans la
 * console de la plateforme. C'est cette chaîne exacte qu'on copie-colle.
 */
export function adresseDeRetour(reseau) {
  const base = urlPublique()
  if (!base) return ''
  return `${base}/api/connexions/retour/${reseau}`
}
