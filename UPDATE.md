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

---

## Actualización — ronda 3: `ladder/block.tsx` sin auditar (mismo patrón, 4ta vez)

**Fecha:** 2026-09-19
**Rama:** `integration/jwplc-alpha7-alpha12-upstream`

### Resumen

Bug reportado: con un contador `CTU` en el diagrama y una señal marcada
`debug: true`, el usuario activó el ícono del depurador, lo **desactivó**
(`isDebuggerVisible = false`) y editó el `PV` del contador. Al hacer clic
fuera del campo volvió a aparecer:

```
Uncaught Error: Maximum update depth exceeded...
    at setRef ...
    at Array.map ...
```

con el componente señalado en el stack trace siendo `<ol>` dentro de
`ToastProvider`/`Toaster` — igual que en la ronda 1, el componente que
aparece en la traza es el que React estaba comitiendo en ese instante, no
necesariamente el culpable real (`Toaster` vive una sola vez en la raíz de
la app; no es del patrón "montado por fila/nodo").

### Causa raíz

La auditoría de las rondas 1 y 2 cubrió `ladder/variable.tsx`,
`ladder/coil.tsx`, `ladder/contact.tsx` y las celdas de tabla, pero **nunca
llegó a `ladder/block.tsx`** — el componente que renderiza cada bloque de
función (`CTU`, `TON`, `TOF`, etc.) en el canvas. Ese archivo exporta dos
componentes, ambos montados **una vez por bloque en el diagrama**:

- `BlockNodeElement` (el recuadro del bloque con su nombre)
- `Block` (el wrapper que usa React Flow como tipo de nodo)

Ambos llamaban `useOpenPLCStore()` **sin selector**, exactamente el patrón
de riesgo documentado en las rondas 1 y 2 — con el agravante de que aquí no
depende de `isDebuggerVisible`: el polling de valores de depuración
(`debugBoolValues`/`debugNonBoolValues`/`debugTick`, etc.) sigue
actualizando el store mientras una sesión de depuración/simulación esté
activa, **sin importar si el panel del depurador está visible o no**. Con
un `CTU` acumulando ediciones (`PV`, blur, `pushToHistory`, `updateNode`) al
mismo tiempo que cada tick de polling re-renderiza los dos componentes sin
selector, la ráfaga de actualizaciones dentro de un mismo commit de React
podía superar el límite de 50 actualizaciones anidadas — el mismo mecanismo
de las rondas 1 y 2, solo que en un archivo que quedó fuera del alcance de
esas auditorías.

### Cambios realizados

`src/frontend/components/_atoms/graphical-editor/ladder/block.tsx`:

- `BlockNodeElement`: `libraries`, `pous` y `ladderFlows` solo se usaban
  dentro de `handleNameInputOnBlur` (nunca durante el render), así que se
  sacaron de la suscripción reactiva y ahora se leen con
  `useOpenPLCStore.getState()` al inicio de ese handler. Las acciones
  (`updateModelVariables`, `setNodes`/`setEdges`/`setHandleBranches`,
  `updateVariable`/`deleteVariable`, `pushToHistory`) pasaron a selectores
  puntuales por namespace vía `useCallback` (referencias estables, no
  disparan re-render por sí solas).
- `Block`: `pous` y `ladderFlows` **sí** se leen durante el render (los usa
  `getLadderPouVariablesRungNodeAndEdges` directamente en el cuerpo del
  componente, no en un handler), así que se quedaron reactivos pero con
  selector propio (`useCallback((s) => s.project.data.pous, [])` /
  `useCallback((s) => s.ladderFlows, [])`) en vez de traer el store entero.
  `userLibraries`, `createVariable`, `pushToHistory` y las acciones de
  `ladderFlowActions` siguieron el mismo patrón de selector puntual.

### Verificación

- `npx tsc --noEmit`: sin errores.
- `npx eslint` sobre el archivo: 4 warnings de `exhaustive-deps`, confirmados
  como preexistentes (idénticos antes y después del cambio vía `git stash`).
