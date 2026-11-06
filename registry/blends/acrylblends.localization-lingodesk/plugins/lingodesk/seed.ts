/** The project a person sees on the first start: Northstar App, with four target locales over twelve message keys, mostly translated, with the mockup's states. */
import type { DeskState, GlossaryTerm, Locale, MemoryEntry, MessageKey, Segment, SegmentState } from './domain.ts'
import { qaChecks, ME } from './domain.ts'

const locales: Locale[] = [
  { id: 'de-AT', name: 'Deutsch (Austria)', header: 'DEUTSCH (AUSTRIA)' },
  { id: 'fr-FR', name: 'Français (France)', header: 'FRANÇAIS (FRANCE)' },
  { id: 'es-ES', name: 'Español (España)', header: 'ESPAÑOL (ESPAÑA)' },
  { id: 'ja-JP', name: '日本語 (Japan)', header: '日本語 (JAPAN)' },
]

const keys: MessageKey[] = [
  { key: 'welcome.title', type: 'ui', source: 'Welcome back, {firstName}.' },
  { key: 'welcome.subtitle', type: 'ui', source: 'Your workspace is ready when you are.' },
  { key: 'welcome.continue', type: 'ui', source: 'Continue to your dashboard', maxLength: 40 },
  { key: 'welcome.skip', type: 'ui', source: 'Skip for now', maxLength: 24 },
  { key: 'signin.title', type: 'ui', source: 'Sign in to your workspace' },
  { key: 'signin.button', type: 'ui', source: 'Sign in', maxLength: 14 },
  { key: 'setup.invite', type: 'ui', source: 'Invite your team to {workspaceName}.' },
  { key: 'setup.done', type: 'ui', source: 'You’re all set, {firstName}!' },
  { key: 'help.start', type: 'help', source: 'Start with a template or a blank page.' },
  { key: 'help.share', type: 'help', source: 'Share a {workspaceName} link.' },
  { key: 'email.subject', type: 'email', source: 'Welcome to {workspaceName}', maxLength: 60 },
  { key: 'email.preview', type: 'email', source: 'Your workspace is ready.' },
]

/** key → [target, state], per locale. A missing key is untranslated. */
const targets: Record<string, Record<string, [string, SegmentState]>> = {
  'de-AT': {
    'welcome.title': ['Willkommen zurück, {firstName}.', 'review'],
    'welcome.subtitle': ['Dein Arbeitsbereich ist bereit, wenn du es bist.', 'approved'],
    'welcome.skip': ['Vorerst überspringen', 'review'],
    'signin.title': ['Bei deinem Arbeitsbereich anmelden', 'approved'],
    'signin.button': ['Anmelden', 'approved'],
    'setup.invite': ['Lade dein Team zu {workspaceName} ein.', 'review'],
    'help.start': ['Beginne mit einer Vorlage oder einer leeren Seite.', 'review'],
    'help.share': ['Teile einen Link zu {workspaceName}.', 'review'],
    'email.subject': ['Willkommen bei {workspaceName}', 'approved'],
    'email.preview': ['Dein Arbeitsbereich ist bereit.', 'review'],
  },
  'fr-FR': {
    'welcome.title': ['Bon retour, {firstName}.', 'approved'],
    'welcome.subtitle': ['Votre espace de travail est prêt quand vous l’êtes.', 'approved'],
    'welcome.continue': ['Continuer vers votre tableau de bord', 'approved'],
    'welcome.skip': ['Passer pour l’instant', 'approved'],
    'signin.title': ['Se connecter à votre espace de travail', 'approved'],
    'signin.button': ['Se connecter', 'approved'],
    'setup.invite': ['Invitez votre équipe sur {workspace}.', 'review'],
    'setup.done': ['Tout est prêt, {firstName} !', 'review'],
    'help.start': ['Commencez avec un modèle ou une page vierge.', 'approved'],
    'help.share': ['Partagez un lien {workspaceName}.', 'review'],
    'email.subject': ['Bienvenue sur {workspaceName}', 'approved'],
    'email.preview': ['Votre espace de travail est prêt.', 'approved'],
  },
  'es-ES': {
    'welcome.title': ['Te damos la bienvenida de nuevo, {firstName}.', 'review'],
    'welcome.subtitle': ['Tu espacio de trabajo está listo cuando tú lo estés.', 'review'],
    'welcome.continue': ['Continuar a tu panel', 'review'],
    'welcome.skip': ['Omitir por ahora', 'approved'],
    'signin.title': ['Iniciar sesión en tu espacio de trabajo', 'review'],
    'signin.button': ['Iniciar sesión', 'approved'],
  },
  'ja-JP': {
    'welcome.title': ['おかえりなさい、{firstName}さん。', 'review'],
    'welcome.subtitle': ['準備ができたら、ワークスペースはいつでも使えます。', 'review'],
    'signin.title': ['ワークスペースにサインイン', 'review'],
    'signin.button': ['サインイン', 'review'],
  },
}

const glossary: GlossaryTerm[] = [
  { id: 'term-workspace', term: 'workspace', pos: 'noun', translations: { 'de-AT': 'Arbeitsbereich', 'fr-FR': 'espace de travail', 'es-ES': 'espacio de trabajo', 'ja-JP': 'ワークスペース' } },
  { id: 'term-dashboard', term: 'dashboard', pos: 'noun', translations: { 'de-AT': 'Übersicht', 'fr-FR': 'tableau de bord', 'es-ES': 'panel', 'ja-JP': 'ダッシュボード' } },
  { id: 'term-signin', term: 'sign in', pos: 'verb', translations: { 'de-AT': 'anmelden', 'fr-FR': 'se connecter', 'es-ES': 'iniciar sesión', 'ja-JP': 'サインイン' } },
]

const memory: MemoryEntry[] = [
  { id: 'tm-1', locale: 'de-AT', source: 'Welcome back, {name}.', target: 'Willkommen zurück, {name}.', context: 'same flow' },
  { id: 'tm-2', locale: 'de-AT', source: 'Continue to your dashboard', target: 'Weiter zu deiner Übersicht', context: 'same context' },
  { id: 'tm-3', locale: 'de-AT', source: 'You’re all set!', target: 'Alles bereit!', context: 'same flow' },
  { id: 'tm-4', locale: 'fr-FR', source: 'You’re all set, {name}!', target: 'Tout est prêt, {name} !', context: 'same flow' },
  { id: 'tm-5', locale: 'es-ES', source: 'Continue to your dashboard', target: 'Continuar a tu panel', context: 'same context' },
]

export function seed(now: Date): DeskState {
  const iso = (minutesAgo: number): string => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
  const segments: Segment[] = locales.flatMap((l) =>
    keys.map((k): Segment => {
      const hit = targets[l.id]?.[k.key]
      const recent = l.id === 'de-AT' && k.key === 'welcome.title'
      return { key: k.key, locale: l.id, target: hit?.[0] ?? '', state: hit?.[1] ?? 'empty', updatedAt: recent ? iso(4) : iso(24 * 60 + 35), by: recent ? ME : 'Jonas' }
    }),
  )
  const state = { keys, segments, glossary }
  return {
    version: 1,
    project: 'Northstar App',
    syncedAt: iso(12),
    locales,
    keys,
    segments,
    glossary,
    memory,
    qa: Object.fromEntries(locales.map((l) => [l.id, { at: now.toISOString(), checks: qaChecks(state, l.id) }])),
  }
}
