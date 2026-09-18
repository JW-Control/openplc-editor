# Update — Resolución de "Maximum update depth exceeded" en edición de bloques

**Fecha:** 2026-09-16 a 2026-09-18
**Rama:** `feature/alpha12-upstream-backports`
**Commits:** `659d5e9af`, `ff3b45a7f`, `4c48abfa6`, + este cierre

## Resumen

Bug reportado: al editar valores de bloques de función en el editor Ladder
(`PV` de un contador `CTU`, `PT` de un temporizador `TON`/`TOF`) y hacer clic
fuera del campo, la aplicación se colgaba con:

```
Uncaught Error: Maximum update depth exceeded. This can happen when a
component repeatedly calls setState inside componentWillUpdate or
componentDidUpdate. React limits the number of nested updates to prevent
infinite loops.
```

El bug era intermitente y cambiaba de "ubicación aparente" en cada
reproducción (a veces un `<Select>`, a veces el `Toaster`, a veces la tabla
de variables), lo que en un principio sugería componentes distintos rotos.
La causa raíz real era **una sola familia de problemas repetida en varios
lugares**: componentes de Radix UI (`Select`, `Popover`, `DropdownMenu`,
`Toast`) montados **una vez por cada fila** de una tabla, dentro de
componentes que se suscribían al store de Zustand **sin selector** — lo que
los re-renderizaba en cualquier cambio de estado de la app, no solo en los
cambios que realmente les importaban.

## Causa raíz (explicada de una vez)

`@radix-ui/react-popper` (usado internamente por `Select`, `Popover`,
`DropdownMenu` y `Toast`) tiene este patrón en su código:

```js
// PopperAnchor
React.useEffect(() => {
  context.onAnchorChange(virtualRef?.current || ref.current)
}) // sin arreglo de dependencias — corre en CADA render
```

Esto es seguro *si* el componente se re-renderiza con poca frecuencia. Pero
varios componentes en este proyecto:

1. Se montan **una vez por fila** de una tabla (celdas de tipo, clase,
   nombre, ubicación en `variables-table`, `task-table`, `instances-table`,
   `global-variables-table`).
2. Llamaban `useOpenPLCStore()` **sin selector** — lo que en Zustand
   significa "re-renderízame en cualquier cambio del store, sin importar
   cuál", incluyendo campos como `ladderFlows`/`fbdFlows` que cambian en
   **cada tecla** que se escribe en cualquier canvas Ladder/FBD abierto.

Con pocas filas esto no se nota. Pero como la arquitectura del editor es
"multi-mount" (cada pestaña de POU abierta mantiene su propio editor de
variables vivo en el DOM, aunque no se esté viendo), y como el proyecto de
prueba fue acumulando variables y bloques a lo largo de la sesión, cada
edición terminaba disparando un re-render simultáneo de **todas** las filas
de **todas** las tablas de variables abiertas — cada una reconectando sus
refs de Radix al mismo tiempo. Eventualmente esa ráfaga superaba el límite
de 50 actualizaciones anidadas de React, y el componente que aparecía en el
stack trace del crash era simplemente el que React estaba procesando en ese
instante (de ahí que pareciera "cambiar de lugar").

## Cambios realizados

### 1. `ladder/variable.tsx` — condición de carrera en el efecto de sincronización
El efecto que sincroniza el texto del pin con el valor guardado tenía
`openAutocomplete`/`variableValue` en su arreglo de dependencias, pese a que
el propio comentario del código advertía que no debían estar ahí (para
evitar que cerrar el autocompletado antes del blur sobreescribiera el valor
recién tecleado). Se restauraron las dependencias correctas.

También se corrigieron dos imports faltantes (`Popover` en
`ladder/variable.tsx`, `Label` en `fbd/variable.tsx`) que habrían causado un
crash aparte (`ReferenceError`) al usar el menú de depuración.

### 2. Radix `Select` → `<select>` nativo en celdas por fila
Reemplazado en:
- `variables-table/selectable-cell.tsx` (columna "Class")
- `global-variables-table/selectable-cell.tsx`
- `task-table/selectable-cell.tsx`
- `instances-table/selectable-cell.tsx`
- `variables-editor/index.tsx` (selectores "Class Filter" y "Return type")

Estos eran selectores simples de opciones fijas; no necesitaban las
funciones avanzadas de Radix, así que se quitó el primitivo por completo en
vez de intentar parchear su comportamiento.

### 3. `use-toast.tsx` — bug conocido de la plantilla shadcn/ui
El hook `useToast()` reregistraba su listener en el arreglo global
`listeners` en **cada notificación** (dependencia `[state]` en vez de `[]`),
en vez de una sola vez al montar. Como `useToast()` se llama una vez por
fila en varias tablas, cualquier `toast()` en cualquier parte de la app
provocaba un ciclo de desregistro/registro en N componentes a la vez.

