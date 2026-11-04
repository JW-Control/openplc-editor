import { i18n } from '@root/frontend/locales/i18n'
import { DEFAULT_UI_LANGUAGE, isUiLanguage, type UiLanguage } from '@root/frontend/locales/language'
import { setTrLanguage } from '@root/frontend/locales/tr'

import { store } from './store'

/** UI language kept by the main process (electron-store), used by native menus and dialogs. */
export function readSavedUiLanguage(): UiLanguage {
  const saved: unknown = store.get('language')
  return isUiLanguage(saved) ? saved : DEFAULT_UI_LANGUAGE
}

export function saveUiLanguage(language: UiLanguage): void {
  store.set('language', language)
}

/** Switches the main-process i18n instance; resources are bundled, so this resolves at once. */
export function applyUiLanguage(language: UiLanguage): Promise<unknown> {
  setTrLanguage(language)
  return i18n.changeLanguage(language)
}
