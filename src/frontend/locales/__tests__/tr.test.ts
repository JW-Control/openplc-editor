import { isValidElement } from 'react'

import uiEs from '../es/ui.json'
import { isUiLanguage, nextUiLanguage, readStoredUiLanguage, writeStoredUiLanguage } from '../language'
import { currentUiLanguage, interpolate, setTrLanguage, tr } from '../tr'
import { trRich } from '../tr-rich'

describe('UI language', () => {
  afterEach(() => setTrLanguage('en'))

  it('runs the unit tests in English', () => {
    expect(readStoredUiLanguage()).toBe('en')
    expect(currentUiLanguage()).toBe('en')
  })

  it('recognises only the offered languages', () => {
    expect(isUiLanguage('es')).toBe(true)
    expect(isUiLanguage('en')).toBe(true)
    expect(isUiLanguage('fr')).toBe(false)
    expect(isUiLanguage(undefined)).toBe(false)
  })

  it('cycles between Spanish and English', () => {
    expect(nextUiLanguage('es')).toBe('en')
    expect(nextUiLanguage('en')).toBe('es')
  })

  it('stores the choice in localStorage', () => {
    writeStoredUiLanguage('es')
    expect(localStorage.getItem('language')).toBe('es')
    localStorage.removeItem('language')
  })

  it('falls back to Spanish when nothing is forced or stored', () => {
    const forced = process.env.OPENPLC_UI_LANGUAGE
    delete process.env.OPENPLC_UI_LANGUAGE
    localStorage.removeItem('language')
    try {
      expect(readStoredUiLanguage()).toBe('es')
      localStorage.setItem('language', 'en')
      expect(readStoredUiLanguage()).toBe('en')
    } finally {
      localStorage.removeItem('language')
      process.env.OPENPLC_UI_LANGUAGE = forced
    }
  })
})

describe('tr', () => {
  afterEach(() => setTrLanguage('en'))

  it('returns the English source in English', () => {
    expect(tr('Cancel')).toBe('Cancel')
  })

  it('translates into Spanish', () => {
    setTrLanguage('es')
    expect(tr('Cancel')).toBe('Cancelar')
  })

  it('shows the English source when a translation is missing', () => {
    setTrLanguage('es')
    expect(tr('A text nobody translated')).toBe('A text nobody translated')
  })

  it('fills placeholders in the translated text', () => {
    setTrLanguage('es')
    expect(tr('Saved to {{path}}.', { path: 'C:/plc' })).toBe('Guardado en C:/plc.')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('{{a}} and {{b}}', { a: 1 })).toBe('1 and {{b}}')
    expect(interpolate('no values')).toBe('no values')
  })
})

describe('trRich', () => {
  afterEach(() => setTrLanguage('en'))

  it('puts the given nodes where the placeholders are', () => {
    setTrLanguage('es')
    const parts = trRich('Open the {{tab}} tab and import the XML files there.', { tab: 'Repositorio' })
    expect(parts).toHaveLength(3)
    expect(parts.every((part) => isValidElement(part))).toBe(true)
    const texts = parts.map((part) => (isValidElement<{ children: unknown }>(part) ? part.props.children : part))
    expect(texts).toEqual(['Abre la pestaña ', 'Repositorio', ' e importa ahí los archivos XML.'])
  })
})

describe('es/ui.json', () => {
  it('has a non-empty translation for every entry and keeps every placeholder', () => {
    for (const [source, translated] of Object.entries(uiEs)) {
      expect(translated).not.toBe('')
      const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort()
      expect({ source, placeholders: placeholders(translated) }).toEqual({ source, placeholders: placeholders(source) })
    }
  })
})
