/**
 * Le démarrage du serveur.
 *
 * ⚠ IL REFUSE DE DÉMARRER PLUTÔT QUE DE DÉMARRER À MOITIÉ.
 *
 * Trois choses sont vérifiées avant d'écouter : la clé de chiffrement, le mot de
 * passe du verrou, et la base. Chacune manquante donnerait un serveur qui a
 * l'air de marcher et qui casse au pire moment — au moment précis où le
 * fondateur confie ses identifiants, ou pire, en laissant l'application ouverte
 * à qui trouve l'adresse.
 */
import { construireApp } from './app.js'
import { port } from './config.js'
import { motDePasse } from './config.js'
import { verifierLaCle } from './chiffrement.js'
import { migrer } from './db/migrer.js'
import { verifierLaBase } from './db/index.js'
import { urlPublique } from './url-publique.js'

function arreter(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

// 1. La clé de chiffrement. Sans elle, aucun jeton ne peut être rangé ni relu.
try {
  verifierLaCle()
} catch (e) {
  arreter(
    `CLE_CHIFFREMENT est absente ou invalide : ${e.message}\n` +
      '  Générer : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
      '  ⚠ La même valeur partout, local et production. Une clé qui change oblige à tout reconnecter.',
  )
}

// 2. Le verrou. Une application déployée sans verrou laisse n'importe qui
//    atteindre les comptes du fondateur.
if (!motDePasse()) {
  arreter(
    'MOT_DE_PASSE est absente : le verrou d’entrée serait ouvert à tout le monde.\n' +
      '  Choisir une valeur et la poser dans les variables d’environnement.',
  )
}

// 3. La base, puis les migrations.
const base = await verifierLaBase()
if (!base.ok) {
  arreter(
    `La base PostgreSQL ne répond pas : ${base.erreur}\n` +
      '  Vérifier DATABASE_URL. Sans base, les jetons n’ont nulle part où être rangés.',
  )
}

const jouees = await migrer()
if (jouees.length) console.log(`Migrations jouées : ${jouees.join(', ')}`)

const adresse = urlPublique()
if (!adresse) {
  console.warn(
    '⚠ Adresse publique inconnue (ni URL_PUBLIQUE ni RAILWAY_PUBLIC_DOMAIN).\n' +
      '  La connexion OAuth refusera de partir : elle ne peut pas construire son adresse de retour.',
  )
} else {
  console.log(`Adresse publique : ${adresse}`)
  console.log(`Adresse de retour à déclarer chez Google : ${adresse}/api/connexions/retour/youtube`)
}

construireApp().listen(port, () => {
  console.log(`Momentum écoute sur le port ${port}.`)
})
