# JWPLC HMI v1 en OpenPLC

Fecha: 2026-10-17 · rama `develop/alpha14-openplc-hmi-v1` (desde `develop/alpha12-backplane-closure`)
Plan: [JWPLC_HMI_PLAN_INDUSTRIAL.md](JWPLC_HMI_PLAN_INDUSTRIAL.md) · gate de la plataforma:
`platform-jwplc/docs/v2.1.0-alpha.14/A14_HMI_V1_OPENPLC_20261017.md`

```text
REQUIERE_VPP=jwplc-basic-openplc 2.1.0-alpha.30 (capabilities.hmiDisplay en el maestro)
REQUIERE_PACKAGE=jwplc_local -> platform-jwplc rama v2.1.0-alpha.14-OpenPLC-HMI
TESTS=jwplc-hmi.test.ts 30/30, 100 % cobertura; suites de compilación 20/20 (393 tests)
F0_BOOL_RELE_PHYSICAL=PASS (2026-10-17)
F0B_VALUES_PHYSICAL=PASS (2026-10-17)
F0C_WRITE_PHYSICAL=PASS (2026-10-17, MENU Limite <-> %MW1)
```

## Qué hace

La pantalla del JWPLC Basic (maestro) se diseña en **JWPLC HMI Designer** y viaja
con el proyecto OpenPLC. Al compilar, el editor la incluye en el firmware y conecta
sus variables con las del programa. Para cambiar la pantalla basta con volver a
exportar el header y compilar; no hace falta firmar un VPP nuevo.

```text
Proyecto/
  project.json, pous/, devices/
  hmi/
    JWPLC_HMI_Generated.h   exportado por el Designer (no editar a mano)
    bindings.json           qué variable PLC alimenta cada variable del HMI
```

## `hmi/bindings.json`

```json
{
  "format": "JWPLC_HMI_BINDINGS",
  "version": 1,
  "bindings": [
    { "hmi": "rele_q0_0", "plc": "RELE" }
  ]
}
```

- `hmi`: nombre de la variable en `JWPLC_HMI_Generated.h` (el campo "Variable"
  del inspector del Designer).
- `plc`: nombre de una variable **global** o de un **programa instanciado**
  (sin distinguir mayúsculas), o una dirección directa (`"%QX0.0"`). Si la
  variable usa un alias del mapeo de E/S, se usa la dirección que resuelve el
  alias al compilar.

Este archivo es provisional: cuando el Designer guarde `plcBinding` en el
`.jwhmi` (tarea A15-6 de Alpha15), el enlace se elegirá desde el Designer.

## Alcance de la v1

| HMI | PLC | Dirección | Buffer del runtime |
| --- | --- | --- | --- |
| `bool` (BOOL) | BOOL | `%IX`, `%QX` | `bool_input`, `bool_output` |
| `float` (VALUE, BAR) | INT, UINT, WORD | `%IW`, `%QW`, `%MW` | `int_input`, `int_output`, `int_memory` |
| `float` (VALUE, BAR) | DINT, UDINT, DWORD, REAL | `%MD` | `dint_memory` |
| `float` (VALUE, BAR) | REAL | `%ID`, `%QD` | `real_input`, `real_output` |

Con dirección directa (`"plc": "%MW0"`) se asume INT para `%xW`, DINT para
`%MD` y REAL para `%ID`/`%QD`. Rango de memoria del runtime ESP32: `%MW0..19`,
`%MD0..19` (se comprueba con `static_assert`).

`int32_t` (EDIT_NUM entero del MENU) se admite igual que `float`.

Escritura HMI → PLC (F0c): `{ "hmi": "limite", "plc": "LIMITE", "access": "RW" }`.
Sólo sobre memoria `%MW` / `%MD`. La pantalla escribe cuando su variable cambia
respecto de una copia sombra (el MENU sólo la cambia al confirmar con OK); el
valor se redondea y se limita al rango del tipo IEC, y el programa lo ve en el
scan siguiente. Si el PLC cambia el valor (programa, Modbus, debugger), la
pantalla lo muestra. Al arrancar manda el PLC; un forzado del debugger gana.