### 4. Suscripciones al store sin selector → `useShallow` / selectores puntuales
En `variables-editor/index.tsx`, `variables-table/index.tsx` y
`variables-table/editable-cell.tsx`:
- Se reemplazaron las llamadas `useOpenPLCStore()` sin selector por
  `useOpenPLCStore(useShallow((s) => ({...})))`, extrayendo solo los campos
  realmente usados.
- **`ladderFlows`/`fbdFlows`** se sacaron de la suscripción reactiva en
  `EditableNameCell` y en `VariablesEditor`: solo se usaban dentro de
  manejadores de eventos (`onBlur`, `commitCode`), nunca durante el render,
  así que ahora se leen con `useOpenPLCStore.getState()` justo donde se
  necesitan.

### 5. Memoización a nivel de fila
- `VariablesTable` envuelto en `React.memo` (con `handleRowClick`
  estabilizado vía `useCallback`), para que un re-render de `VariablesEditor`
  causado por otra pestaña no se propague a la tabla si sus props no
  cambiaron.
- Las 7 celdas por fila (`EditableNameCell`, `EditableInitialValueCell`,
  `EditableLocationCell`, `EditableDocumentationCell`, `SelectableTypeCell`,
  `SelectableClassCell`, `SelectableDebugCell`) envueltas en `React.memo` con
  un comparador que verifica si **el objeto de esa fila específica** cambió
  (por referencia, aprovechando el compartido estructural de Immer) antes de
  volver a renderizar — así editar la fila 3 ya no fuerza a las demás filas
  a reconectar sus refs de Radix.

## Archivos modificados

```
CLAUDE.md
src/frontend/components/_atoms/graphical-editor/autocomplete/index.tsx
src/frontend/components/_atoms/graphical-editor/fbd/block.tsx
src/frontend/components/_atoms/graphical-editor/fbd/variable.tsx
src/frontend/components/_atoms/graphical-editor/ladder/block.tsx
src/frontend/components/_atoms/graphical-editor/ladder/variable.tsx
src/frontend/components/_atoms/highlighted-textarea/index.tsx
src/frontend/components/_atoms/location-warning-glyph/index.tsx
src/frontend/components/_features/[app]/toast/use-toast.tsx
src/frontend/components/_features/[workspace]/build-options/index.tsx
src/frontend/components/_molecules/workspace-activity-bar/tooltip-button.tsx
src/frontend/components/_molecules/global-variables-table/selectable-cell.tsx
src/frontend/components/_molecules/instances-table/selectable-cell.tsx
src/frontend/components/_molecules/task-table/selectable-cell.tsx
src/frontend/components/_molecules/variables-table/editable-cell.tsx
src/frontend/components/_molecules/variables-table/index.tsx
src/frontend/components/_molecules/variables-table/selectable-cell.tsx
src/frontend/components/_organisms/variables-editor/index.tsx
```

## Verificación

- `npx tsc --noEmit` sobre todo el proyecto: sin errores, en cada ronda de
  cambios.
- `npx eslint` sobre cada archivo tocado: sin errores nuevos (solo 2
  warnings preexistentes de `exhaustive-deps` sin relación).
- Suite de tests de `utils/toast.ts` (20 tests): pasa sin cambios.
- Verificación manual en `npm run dev`: edición repetida de bloques
  (contador, temporizador), con variables acumuladas y varias pestañas
  abiertas, sin reproducir el crash tras las correcciones.

## Estado

Resuelto para el flujo reportado. La sección "Handover Notes for Next
Developer (Pending Issues)" en `CLAUDE.md` (añadida en un intento anterior
de solución) queda obsoleta con este cierre — el crash que describía ya fue
diagnosticado y corregido de raíz.

## Notas para el futuro

- Si aparece un nuevo caso de `Maximum update depth exceeded`, revisar
  primero si el componente señalado en el stack trace es Radix UI
  (`setRef` en la traza es la firma característica) y si se monta por fila
  en alguna tabla — es probable que sea el mismo patrón.
- Al agregar una nueva celda de tabla o un nuevo panel "por POU", preferir
  `useOpenPLCStore(useShallow((s) => ({...})))` sobre `useOpenPLCStore()`
  sin selector, y evitar suscribirse a `ladderFlows`/`fbdFlows` a menos que
  el valor se use directamente en el render.

---

## Actualización — ronda 2: mismo patrón en el canvas Ladder/FBD

