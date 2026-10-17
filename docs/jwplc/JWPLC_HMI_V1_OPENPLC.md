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
- El HAL del VPP alpha.30 lo incluye con `__has_include`:
  - `jwplcHMISetup()` al inicio de `hardwareInit()`;
  - `jwplcHMIBindingsSnapshot()` + `jwplcUIUpdate()` en
    `updateOutputBuffers()`, después de escribir las salidas.

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
| F0d | Medir el costo de `jwplcUIUpdate()` por scan (< 50 µs) |
| — | Variables sin dirección por `openplc_debug_read()` + `debug-map.json` |
| F3 | Abrir el Designer desde OpenPLC (ventana) y leer `plcBinding` del `.jwhmi` |
