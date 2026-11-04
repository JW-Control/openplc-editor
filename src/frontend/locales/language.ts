/** UI languages offered by the JWPLC Edition. Spanish is the default. */
export const UI_LANGUAGES = ['es', 'en'] as const
export type UiLanguage = (typeof UI_LANGUAGES)[number]

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'es'
export const UI_LANGUAGE_STORAGE_KEY = 'language'

/** Name of each language written in that same language, for the selector. */
export const UI_LANGUAGE_NAMES: Record<UiLanguage, string> = { es: 'Español', en: 'English' }

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'es' || value === 'en'
}

/** Renderer cache of the chosen language; the main process has no localStorage. */
export function readStoredUiLanguage(): UiLanguage {
  // Test runs and developers can force a language (the unit tests run in English).
  const forced = typeof process !== 'undefined' ? process.env?.OPENPLC_UI_LANGUAGE : undefined
  if (isUiLanguage(forced)) return forced
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_UI_LANGUAGE
    const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
    return isUiLanguage(stored) ? stored : DEFAULT_UI_LANGUAGE
  } catch {
    return DEFAULT_UI_LANGUAGE
  }
}

export function writeStoredUiLanguage(language: UiLanguage): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

export function nextUiLanguage(current: UiLanguage): UiLanguage {
  const index = UI_LANGUAGES.indexOf(current)
  return UI_LANGUAGES[(index + 1) % UI_LANGUAGES.length] ?? DEFAULT_UI_LANGUAGE
}