**Fecha:** 2026-09-18
**Rama:** `integration/jwplc-alpha7-alpha12-upstream` (creada al juntar
`feature/alpha12-upstream-backports` con `develop/alpha7-openplc-remote-io-rtu`
— esta última ya era ancestro directo de la primera, así que el merge fue un
no-op; el crash de esta sección ya existía en `feature/alpha12-upstream-backports`
antes de la integración, solo que no se había reproducido todavía)
**Commits:** pendiente de commitear en el momento de escribir esto

### Resumen

El cierre de la ronda 1 (arriba) cubrió las tablas de variables, pero el
mismo crash volvió a aparecer editando el `PV` de un contador `CTU` **en el
canvas Ladder**, con el ícono del depurador activado (sin necesitar que el
simulador estuviera corriendo — basta con que `isDebuggerVisible` sea
`true`) y tras varios minutos con múltiples contactos/bobinas/bloques
acumulados en el diagrama.

### Causa raíz

La misma familia de la ronda 1, pero en los componentes que se montan **una
vez por cada elemento del canvas** (no por fila de tabla):

- `useOpenPLCStore()` sin selector, incluyendo `project` completo y
  `ladderFlows`/`fbdFlows` (cambian en cada tecla escrita en cualquier
  canvas abierto).
- Un `Popover.Root` de Radix para el menú "Force value/true/false" del
  depurador (`ladder/variable.tsx`, `ladder/coil.tsx`, `ladder/contact.tsx`,
  `fbd/variable.tsx`), que queda montado en cuanto se hizo click una vez
  sobre ese elemento con `isDebuggerVisible === true` — no hace falta estar
  simulando activamente.

Con varios elementos acumulados en el diagrama, cualquier edición (el `PV`
del contador) re-renderiza todos ellos a la vez por la suscripción sin
selector; los que tenían el `Popover` montado por una interacción previa del
depurador disparan el mismo loop de refs de Radix que en la ronda 1.

De paso se encontraron y corrigieron dos celdas "Type" (dropdown de Radix
por fila, idéntico patrón al de la ronda 1) que habían quedado sin el fix
en `global-variables-table` y en la tabla de miembros de `data-types` de
tipo estructura — la ronda 1 solo tocó `variables-table`.

### Archivos modificados (ronda 2)

```
src/frontend/components/_atoms/graphical-editor/ladder/variable.tsx
src/frontend/components/_atoms/graphical-editor/ladder/coil.tsx
src/frontend/components/_atoms/graphical-editor/ladder/contact.tsx
src/frontend/components/_atoms/graphical-editor/fbd/variable.tsx
src/frontend/components/_molecules/variables-table/selectable-cell.tsx
src/frontend/components/_molecules/global-variables-table/selectable-cell.tsx
src/frontend/components/_molecules/data-types/structure/table/selectable-cell.tsx
```

En cada uno: `useOpenPLCStore()` sin selector → `useOpenPLCStore(useShallow((s) => ({...})))`
con solo los campos usados en render/efectos; `ladderFlows`/`fbdFlows`
sacados de la suscripción reactiva cuando solo se usaban dentro de
handlers (`onBlur`, `onFocus`, submit) y leídos con
`useOpenPLCStore.getState()` en el momento de uso.

### Verificación

- `npx tsc --noEmit`: sin errores.
- `npx eslint` sobre los 7 archivos: sin errores (2 warnings preexistentes
  de `exhaustive-deps` no relacionados, sin cambios).
- Verificación manual del usuario en `npm run dev`: sesión de ~20 minutos
  (11:17 / 11:25 / 11:35) editando bloques con el depurador seleccionado,
  sin reproducir el crash.

### Pendiente / a vigilar

La suscripción `useOpenPLCStore()` **sin selector** dentro de un componente
que se monta **por fila o por nodo de canvas** es el patrón de riesgo. Hay
más de 100 archivos en el proyecto que llaman `useOpenPLCStore()` sin
selector; solo se auditaron y corrigieron los que además combinan un
componente Radix que compone refs (`Popover`, `DropdownMenu`, `Select`,
`Tooltip`) — la combinación exacta que produce este crash. No se auditaron:
- `instances-table/selectable-cell.tsx`, `task-table/selectable-cell.tsx`
  (usan `<select>` nativo, no Radix — menor riesgo pero no nulo).
- Componentes específicos de JWPLC (backplane, VPP, remote IO) que puedan
  usar `GenericComboboxCell`/`GenericTextareaCell` (Radix `DropdownMenu`
  por dentro) montados por fila en sus propias tablas — no se revisaron en
  esta ronda porque no formaban parte de la reproducción reportada.

Si vuelve a aparecer `Maximum update depth exceeded` con la firma `setRef`
+ `Array.map` anidado, buscar un componente Radix montado por elemento
(fila de tabla o nodo de canvas) con una suscripción al store sin selector
cerca — es la tercera vez que es exactamente esto.