- `npx prettier --check`: sin issues.
- `npm run build:renderer`: compila limpio.
- Pendiente: verificación manual del usuario reproduciendo el flujo exacto
  (depurador activado → desactivado → editar `PV` de un `CTU` con la señal
  de entrada marcada `debug: true` → clic afuera) para confirmar que ya no
  truena.

### Pendiente / a vigilar

Con esto ya se auditaron todos los componentes de canvas mencionados en las
rondas 1 y 2 (`variable`, `coil`, `contact`, `block`). Lo que sigue sin
auditar, tal como quedó anotado en la ronda 2:
- Componentes específicos de JWPLC (backplane, VPP, remote IO) que puedan
  montar `GenericComboboxCell`/`GenericTextareaCell` (Radix `DropdownMenu`
  por fila) en sus propias tablas.
- Cualquier otro componente montado por fila/nodo que llame
  `useOpenPLCStore()` sin selector — hay más de 100 en el proyecto; solo se
  auditan cuando además combinan un primitivo Radix que compone refs o un
  patrón de polling activo (como el de depuración) que no depende de
  visibilidad de UI.

Si vuelve a aparecer este error, revisar primero si el componente señalado
está montado por fila/nodo y si depende de un estado que cambia por
**polling** (no solo por interacción del usuario) — el polling de depuración
sigue corriendo con el panel oculto, así que "el depurador está cerrado" no
descarta este patrón.

### Seguimiento — el fix de `block.tsx` ayudó pero no fue la causa completa

**Fecha:** 2026-09-19

El usuario confirmó que, tras el fix de arriba, el flujo reportado tardó
**mucho más tiempo** en volver a reproducirse (antes tronaba casi de
inmediato; esta vez después de varios minutos de uso activo, varios ciclos
de depurador ON/OFF/compilar, y finalmente editando el tiempo de otro
contador). El stack trace del segundo crash es prácticamente idéntico al
primero (`setRef` dentro de `Array.map` anidado dos veces, mismo componente
`<ol>` de `ToastProvider`/`Toaster` en la traza de componentes).

Esto indica que el fix de `block.tsx` fue una mejora real (redujo la
frecuencia de re-renders innecesarios) pero **no la causa completa** — debe
quedar al menos un componente más con el mismo patrón (montado por
fila/nodo + suscripción sin selector + posiblemente un primitivo Radix) que
no se identificó con certeza vía análisis estático del bundle minificado
(el nombre de archivo/componente real no sobrevive en `renderer.dev.js`,
solo nombres de función internos de Radix como `setRef`).

Se investigaron y descartaron como culpables directos (ya usan selectores
correctos o no tienen primitivos Radix con composición de refs):
`ladder/handle.tsx`, `use-debug-value.ts`, `use-debug-composite-key.ts`,
`use-runtime-polling.ts`, `_features/.../elements/ladder/coil|contact/index.tsx`
(modales, pero montados una sola vez por editor, no por nodo),
`_molecules/graphical-editor/ladder/rung/header.tsx`, `use-toast.tsx`,
`utils/toast.ts`.

Se aplicó preventivamente el mismo fix a `fbd/block.tsx` (`BlockNodeElement`
y `Block`), que tenía el patrón idéntico (incluyendo una suscripción extra a
`project` completo) — el equivalente FBD de `ladder/block.tsx`, nunca
auditado tampoco.

#### Red de seguridad: Error Boundary

Dado que esta es la 4ta vez que aparece esta familia de bug pese a 3 rondas
de fixes dirigidos, se agregó `src/frontend/components/_atoms/error-boundary/index.tsx`
— un React error boundary de clase (React solo soporta esto vía
`componentDidCatch`/`getDerivedStateFromError`, no hay equivalente con
hooks) — montado en `app-layout.tsx` envolviendo únicamente `{children}`
(el contenido de `StartScreen`/`WorkspaceScreen`). `Toaster`, el stack de
modales y `AcceleratorHandler` quedan **fuera** del boundary a propósito,
para que sigan funcionando aunque el workspace truene.