No admitido todavía (error de compilación): TEXT (`char[]`), `%MX`, `%xL`,
variables sin dirección, `RW` sobre `%I`/`%Q`, `RW` de variables `bool`.

Los errores frenan la compilación con un mensaje que nombra la variable y el
motivo (P5 del plan: fallos visibles).

## Cómo funciona por dentro

- `src/backend/shared/compile/jwplc-hmi.ts` (puro, probado al 100 %):
  - `hasHmiDisplay(boardEntry)`: lee `capabilities.hmiDisplay` del VPP;
  - `generateJwplcHmi({ header, bindingsJson, projectData })`: valida y devuelve
    los archivos del bundle y los mensajes para la consola.
- `compiler-module.ts`, antes de `runCompilePipeline`: si la placa tiene
  `hmiDisplay` (y no es runtime v4 ni simulador), lee `hmi/` del proyecto y agrega
  al bundle, junto al HAL:
  - `src/JWPLC_HMI_Generated.h` (copia);
  - `src/jwplc_hmi.h`: `JWPLC_HMI_ENABLED 0/1`, `#include` del header y
    `jwplcHMIBindingsSnapshot()`.
- `jwplc_hmi.h` se escribe siempre (con `0` si no hay pantalla), para que un
  header viejo en `build/` no reactive la HMI.
- El HAL del VPP lo incluye con `__has_include`:
  - `jwplcHMISetup()` al inicio de `hardwareInit()`;
  - `jwplcHMIBindingsSnapshot()` en `updateOutputBuffers()`, después de
    escribir las salidas. Hasta alpha.31 también llamaba `jwplcUIUpdate()`
    (≈ 167 µs por scan, F0d-2). Desde alpha.32 esa función sólo la llama la
    tarea del Display en cada refresco de USER.

Ejemplo de `jwplc_hmi.h` generado:

```cpp
#pragma once
#define JWPLC_HMI_ENABLED 1

#include "JWPLC_HMI_Generated.h"

static_assert(0 < (MAX_DIGITAL_OUTPUT / 8), "HMI: %QX0.0 (RELE) fuera del buffer del runtime");

static inline void jwplcHMIBindingsSnapshot()
{
    // rele_q0_0 <- RELE (%QX0.0)
    if (bool_output[0][0] != NULL) rele_q0_0 = (*bool_output[0][0] != 0);
}
```

## Prueba en placa (pendiente)

1. Editor de esta rama (`npm start`) e instalar
   `jwplc-basic-openplc-2.1.0-alpha.30.jwcontrol-signed.vpp`.
2. Dispositivo **JWPLC BASIC [2.0.0]**, *Package Source* = **Local Development**.
3. Programa ladder: `PULSADOR AT %IX0.0 : BOOL`, `RELE AT %QX0.0 : BOOL`,
   `──[ PULSADOR ]──( RELE )──`.
4. Copiar a `hmi/` del proyecto `JWPLC_HMI_Generated.h` y `bindings.json` desde
   `platform-jwplc/tools/jwplc-hmi-designer/gates/A15_F0_OpenPLC_Bool_Rele/`.
5. Compilar y subir. En la consola:
   `HMI: pantalla del proyecto incluida (hmi/JWPLC_HMI_Generated.h).` y
   `HMI: rele_q0_0 <- RELE (%QX0.0)`.
6. En la placa (pasos F0-1..F0-7 del gate):
   - arranca en la IDLE;
   - cualquier tecla abre la página;
   - I0_0 conmuta el relé y el campo pasa de OFF (rojo) a ON (verde) sin parpadeo;
   - ESC vuelve a la IDLE;
   - el debugger sigue funcionando.

## Siguientes pasos

| Paso | Qué |
| --- | --- |
| F0b | VALUE/BAR ← `%MW`/`%MD`: implementado; falta la prueba en placa (gate `A14_F0b_OpenPLC_Valores`). TEXT de estado pendiente |
| F0c | Escritura HMI → PLC sobre `%MW`/`%MD`: PASS en placa (gate `A14_F0c_OpenPLC_Escritura`) |
| F0d | Costo de la HMI en el scan: PASS desde VPP alpha.32 (5–15 µs); abierto el retraso del scan al cambiar de página (≤ 65 ms), del runtime de pantalla del package |
| — | Variables sin dirección por `openplc_debug_read()` + `debug-map.json` |
| F3 | Abrir el Designer desde OpenPLC y enlazar eligiendo la variable PLC: implementado (ver abajo); prueba completa en la app pendiente |

