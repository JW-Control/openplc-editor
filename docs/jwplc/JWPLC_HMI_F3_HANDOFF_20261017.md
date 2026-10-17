# Traspaso F3 · HMI Designer dentro de OpenPLC

Fecha: 2026-10-17 · Kenyi · **actualizado al cierre del día: F3 con commit, falta la prueba completa en la app**

## Dónde quedó

| Repo / rama | Estado |
|---|---|
| openplc-editor `develop/alpha14-openplc-hmi-v1` | F0..F0d con commit (último `729583c91`). **F3 sin commit** (archivos abajo). |
| platform-jwplc `v2.1.0-alpha.14-OpenPLC-HMI` | F0..F0d con commit (último `87258cad`, VPP 2.1.0-alpha.32). **Contrato sin commit**: `docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md`. |

Nada está con push.

## Qué está hecho en F3 (sin commit, typecheck limpio)

Contrato `jwplc-hmi-host/1` + `plcBinding` (doc de platform arriba, pendiente de
visto bueno del jefe y André).

Editor:

| Archivo | Qué hace |
|---|---|
| `src/backend/shared/compile/jwplc-hmi.ts` | Lee `plcBinding` de `hmi/JWPLC_HMI.jwhmi` (`extractJwhmiBindings`) y lo suma a `bindings.json`; advertencia si el `.jwhmi` es más nuevo que el header; exporta `imageSlot`. |
| `src/backend/shared/compile/jwplc-hmi-host.ts` (nuevo) | `collectHmiCandidates`, `describeHmiVariables` (respuesta de `listVariables`), `pickJwhmiToLoad`. |
| `src/backend/editor/compiler/compiler-module.ts` | Lee `JWPLC_HMI.jwhmi` y las fechas; publica `warnings`. |
| `src/main/modules/hmi-designer/index.ts` (nuevo) | Ventana del Designer: servidor local de sólo lectura en 127.0.0.1, IPC de `JWPLCHMINative` (escribe en `hmi/`) y `JWPLCHMIHost`, carga el `.jwhmi` al abrir. Busca el Designer en `JWPLC_HMI_DESIGNER_DIR` o en `../platform-jwplc/tools/jwplc-hmi-designer/poc`. |
| `src/main/modules/preload/hmi-designer-preload.ts` (nuevo) | Expone `JWPLCHMINative` y `JWPLCHMIHost`. |
| `configs/webpack/webpack.config.main.{dev,prod}.ts` | Entrada `hmi-designer-preload`. |
| `src/main/main.ts` | `hmiDesignerHost.register(ipcMain)`. |
| `src/main/modules/ipc/renderer.ts`, `middleware/shared/ports/device-port.ts`, `middleware/adapters/editor/device-adapter.ts` | `openHmiDesigner(args)` (canal `hmi-designer:open`). |
| `.../device/configuration/components/hmi-designer-launcher.tsx` (nuevo) + `board.tsx` | Sección "Pantalla HMI" con botón **Abrir HMI Designer** en la configuración del dispositivo (sólo placas con `hmiDisplay`). |

Los 61 tests de `jwplc-hmi.test.ts` siguen pasando.

## Qué falta (en orden)

1. **Tests** (exigen 100 % en `src/backend/shared` y `src/middleware/adapters/editor`):
   - `jwplc-hmi.test.ts`: `plcBinding` en campos y nodos de MENU, errores
     (JSON inválido, sin `fields`, sin `variable`, sin `var`, `access` malo,
     entradas `null`), duplicado entre `.jwhmi` y `bindings.json`, `.jwhmi` sin
     header, advertencia `jwhmiNewerThanHeader`.
   - `jwplc-hmi-host.test.ts` (nuevo): `collectHmiCandidates`,
     `describeHmiVariables` (enlazable R/RW, sin dirección, tipo de usuario,
     dirección inválida, tipo que no corresponde), `pickJwhmiToLoad`.
   - `device-adapter.test.ts`: `openHmiDesigner` llama a `window.bridge`.
   - Correr: `npx jest src/backend/shared/compile src/middleware/adapters/editor --coverage`,
     `npx eslint` y `npx prettier --check` sobre los archivos tocados, `npx tsc --noEmit`.
2. **Probar en la app** (`npm run dev`; el main y el preload se recompilan solos):
   - Proyecto `HMIProbe` → dispositivo → **Abrir HMI Designer**.
   - Debe abrirse el Designer con la pantalla F0c cargada (toma el único
     `.jwhmi` de `hmi/`), el botón del sketch en "Sketch: HMIProbe".
   - "Guardar" → crea `hmi/JWPLC_HMI.jwhmi`; "Actualizar HMI" → reescribe
     `hmi/JWPLC_HMI_Generated.h`.
   - Compilar y subir: la pantalla igual que en F0c (los enlaces siguen en
     `bindings.json` hasta que el Designer escriba `plcBinding`).
   - Revisar: segundo clic enfoca la ventana; cerrar el editor cierra el Designer.
3. **Commit** en el editor (feat F3) y del contrato en platform; actualizar
   `JWPLC_HMI_V1_OPENPLC.md` y el informe A14 con el resultado.
4. **Enviar el contrato** al jefe y a André para el visto bueno (A15-6 lo
   implementa André: selector "Variable PLC" con `JWPLCHMIHost.listVariables()`).
5. Después: Designer dentro del VPP firmado (hoy se toma de una carpeta local),
   pestaña en vez de ventana (F4), variables sin dirección (`openplc_debug_read`).

## Riesgos conocidos

- `JWPLCHMIProject.apply()` se llama por `executeJavaScript` al abrir; si André
  cambia ese API, ajustar `applySavedProject()`.
- El Designer pide confirmación al sobrescribir; el anfitrión de OpenPLC
  sobrescribe sin preguntar (definido así en el contrato).
- Sin el checkout de platform-jwplc al lado, hay que definir
  `JWPLC_HMI_DESIGNER_DIR` antes de `npm run dev`.

## Actualización (cierre del 2026-10-17)

Prueba de Kenyi en la app, primera versión de F3:

- abrir el Designer desde OpenPLC, editar y "Actualizar HMI": OK;
- se compila y corre en la placa;
- dos fallas: la pestaña Datos seguía pidiendo el nombre C++, y al reabrir
  salía la pantalla vieja porque sólo "Guardar" escribía el `.jwhmi`.

Corregido:

- Selector **Variable PLC** en la pestaña Datos: platform-jwplc
  `designer-openplc-host.js` (sólo se activa con `JWPLCHMIHost` en modo
  `openplc`) más un getter `selectedNode` en `designer-menu.js`.
- "Actualizar HMI" guarda también `JWPLC_HMI.jwhmi`; cerrar la ventana también lo guarda.
- Tests pendientes del punto 1: hechos (88 tests, 100 %).

Queda:

1. Probar en la app la cadena completa:
   1. abrir el Designer y elegir las variables en cada objeto;
   2. "Actualizar HMI";
   3. borrar `hmi/bindings.json`;
   4. compilar y subir;
   5. reabrir el Designer y confirmar que muestra la última pantalla.
2. Enviar el contrato y `designer-openplc-host.js` al jefe y a André. André
   decide si lo integra tal cual en A15-6 o lo reemplaza; el contrato se
   mantiene.
3. Después:
   - el Designer dentro del VPP firmado;
   - pestaña en lugar de ventana (F4);
   - variables sin dirección;
   - `EDIT_BOOL` en RW (necesita `%MX` en el runtime).