Esto no corrige la causa raíz restante, pero convierte un crash total (app
congelada, hay que matar el proceso) en una pantalla recuperable con botón
de "Reload" — el estado del proyecto vive en Zustand fuera de React, así
que no se pierde con el crash de un subárbol.

#### Pendiente real

La causa raíz completa sigue sin confirmarse con certeza. Si vuelve a
aparecer:
1. Abrir DevTools con "Pause on exceptions" activado antes de reproducir, o
   usar el profiler de React DevTools grabando durante la reproducción —
   esto da nombres de componente reales en vez de offsets del bundle.
2. Con el Error Boundary ahora en su lugar, el mensaje de error completo
   queda en la consola (`[ErrorBoundary] Caught render crash:`) con el
   component stack — copiar ese log completo es más útil que la captura de
   pantalla del overlay de React, que trunca la traza.

### Cierre — verificación extendida del usuario, sin reproducir

**Fecha:** 2026-09-19

Sesión de verificación manual extensa: edición de bloques → compilar →
depurador ON → depurador OFF → volver a editar → compilar → depurador ON de
nuevo, repetido varias veces, incluyendo agregar elementos nuevos al
diagrama entre ciclos. El crash **no volvió a reproducirse** en ningún
punto de la sesión.

Con el fix de `ladder/block.tsx` (causa principal, confirmada por el salto
de "tronaba casi de inmediato" a "tardó varios minutos") más el fix
preventivo de `fbd/block.tsx` (mismo patrón, nunca auditado), el caso
reportado queda resuelto para el flujo probado. El Error Boundary
(`_atoms/error-boundary`) queda en su lugar como red de seguridad
permanente — no se retira aunque el bug puntual esté cerrado, porque cubre
cualquier otra instancia futura de esta misma familia de crash (hay >100
usos de `useOpenPLCStore()` sin selector en el proyecto sin auditar, según
quedó anotado arriba).

**Estado:** Cerrado para este flujo. Sigue en pie la nota de la ronda 2/3:
si reaparece `Maximum update depth exceeded`, buscar primero un componente
montado por fila/nodo con una suscripción al store sin selector cerca de un
primitivo Radix o de un estado que cambia por polling.

---

## Actualización — ronda 4: causa real encontrada — `ladder/autocomplete/index.tsx`

**Fecha:** 2026-09-19
**Rama:** `integration/jwplc-alpha7-alpha12-upstream`

### Resumen

El "cierre" de arriba fue prematuro. El usuario reprodujo el crash de nuevo,
esta vez con un repro **100% directo y no-flaky**, sin depurador de por
medio: proyecto nuevo → colocar una bobina → hacer clic en el campo de
nombre → **seleccionar una variable del autocompletado** → crash inmediato.

Este repro, al ser instantáneo y determinístico (a diferencia de los de las
rondas 1-3, que necesitaban minutos de uso acumulado), apuntó directo al
componente correcto.

### Causa raíz

`VariablesBlockAutoComplete`
(`src/frontend/components/_atoms/graphical-editor/ladder/autocomplete/index.tsx`)
— el dropdown de autocompletado que se monta **cada vez que se abre el
campo de nombre de una bobina, contacto, variable o bloque** — llamaba
`useOpenPLCStore()` **sin selector**. Es el mismo patrón de siempre, pero
esta vez en el componente que genera el propio evento que dispara el
crash: al seleccionar un ítem, `submit()` → `submitVariableToBlock()` →
`updateNode(...)` escribe en el store, y en el mismo instante el dropdown
se cierra (`onBeforeSubmit` + `setIsOpen(false)` internos) — una ráfaga de
varias actualizaciones de estado mientras el propio componente (con
`pous`/`libraries`/`dataTypes` inestables en cada render) recalculaba
`autocompleteItems` con arrays/objetos nuevos en cada pasada, alimentando
referencias distintas al dropdown hijo (`GraphicalEditorAutocomplete`, que
renderiza cada ítem con su propio ref para navegación con flechas) en cada
uno de esos renders encadenados.