## F3: el Designer dentro de OpenPLC (2026-10-17)

Contrato: `platform-jwplc/docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md`.

Uso:

1. Dispositivo **JWPLC BASIC [2.0.0]** → sección **Pantalla HMI** → **Abrir HMI
   Designer**. Se abre en su propia ventana, ya vinculado a la carpeta `hmi/`
   del proyecto ("Sketch: <proyecto>"), y carga `hmi/JWPLC_HMI.jwhmi` (o el
   único `.jwhmi` que haya en `hmi/`).
2. Pestaña **Datos** de cada objeto (BOOL, VALUE, BAR y nodos del MENU): el
   selector **Variable PLC** muestra las variables del programa. Las que no se
   pueden enlazar aparecen deshabilitadas con el motivo (sin dirección, tipo
   de usuario, sólo lectura, tipo no compatible). Al elegir una:
   - el nombre C++ se genera solo (ya no se escribe);
   - se guarda `plcBinding` en el objeto;
   - en el MENU, `EDIT_NUM` sólo ofrece variables con escritura (`%MW`/`%MD`)
     y ajusta el tipo (`int32` para enteros, `float` para REAL).
3. **Actualizar HMI** escribe `hmi/JWPLC_HMI_Generated.h` **y** guarda
   `hmi/JWPLC_HMI.jwhmi`. Al cerrar la ventana también se guarda el `.jwhmi`.
4. Compilar: los enlaces salen de `plcBinding`; `hmi/bindings.json` ya no hace
   falta. **Si se re-enlaza un proyecto viejo desde el Designer, borrar
   `hmi/bindings.json`**: los nombres C++ cambian (p. ej. `rele_q0_0` → `rele`)
   y el archivo viejo daría error.

Dónde está el Designer: variable de entorno `JWPLC_HMI_DESIGNER_DIR`, o el
checkout vecino `../platform-jwplc/tools/jwplc-hmi-designer/poc` (rama
`v2.1.0-alpha.14-OpenPLC-HMI`, que trae `designer-openplc-host.js`).

Implementación:

| Pieza | Archivo |
| --- | --- |
| Ventana, servidor local de sólo lectura, IPC del contrato, guardado | `src/main/modules/hmi-designer/index.ts` |
| Preload (`JWPLCHMINative`, `JWPLCHMIHost`) | `src/main/modules/preload/hmi-designer-preload.ts` |
| Lista de variables (`collectHmiCandidates`, `describeHmiVariables`) | `src/backend/shared/compile/jwplc-hmi-host.ts` |
| `plcBinding` al compilar | `src/backend/shared/compile/jwplc-hmi.ts` (`extractJwhmiBindings`) |
| Botón | `.../device/configuration/components/hmi-designer-launcher.tsx` |
| Selector "Variable PLC" en el Designer | platform-jwplc `tools/jwplc-hmi-designer/poc/designer-openplc-host.js` |

Verificación: 88 tests (100 % en `jwplc-hmi.ts`, `jwplc-hmi-host.ts` y
`device-adapter.ts`), `tsc` sin errores. Selector probado en el Designer real
con un anfitrión simulado (Chromium sin interfaz): BOOL ← RELE y MENU Limite
<-> LIMITE quedan con `plcBinding` en el proyecto guardado.

## Estado al 24/10/2026

- F0, F0b, F0c y F0d (costo de la HMI) PASS en placa.
- F3 implementado; falta probar la cadena completa.
- Próximo trabajo:
  - traer el Designer integrado (`v2.1.0-alpha.14/feature/hmi-designer`);
  - ampliar el anfitrión (`src/main/modules/hmi-designer`) al puente nuevo del
    Designer, de unas 20 funciones.
- Traspaso completo: platform-jwplc
  `docs/v2.1.0-alpha.14/JWPLC_NEW_CHAT_START_ALPHA14_OPENPLC_20261024.md`.
