import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * EXG-TEC-083 (B) : « La configuration du lint doit exister et fonctionner dès
 * le premier commit. »
 *
 * Ce fichier ne se contente pas d'attraper les fautes de frappe : il rend
 * exécutables plusieurs règles de conception qui, autrement, ne tiendraient que
 * par la vigilance — et l'annexe B montre ce que coûte la vigilance seule.
 */
export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', '*.tsbuildinfo'],
  },

  // ─── Interface ──────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Un paramètre inutilisé se nomme _quelquechose, il ne se supprime pas en
      // silence : la signature documente ce que le composant reçoit.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'no-restricted-syntax': [
        'error',
        {
          // EXG-DES-002 (B) : « Aucun dégradé ne doit être utilisé sur un élément
          // d'interface. » Le défaut du chapitre 37 — le même dégradé sur chaque
          // élément important, donc plus aucune hiérarchie — est réintroduit par
          // une seule ligne distraite. Seul le Terrain y a droit (§38.3).
          selector:
            'Literal[value=/(linear|radial|conic)-gradient/]:not([value=/TERRAIN-AUTORISE/])',
          message:
            'EXG-DES-002 : aucun dégradé sur un élément d’interface. Seul le Terrain ' +
            'peut comporter des transitions douces (§38.3).',
        },
        {
          // Chapitre 39 : « Le design passe par les jetons, jamais vue par vue. »
          // Une couleur écrite en dur dans un composant échappe au thème sombre
          // et au test de contraste — donc à EXG-DES-001 et EXG-DES-020.
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Chapitre 39 : pas de couleur en dur dans un composant. Utiliser un jeton ' +
            'de src/theme/jetons.css (var(--accent), var(--texte-doux)…).',
        },
      ],
    },
  },

  // Les fichiers du thème DÉFINISSENT les couleurs : la règle ne s'y applique pas.
  {
    files: ['src/theme/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // ─── Serveur ────────────────────────────────────────────────────────────────
  {
    files: ['server/**/*.js', 'noyau/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Une promesse non attendue dans une route est une écriture qui part dans
      // le vide : la réponse est déjà envoyée quand elle échoue.
      'no-console': 'off',
    },
  },

  // ─── Modules purs ───────────────────────────────────────────────────────────
  // DEC-006 / EXG-TEC-001 : « La logique métier doit vivre dans des modules purs,
  // sans accès direct à la base ni à l'horloge système. La date du jour est un
  // argument, jamais une lecture implicite. »
  {
    files: ['noyau/**/*.js', 'server/core/**/*.js'],
    ignores: ['**/*.test.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
          message:
            'EXG-TEC-001 : un module pur ne lit pas l’horloge. Passer l’instant en argument — ' +
            'c’est ce qui rend le test « samedi soir, objectif non atteint » possible.',
        },
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message:
            'EXG-TEC-001 : un module pur ne lit pas l’horloge. Passer l’instant en argument.',
        },
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Un module pur ne charge rien : ni base, ni réseau, ni système de fichiers.',
        },
      ],
    },
  },

  // ─── Tests ──────────────────────────────────────────────────────────────────
  {
    files: ['e2e/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-restricted-syntax': 'off' },
  },

  {
    files: ['**/*.test.js', '**/*.test.ts'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-syntax': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // ─── Configuration ──────────────────────────────────────────────────────────
  {
    files: ['*.config.js', '*.config.ts', 'playwright.config.ts'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
)