A diferencia de las rondas 1-3 (que dependían de acumulación de elementos
en el canvas + polling de depuración durante varios minutos), este
componente se re-renderiza así **cada vez que se abre cualquier campo de
nombre en el Ladder**, por lo que el repro es inmediato — es probablemente
la causa dominante detrás de todas las reproducciones anteriores también,
no solo un contribuyente más.

### Cambios realizados

`src/frontend/components/_atoms/graphical-editor/ladder/autocomplete/index.tsx`:
- `pous`, `dataTypes`, `globalVariables` (antes `configurations.resource
  ?.globalVariables`), `librariesSystem` (antes `libraries.system`): se
  usan durante el render (en `autocompleteItems`/`allVariables`), así que
  se quedaron reactivos pero con selector propio vía `useCallback`.
- `createVariable`, `updateNode`: acciones, seleccionadas por namespace.
- `ladderFlows`: solo se usaba dentro de los handlers de submit
  (`submitVariableToBlock`, `submitAddVariable`), nunca en el render, así
  que se saca de la suscripción reactiva y se lee con
  `useOpenPLCStore.getState()` al inicio de cada handler.

Se aplicó preventivamente el mismo fix a
`src/frontend/components/_atoms/graphical-editor/fbd/autocomplete/index.tsx`
(`FBDBlockAutoComplete`), el equivalente exacto para FBD, con el mismo
patrón (`pous`/`fbdFlows` sin selector, usados en render).

### Verificación

- `npx tsc --noEmit`: sin errores.
- `npx eslint` sobre ambos archivos: sin errores nuevos (1 warning
  preexistente de `exhaustive-deps` en el archivo de ladder, confirmado
  idéntico antes/después vía `git stash`).
- `npx prettier --check`: sin issues tras `--write`.
- `npm run build:renderer`: compila limpio.
- Pendiente: verificación manual del usuario con el repro exacto (bobina
  nueva → seleccionar variable del autocompletado) para confirmar cierre.

### Nota para el futuro

Cuando un crash de esta familia es **intermitente y depende de minutos de
uso acumulado**, el culpable dominante puede seguir sin encontrarse aunque
varios componentes contribuyentes ya se hayan arreglado — un fix que solo
"alarga el tiempo para reproducir" es una señal de que se arregló *un*
contribuyente, no *el* contribuyente. El repro más útil para este tipo de
bug es el que un usuario puede disparar **de forma inmediata y
determinística** desde un estado limpio (proyecto nuevo, sin pasos previos
acumulados) — vale la pena pedir explícitamente ese tipo de repro antes de
dar el caso por cerrado.

### Pendiente sin resolver — repro de "eliminar + recrear bobina con mismo nombre"

**Fecha:** 2026-09-19

Después del fix de la ronda 4, el usuario reprodujo `Maximum update depth
exceeded` **una vez más**, con un flujo distinto: depurador activado →
desactivado → eliminar una bobina ("lampara") → colocar una bobina nueva en
el mismo lugar → escribir el mismo nombre ("lampara") → crash. Vuelto a
correr el mismo flujo después, **no se reprodujo** (intermitente).

No se investigó a fondo — el usuario pidió posponerlo para atender primero
el bug de las líneas de la gráfica del depurador (documentado abajo), y
pidió que se reporte aquí para retomarlo si vuelve a aparecer. Pistas para
la próxima vez:
- El nombre reutilizado sugiere revisar el flujo de `submitAddVariable` en
  `ladder/autocomplete/index.tsx` cuando el nombre tecleado **ya existe**
  como declaración de variable (la bobina vieja se borra del canvas pero no
  necesariamente borra la variable declarada) — en ese caso `submit()` debería
  tomar la rama de "variable existente" (`submitVariableToBlock`) en vez de
  `submitAddVariable`, pero vale la pena confirmar que efectivamente pasa así
  y no hay una ventana donde ambas ramas compiten.
