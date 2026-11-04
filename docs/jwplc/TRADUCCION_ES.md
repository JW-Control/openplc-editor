# Traducción al español (JWPLC Edition)

La interfaz del editor sale en español por defecto. El idioma se cambia en
**Ver ▸ Idioma** (Español / English): la ventana se recarga y el menú nativo
se reconstruye en el idioma elegido. La elección se guarda en `localStorage`
(renderer) y en electron-store (`language`, proceso principal).

## Cómo se marca un texto

- `tr('Texto en inglés')` (`src/frontend/locales/tr.ts`): el inglés es la clave.
  Si falta la traducción se muestra el inglés, nunca una clave rota.
- Con datos: `tr('Saved to {{path}}.', { path })`.
- Con marcado dentro de la frase: `trRich('Sign in to {{device}}.', { device: <strong>{name}</strong> })`
  (`src/frontend/locales/tr-rich.ts`). La frase va completa, nunca en pedazos.
- Las traducciones viven en `src/frontend/locales/es/ui.json` (inglés → español).
- Los textos antiguos con claves (`menu:file.label`, `editorTools:…`) siguen en
  `locales/en/*.json` y su español en `locales/es/*.json`.
- No se traducen: `aria-label` internos, mensajes de commit, nombres IEC 61131
  (POU, LD, FBD, ST, IL, SFC, TON, VAR_IN_OUT…), ni las pantallas Serial,
  Network y Backplane del VPP (sus textos ya vienen en español desde platform-jwplc).

## Después de cada merge del upstream

```bash
npm run i18n:check              # resumen
npm run i18n:check -- --list    # qué falta traducir y textos nuevos escritos a mano
npm run i18n:check -- --strict  # falla si algún tr('…') no tiene traducción
```

1. Marcar con `tr()` los textos nuevos que lista «Candidatos».
2. Agregar su traducción a `es/ui.json` hasta que «sin traducir» sea 0.
3. Borrar de `ui.json` las entradas «sin uso».

## Glosario

| Inglés | Español |
| --- | --- |
| Backplane | Backplane |
| Board | Placa |
| Data type | Tipo de dato |
| Function block | Bloque de función |
| Library | Librería |
| Rung | Escalón |
| Runtime | Runtime |
| Slave ID | ID de esclavo |
| Slot | Slot |
| Branch / commit / stash | Rama / commit / stash |
| I/O | E/S |

## Estado

- Fase 1: infraestructura, menús, pantalla de inicio, diálogos y avisos (toasts).
- Fase 2: árbol del proyecto, variables y configuración del dispositivo.
- Fase 3: editores gráficos y de texto, diálogos del proceso principal
  (`src/backend/editor/utils/path-picker.ts`).
