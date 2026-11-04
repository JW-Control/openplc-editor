import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import * as en from './en'
import * as es from './es'
import { readStoredUiLanguage } from './language'

export const defaultNS = 'translation'
export const resources = { en, es } as const

void i18n.use(initReactI18next).init({
  lng: readStoredUiLanguage(),
  fallbackLng: 'en',
  ns: Object.keys(resources.en),
  defaultNS,
  resources,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
})

export { i18n }