- Pedir al usuario capturar el texto completo del overlay de webpack-dev-server
  (fondo negro con franja roja "Error N of M") en vez de solo la consola —
  ese overlay trae stack traces con *source maps* (nombres de archivo reales),
  a diferencia de `renderer.dev.js:NNNNN` de la consola normal. Ya se probó
  una vez en esta sesión (ver más abajo) y fue la única forma de encontrar la
  causa raíz real de otro bug de esta misma sesión.

---

## Feature: Console/Debugger acoplable a la derecha (además de abajo)

**Fecha:** 2026-09-19
**Rama:** `integration/jwplc-alpha7-alpha12-upstream`

### Resumen

Pedido: poder mover el panel de Console/Debugger de su posición original
(pegado abajo del editor, solo se agranda verticalmente) a un panel a la
derecha del editor, de ancho completo, para aprovechar mejor la pantalla al
depurar (mantener el Ladder visible a la vez que se ve el debugger). Debía
poder alternarse manualmente con un ícono, y arrancar por defecto a la
derecha (con la posición elegida persistiendo entre sesiones).

### Archivos nuevos

- `src/frontend/hooks/use-console-dock-position.ts` — hook con estado
  `'bottom' | 'right'`, persistido en `localStorage` (mismo patrón que
  `useCanvasZoom` para el nivel de zoom — es una preferencia de layout por
  usuario, no estado de proyecto, así que no va en el store de Zustand).
  Por defecto `'right'` si no hay preferencia guardada todavía; una vez que
  el usuario la cambia manualmente, esa elección persiste y gana siempre.
- `src/frontend/components/_atoms/buttons/console/dock-toggle.tsx` — botón
  con ícono (`PanelRight`/`PanelBottom` de `lucide-react`) para alternar.

### Cambios en `src/frontend/screens/workspace-screen.tsx`

- El JSX de las pestañas Console/Debugger/Search/PLC-Logs (antes duplicado
  si se hubiera necesitado en dos lugares) se extrajo a una constante
  `consolePanelTabs` una sola vez, y se renderiza condicionalmente en dos
  ubicaciones posibles: anidado dentro del `ResizablePanelGroup` vertical del
  editor (dock abajo, layout original) o como panel hermano de ancho
  completo dentro del `ResizablePanelGroup` horizontal principal (dock
  derecha, junto al panel de chat de IA).
- Dentro del tab de Debugger, el split Variables/Debugger cambia de
  horizontal a vertical (apilado) cuando está acoplado a la derecha, porque
  ese panel es más angosto que el ancho completo de abajo.
- **Bug encontrado y arreglado en el camino:** el botón de toggle quedaba
  tapado por los botones de "Filters"/"Clear console" en la pestaña Console,
  porque ambos usaban `position: absolute` en la misma esquina. Se sacaron
  del posicionamiento absoluto y se unificaron en una sola fila flex normal.
- **Segundo bug encontrado:** con el panel acoplado a la derecha angosto, esa
  misma fila desbordaba el contenedor y el botón de toggle quedaba
  recortado/invisible sin agrandar la ventana. Causa: `Tabs.List` tenía un
  ancho fijo `w-64` (256px) sin importar cuántas pestañas hubiera realmente
  visibles. Se cambió a ancho automático (`w-auto`) y se agregó `flex-wrap`
  como respaldo, para que el grupo de botones baje de línea en vez de
  recortarse si aun así no cabe.
- **Bug de layout (el más serio, ver sección de abajo):** al agregar el panel
  derecho no se le restó espacio al panel del editor (`workspacePanel`),
  causando que los tamaños de los paneles sumaran más de 100% del ancho —
  ver "Ronda 5" más abajo, fue la causa real de un crash de ApexCharts.

### Verificación

- `npx tsc --noEmit`, `npx eslint`, `npx prettier --check`: limpios en cada
  ronda de cambios.
