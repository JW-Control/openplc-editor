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

---

## Actualización — Zoom en Ladder y en el editor Monaco (ST/IL/Python/C++)

**Fecha:** 2026-09-18 a 2026-09-19
**Rama:** `integration/jwplc-alpha7-alpha12-upstream`
**Commits:** `3b5169032` (primera versión, con el fix de corrupción de
posiciones ya incluido) + cambios sin commitear al cierre de esta ronda
(rango 25%-125% en pasos de 5%, control movible, fix del warning de
`preventDefault` en listener pasivo)

### Resumen

Pedido original: la pantalla del editor (Ladder y "cualquier otro lenguaje")
se quedaba a tamaño fijo, sin forma de hacer zoom para ver mejor el código.
Se agregó zoom a Ladder y al editor Monaco compartido (ST/IL/Python/C++),
con persistencia, atajos de teclado, Ctrl+Scroll y un control flotante
movible con `%`/`+`/`-`.

El camino hasta la versión final pasó por **dos enfoques que se probaron y
se descartaron por romper cosas reales** — quedan documentados acá para no
repetirlos.

### Intento 1: CSS `zoom` en un contenedor ancestro

Envolver el editor completo en un `<div style={{ zoom: nivel }}>`. Funcionó
bien a simple vista, pero en Ladder las conexiones (líneas entre contactos,
bobinas y bloques) aparecían distorsionadas/desalineadas, sobre todo al
saltar directo a un nivel con Ctrl+0.

**Causa:** cada rung del Ladder es su propio `ReactFlow` (`@xyflow/react`),
que mide el tamaño de sus nodos/handles con `ResizeObserver` para anclar las
conexiones. La propiedad CSS `zoom` (a diferencia de `transform`) cambia el
tamaño de **layout** real de los elementos, así que esas mediciones quedaban
escaladas por el factor de zoom vigente en el momento de medir — las
conexiones terminaban ancladas a posiciones equivocadas.

### Intento 2: CSS `transform: scale()` en un contenedor ancestro

`transform` no cambia el tamaño de layout (solo la pintura visual), así que
resolvía el problema del intento 1 — y de hecho al principio se veía
perfecto. Pero tras varias pasadas de scroll/zoom, las conexiones volvían a
distorsionarse, y esta vez **de forma permanente** (ni bajando el zoom ni
reseteando a 100% se arreglaba).

**Causa, más seria que la del intento 1:** los contactos/bobinas/bloques de
un rung se pueden arrastrar (`nodesDraggable: true`). React Flow calcula la
posición de destino de un arrastre convirtiendo la posición del puntero a
coordenadas de flujo usando **únicamente su propio `viewport.zoom`** — no
tiene forma de enterarse de que un ancestro tiene un `transform: scale()`
aplicado. Si el usuario arrastraba (o rozaba sin querer) un nodo mientras el
zoom externo era distinto de 1, la posición calculada quedaba mal por el
factor de escala, y esa posición **se guardaba tal cual en los datos del
proyecto** — corrompiendo la posición real del nodo de forma permanente, no
solo su renderizado. Por eso no se arreglaba solo: el dato ya estaba mal.

**Conclusión:** ninguna propiedad CSS de escala en un ancestro es segura
para envolver un canvas de `@xyflow/react` con nodos arrastrables. Hay que
alimentar el nivel de zoom al mecanismo de zoom **propio** de la librería.

### Solución final

`src/frontend/hooks/use-canvas-zoom.ts` — hook compartido: nivel de zoom
(rango configurable, por defecto 25%-125% en pasos de 5%), persistencia en
`localStorage`, atajos Ctrl +/-/0 (activos solo con el mouse sobre el
editor), y un listener de rueda nativo.

- **Ladder** (`_molecules/graphical-editor/ladder/rung/body.tsx`): el
  `zoomLevel` se aplica vía `reactFlowInstance.setViewport({ x: 0, y: 0,
  zoom: zoomLevel }, { duration: 0 })` — el mecanismo de zoom nativo de
  React Flow, el mismo que FBD ya usaba de fábrica. Así el cálculo de
  arrastre, los handles y las conexiones siempre coinciden con lo que se ve
  en pantalla, sin importar cuántas veces se cambie el zoom.
- **Monaco** (`_features/[workspace]/editor/monaco/index.tsx`): en vez de
  la opción nativa `mouseWheelZoom` de Monaco (que es un singleton **global
  a toda la página**, compartido por todos los editores Monaco abiertos, sin
  rango ni paso configurables), se escala `fontSize` directamente
  (`BASE_FONT_SIZE * zoomLevel`).
- `_atoms/graphical-editor/zoom-controls/index.tsx` — control flotante
  `-`/`%`/`+`, **movible** arrastrándolo desde el ícono `⠿` (para poder
  sacarlo de encima de otros controles, como el botón "Create new rung" del
  Ladder, que quedaba tapado con la posición fija original).

### Ajuste de rango: Monaco tiene un piso de fuente de 6px

