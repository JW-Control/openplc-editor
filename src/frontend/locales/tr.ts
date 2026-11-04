import uiEs from './es/ui.json'
import { readStoredUiLanguage, type UiLanguage } from './language'

/**
 * Translation tables keyed by the English source text. English needs no table:
 * a missing entry shows the source text, so untranslated UI stays readable.
 */
const UI_TEXT: Record<UiLanguage, Readonly<Record<string, string>>> = { es: uiEs, en: {} }

export type TrValues = Readonly<Record<string, string | number>>

/** Fills `{{name}}` placeholders; unknown placeholders are left as they are. */
export function interpolate(text: string, values?: TrValues): string {
  if (!values) return text
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  )
}

// Read once at load: module-level constants call tr() before i18next finishes init.
let activeLanguage: UiLanguage = readStoredUiLanguage()

export function currentUiLanguage(): UiLanguage {
  return activeLanguage
}

/** Main process only: it has no localStorage and gets the language from electron-store. */
export function setTrLanguage(language: UiLanguage): void {
  activeLanguage = language
}

/**
 * Translates an English UI text into the current language.
 * Example: tr with 'Save project', or 'Pin {{pin}} is busy' plus { pin: 3 }.
 */
/** The translated text, or the English source when there is no translation. */
export function lookup(text: string): string {
  const translated = UI_TEXT[currentUiLanguage()][text]
  return translated !== undefined && translated !== '' ? translated : text
}

export function tr(text: string, values?: TrValues): string {
  return interpolate(lookup(text), values)
}