- `npm run build:renderer`: compila limpio.
- Verificación manual del usuario en `npm run dev`: confirmó que el ícono de
  dock funciona, que el panel derecho se ve completo (tras el fix de layout
  de la ronda 5), y que la posición por defecto es a la derecha en un
  perfil sin preferencia guardada.

### Estado

Cerrado. Ver la ronda 5 (abajo) para el bug de layout de paneles que este
feature introdujo y que afectó al debugger.

---

## Ronda 5: gráficas del depurador — curva, ejes, crash de ApexCharts y layout

**Fecha:** 2026-09-19
**Rama:** `integration/jwplc-alpha7-alpha12-upstream`
**Archivo principal:** `src/frontend/components/_molecules/charts/line-chart.tsx`
(usa `react-apexcharts` / `apexcharts`)

Esta ronda encadenó varios pedidos y bugs relacionados con las gráficas de
`main:VARIABLE` del panel Debugger. Se documenta todo en orden porque las
correcciones intermedias importan para no repetir los mismos callejones sin
salida.

### 1. Pedido inicial: el `CV` de un contador sube en curva, pero baja en escalón con el reset

El valor de un contador (`CV`, entero, cambia una vez por ciclo de escaneo)
se dibujaba con `stroke.curve: 'smooth'` (spline/bezier) para toda serie no
booleana, mientras que las booleanas usaban `'stepline'`. Una curva suave
implica valores intermedios interpolados que nunca existieron (p. ej. el
`CV` "pasando" por 2.3, 2.7 entre ticks) — no representa lo que realmente
pasa con una señal de PLC.

**Fix:** `stroke.curve: 'stepline'` para **todas** las series, booleanas o
numéricas — un valor de PLC es una función escalón por naturaleza (un
salto por ciclo de escaneo), nunca una curva continua. Confirmado por el
usuario como correcto y no se volvió a tocar en el resto de la ronda.

### 2. Pedido: las líneas de cuadrícula (0/2/4 vs 0/2/4/6) deberían "ajustarse" mejor, y en BOOL no se alinean con TRUE/FALSE

Para BOOL, el eje Y tenía `min: -0.2, max: 1.2, tickAmount: 2` — con ese
rango con relleno, las líneas de cuadrícula caían en -0.2/0.5/1.2, **nunca**
exactamente en 0 o 1, así que ninguna línea coincidía visualmente con los
tramos planos TRUE/FALSE de la señal.

**Fix real, el único que sobrevivió:** `min: 0, max: 1` (sin relleno) para
BOOL — deja `tickAmount: 2` **sin tocar** (ver más abajo por qué). Las
líneas ahora caen exactamente en 0 y 1.

**Intentos que se probaron y se revirtieron** (documentados para no
repetirlos):
- `forceNiceScale: true` + `min: 0` para series numéricas, para que
  ApexCharts elija un intervalo "bonito" según el máximo real de los datos.
  **Revertido** — ver punto 3 abajo, esto causó un crash real.
- `tickAmount: 1` para BOOL (en vez de 2), para tener solo 2 líneas exactas
  en vez de 3 (con una línea extra sin etiqueta en 0.5). **Revertido** —
  sospechoso de la misma familia de crash que el punto 3 (con un solo
  intervalo, el cálculo interno de ancho de etiquetas de ApexCharts
  probablemente asume ≥2 intervalos); no vale el riesgo por una línea
  cosmética de más.

### 3. Crash real #1: `forceNiceScale` + `min` en series numéricas rompía ApexCharts con datos vacíos

Al hacer clic en "observar variable" en el depurador, el componente de la
gráfica se monta **antes** de que llegue el primer dato del polling
(`data: []`). Forzar `min: 0` + `forceNiceScale: true` en ese estado sin
datos rompía el cálculo interno de dimensiones de ApexCharts:

```
Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'left')
    at DimXAxis.getxAxisLabelsCoords
    at Dimensions.setDimensionsForAxisCharts
    at Dimensions.plotCoords
    at ApexCharts.create / ApexCharts.update
```