Monaco clampea `fontSize` a un mínimo de 6px **internamente**
(`EditorFloatOption.clamp(fontSize, 6, 100)` en su propio
`editorOptions.js`, no hay forma de configurarlo). Con una base de 12px,
6px es exactamente el 50%. Esto significa que todo el rango 25%-45%
(3px a 5.4px) se redondeaba igual al piso de 6px — visualmente "pegado",
sin cambiar. No es un bug propio, es un límite de la librería. Se resolvió
agregando un parámetro opcional `{ min, max, step }` a `useCanvasZoom`, y
llamándolo para Monaco con `{ min: 0.5 }` (Ladder se queda en el 25% por
defecto, porque ahí el límite lo controla nuestro propio código).

### Warning de consola: `Unable to preventDefault inside passive event listener invocation`

Aparecía al usar Ctrl+Scroll (pero no al usar los botones `+`/`-`).

**Causa:** React registra los props sintéticos `onWheel`/`onWheelCapture`
siempre como listeners **pasivos** (comportamiento de todo el framework, por
rendimiento del scroll) — un listener pasivo no puede cancelar el
comportamiento por defecto del navegador, así que `event.preventDefault()`
dentro de uno es un no-op silencioso que además loguea ese warning.

**Fix:** `useCanvasZoom` ya no expone un handler de rueda como prop de JSX;
en su lugar devuelve un `containerRef` que el consumidor asigna al mismo
elemento (`ref={(node) => { containerRef.current = node }}` — un
`MutableRefObject<HTMLElement>` no es asignable directamente a un
`Ref<HTMLDivElement>`, de ahí el callback), y el hook agrega el listener de
rueda él mismo vía `addEventListener('wheel', handler, { passive: false,
capture: true })`. La fase de captura además garantiza que el zoom se
intercepta **antes** de que el widget interno (por ejemplo, el manejo de
scroll propio de Monaco) llegue a ver el evento.

### Archivos modificados

```
CLAUDE.md
src/frontend/hooks/use-canvas-zoom.ts
src/frontend/components/_atoms/graphical-editor/zoom-controls/index.tsx
src/frontend/components/_molecules/graphical-editor/ladder/rung/body.tsx
src/frontend/components/_organisms/graphical-editor/ladder/rung/index.tsx
src/frontend/components/_features/[workspace]/editor/graphical/ladder/index.tsx
src/frontend/components/_features/[workspace]/editor/monaco/index.tsx
src/frontend/components/_organisms/variables-code-editor/index.tsx        (mouseWheelZoom nativo, sin cambios en esta ronda)
src/frontend/components/_features/[workspace]/editor/library-manifest/index.tsx (idem)
src/frontend/components/_features/[workspace]/editor/diff-viewer/file-diff-view.tsx (idem)
```

Los últimos tres solo tienen `mouseWheelZoom: true` (el zoom nativo simple
de Monaco, sin el control flotante ni el rango 25%-125%) — no formaban
parte del pedido específico de esta corrección, se dejaron con el
comportamiento simple porque no tenían el mismo problema de distorsión.

### Verificación

- `npx tsc --noEmit` sobre todo el proyecto: sin errores, en cada ronda de
  cambios.
- `npx eslint` sobre cada archivo tocado: sin errores nuevos (solo
  warnings preexistentes de `exhaustive-deps` sin relación).
- `npx prettier --check`: sin issues tras `--write`.
- `npm run build:renderer`: compila limpio en cada ronda.
- Verificación manual del usuario en `npm run dev`: confirmó que las
  conexiones del Ladder ya no se distorsionan tras varias pasadas de
  zoom/scroll, que el control es movible, que el zoom de Monaco ahora
  cambia visiblemente desde 50% (antes 25%-50% se veía igual), y que ya no
  aparece el warning de `preventDefault` en consola al usar Ctrl+Scroll.

### Estado

Cerrado. El zoom queda disponible en Ladder (25%-125%, paso 5%, vía el
viewport nativo de React Flow) y en el editor Monaco compartido (50%-125%,
paso 5%, vía `fontSize`), con control flotante movible y persistencia por
`localStorage`.

### Notas para el futuro

- Nunca envolver un canvas de `@xyflow/react` con nodos arrastrables en un
  ancestro con `zoom` o `transform: scale()` — ver "Intento 1" y "Intento 2"
  arriba. Alimentar el zoom al `viewport`/`setViewport` propio de la
  instancia.
- Si se necesita zoom con rango/paso propio en un widget de terceros,
  revisar primero si ese widget tiene su propio límite interno (como el
  piso de 6px de Monaco) antes de asumir que el rango pedido se puede
  aplicar tal cual.
- Para interceptar Ctrl+Scroll (o cualquier gesto que necesite
  `preventDefault()`) sobre un widget que maneja su propio scroll (Monaco,
  cualquier canvas), no usar `onWheel`/`onWheelCapture` de React — son
  pasivos por defecto. Usar un `ref` + `addEventListener('wheel', ..., {
  passive: false })` manual, como en `useCanvasZoom`.
