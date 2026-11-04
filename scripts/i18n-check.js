#!/usr/bin/env node
/*
 * JWPLC Edition — revisión de la traducción al español.
 *
 *   npm run i18n:check            resumen
 *   npm run i18n:check -- --list  lista cada texto sin traducir y cada candidato
 *   npm run i18n:check -- --strict  sale con error si algún tr('...') no tiene traducción
 *
 * 1. Textos pasados a tr('...') que no están en src/frontend/locales/es/ui.json.
 * 2. Entradas de ui.json que ya nadie usa.
 * 3. Candidatos: textos en inglés escritos a mano en JSX (lo que trae cada merge del upstream).
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const UI_JSON = path.join(SRC, 'frontend/locales/es/ui.json')
const args = new Set(process.argv.slice(2))

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function unescape(raw, quote) {
  return raw.replace(new RegExp('\\\\' + quote, 'g'), quote).replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
}

const TR_CALL = /\btr(?:Rich)?\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g
const JSX_TEXT = /(?<![=\-])>\s*([A-Z][A-Za-z0-9 ,.'’?!:;()/-]*[a-z][A-Za-z0-9 ,.'’?!:;()/-]*)\s*</g
const ATTR_TEXT = /(?<![-\w])(?:placeholder|title|label|tooltip|description)=(?:'([A-Z][^'{}]*[a-z][^'{}]*)'|"([A-Z][^"{}]*[a-z][^"{}]*)")/g

const dictionary = JSON.parse(fs.readFileSync(UI_JSON, 'utf8'))
const used = new Map()
const candidates = []

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file)
  const text = fs.readFileSync(file, 'utf8')
  for (const m of text.matchAll(TR_CALL)) {
    const key = m[1] !== undefined ? unescape(m[1], "'") : m[2] !== undefined ? unescape(m[2], '"') : m[3]
    if (!used.has(key)) used.set(key, new Set())
    used.get(key).add(rel)
  }
  if (!rel.startsWith(path.join('src', 'frontend')) || !file.endsWith('.tsx')) continue
  const found = []
  for (const m of text.matchAll(JSX_TEXT)) found.push(m[1].trim())
  for (const m of text.matchAll(ATTR_TEXT)) found.push((m[1] ?? m[2]).trim())
  if (found.length > 0) candidates.push({ file: rel, texts: found })
}

const missing = [...used.keys()].filter((k) => !(k in dictionary) || dictionary[k] === '')
const unused = Object.keys(dictionary).filter((k) => !used.has(k))
const candidateCount = candidates.reduce((n, c) => n + c.texts.length, 0)
candidates.sort((a, b) => b.texts.length - a.texts.length)

console.log(`Textos con tr(): ${used.size} · traducidos: ${used.size - missing.length} · sin traducir: ${missing.length}`)
console.log(`Entradas de ui.json sin uso: ${unused.length}`)
console.log(`Candidatos en inglés escritos a mano: ${candidateCount} en ${candidates.length} archivos`)

if (args.has('--list')) {
  if (missing.length) {
    console.log('\n== Sin traducir (agregar a src/frontend/locales/es/ui.json)')
    for (const k of missing) console.log(`  ${JSON.stringify(k)}  ← ${[...used.get(k)].join(', ')}`)
  }
  if (unused.length) {
    console.log('\n== Sin uso en ui.json')
    for (const k of unused) console.log(`  ${JSON.stringify(k)}`)
  }
  console.log('\n== Candidatos por archivo')
  for (const c of candidates) console.log(`  ${c.file} (${c.texts.length}): ${c.texts.slice(0, 6).map((t) => JSON.stringify(t)).join(', ')}`)
} else if (candidates.length) {
  console.log('\nArchivos con más candidatos:')
  for (const c of candidates.slice(0, 15)) console.log(`  ${c.texts.length.toString().padStart(3)}  ${c.file}`)
}

if (args.has('--strict') && missing.length > 0) process.exit(1)