**Intento 1 (insuficiente):** condicionar `min`/`forceNiceScale` a
`data.length > 0` (`hasData`). Redujo el crash al momento en que **llegaba
el primer dato real** (la opción cambiaba "en caliente" sobre una instancia
de ApexCharts ya montada), no lo eliminó — el mismo tipo de error volvía a
aparecer, solo que más tarde. **Revertido también.**

**Conclusión:** cambiar `yaxis.min`/`max`/`forceNiceScale` dinámicamente
entre renders de una gráfica ya montada es en sí mismo riesgoso para esta
versión de ApexCharts, independientemente de si hay datos o no. Se volvió
al comportamiento original de auto-escala de ApexCharts para series
numéricas (`min`/`max`/`tickAmount` en `undefined`, tal como estaba antes
de esta ronda) y no se tocó más.

### 4. Crash real #2 (la causa raíz de verdad) — `grid.padding: undefined`

El crash **seguía** apareciendo incluso después de revertir todo lo
anterior. Se leyó el código fuente real de la librería
(`node_modules/apexcharts/src/modules/dimensions/Dimensions.js`, no el
bundle minificado) para encontrar la causa con certeza en vez de seguir
probando a ciegas:

```js
// Dimensions.js
this.gridPad = this.w.config.grid.padding
// ...usado sin verificar más abajo (Dimensions.js y XAxis.js):
this.gridPad.left / .right / .top / .bottom
```

Como parte del fix del punto 2, se había agregado
`grid.padding: isBool ? { top: 8, bottom: 8 } : undefined` (para dar
respiro visual a la línea plana de BOOL sin usar relleno de valores). Para
**toda serie numérica**, eso mandaba literalmente `padding: undefined` en
las opciones — y el merge de opciones de ApexCharts no lo reemplaza por su
objeto por defecto, deja `w.config.grid.padding` en `undefined` de verdad.
Cualquier lectura posterior de `.left` explota exactamente con el error
reportado. **Esta era la causa raíz real desde el primer reporte del
crash en esta ronda** — nunca fue el `yaxis`.

**Fix:** se quitó `grid.padding` por completo (ni se setea ni se pasa
`undefined` condicionalmente — la clave no existe en el objeto), dejando
que ApexCharts use su propio valor por defecto interno, que nunca es
`undefined`.

**Cómo se encontró de verdad:** leyendo el archivo fuente
`node_modules/apexcharts/src/modules/dimensions/{Dimensions,XAxis}.js` en
vez de seguir infiriendo desde el stack trace minificado
(`renderer.dev.js:NNNNN`) — grep por el nombre del método del stack trace
(`getxAxisLabelsCoords`) en `node_modules/apexcharts/src` lleva directo a
la línea real. **Para la próxima vez que un stack trace de una librería de
terceros no dé suficiente información: buscar el método por nombre dentro
de `node_modules/<paquete>/src` (si el paquete publica su fuente) en vez de
seguir adivinando sobre el bundle minificado.**

### 5. Crash contribuyente: suma de tamaños de panel > 100%

Aparte del bug de ApexCharts, el feature de dock-derecha (sección anterior)
no le restaba espacio al panel del editor al agregar el panel de consola
derecho: Explorer (16%) + editor (68%) + consola-derecha (30%) = **114%**
del ancho total — lo que disparaba el propio warning de
`react-resizable-panels` ("Invalid layout total size... Layout
normalization will be applied") visible en la consola justo antes del
crash. Esa renormalización en caliente probablemente dejaba el contenedor
de la gráfica con un ancho inestable justo cuando ApexCharts intentaba
medirlo — un contribuyente real, aunque el punto 4 era la causa que de
verdad lanzaba la excepción.

**Fix:**
- `workspacePanel` usa `defaultSize={isConsoleDockedRight ? 54 : 68}` (deja
  espacio para el 30% del panel derecho).
- Se agregó `key={isConsoleDockedRight ? 'dock-right' : 'dock-bottom'}` al
  `ResizablePanelGroup` principal, para forzar un remount limpio (con los
  `defaultSize` correctos) cada vez que se alterna la posición del dock en
  caliente — `defaultSize` en `react-resizable-panels` solo se aplica en el
  primer montaje de un panel, cambiarlo después no re-dispara el layout.

Nota: el panel de chat de IA (`chatPanel`, `defaultSize={30}`) tiene el
mismo problema potencial de presupuesto de porcentaje si se abre junto con
el dock-derecha del debugger (16+54+30+30=130%) — no se corrigió en esta
ronda por estar fuera del alcance del bug reportado; queda anotado para el
futuro.

### 6. Pedido final: el trazo "tiembla" justo en el salto de una transición

Con `chart.animations: { enabled: true, easing: 'linear', dynamicAnimation:
{ speed: 500 } }`, cada punto nuevo se animaba con easing durante 500ms
mientras la ventana de tiempo del eje X también se desliza en tiempo real
(llega un dato nuevo cada 100ms) — la animación y el desplazamiento de
ventana se pisaban justo en el instante del salto, dando un efecto de
"temblor"/desplazamiento visible en vez de un trazo tipo osciloscopio.

**Fix:** `chart.animations: { enabled: false }`. Sin riesgo de dimensiones
como los puntos 3-4 (es una propiedad de animación, no de layout).

### Verificación

- `npx tsc --noEmit`, `npx eslint`, `npx prettier --check`: limpios después
  de cada cambio de esta ronda (varios, ver arriba).
- `npm run build:renderer`: compila limpio después de cada cambio.
- Verificación manual del usuario en `npm run dev`, en orden: curva en
  escalón confirmada OK → crash de ApexCharts reproducido 3 veces con
  distintos intentos de fix → crash resuelto tras el fix de `grid.padding`
  + el fix de layout de paneles → temblor de animación confirmado y
  resuelto.

### Estado

Cerrado — confirmado por el usuario tras el fix de `grid.padding` +
layout de paneles + animaciones desactivadas. `line-chart.tsx` queda así:
`stroke.curve: 'stepline'` siempre, `yaxis.min/max` en `0`/`1` solo para
BOOL (`tickAmount: 2`, sin tocar), sin `grid.padding`, sin
`forceNiceScale`, animaciones desactivadas.

### Notas para el futuro

- **No pasar `undefined` explícito como valor de una propiedad de
  ApexCharts que sea un objeto** (`grid.padding`, y por extensión cualquier
  otra sub-config de objeto). El merge de opciones de esta librería no
  trata "clave presente con valor `undefined`" igual que "clave ausente" —
  lo primero puede pisar el valor por defecto interno con `undefined` real
  y romper código que lo usa sin verificar. Para propiedades *primitivas*
  (`min`, `max`, `tickAmount`) sí es seguro (el código original ya lo hacía
  así desde antes de esta ronda, sin problema) — el riesgo es específico de
  props con forma de objeto.
- **No cambiar `yaxis.min`/`max`/`forceNiceScale` dinámicamente** entre
  renders de una instancia de ApexCharts ya montada (p. ej. condicionado a
  si ya hay datos) — vimos que eso solo *retrasa* el mismo crash al momento
  de la transición, no lo evita. Si un valor de eje necesita ser diferente
  según el estado, que sea fijo desde el primer render (como quedó el `min`
  de BOOL, que depende de `isBool`, un prop que no cambia después del
  primer valor recibido en la práctica).
- **Antes de asumir una causa desde un stack trace minificado
  (`renderer.dev.js:NNNNN`), revisar si el paquete de terceros publica su
  código fuente en `node_modules/<paquete>/src`** y buscar ahí el nombre
  del método — mucho más rápido y certero que iterar por prueba y error
  sobre el bundle.
- Al agregar un nuevo panel a un `ResizablePanelGroup` existente,
  recalcular el `defaultSize` de los paneles hermanos para que la suma siga
  dando ~100%, y considerar si hace falta una `key` para forzar un remount
  limpio cuando el panel se agrega/quita en caliente en vez de solo al
  montar la app.
