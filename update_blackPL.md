# Update — JWPLC Backplane (Alpha12)

**Fecha:** 2026-09-23 (actualizado 2026-10-06)
**Alcance:** OpenPLC Engineering Closure. Bus RS-485 del Backplane configurable, Remote I/O multi-slot, validación del Slave ID y esclavo Remote I/O programable desde OpenPLC.

**Estado al 2026-10-06:** funcional y **validado en banco** sobre la Alpha12 publicada (VPP 2.1.0-alpha.26). Un maestro JWPLC Basic con Backplane comanda un esclavo JWPLC Basic programado **íntegramente desde OpenPLC**, sin Arduino IDE, con el debugger por USB activo. Estado de cierre, pendientes y temas a consultar con el responsable en **§9**.

---

## 1. Ramas y bases

| Repo | Rama | Base |
|---|---|---|
| `JW-Control/openplc-editor` | `develop/alpha12-backplane-closure` | `integration/jwplc-alpha7-alpha12-upstream` @ `db3d05506` |
| `JW-Control/platform-jwplc` | `v2.1.0-alpha.12/feature/openplc-engineering-closure` | `main` @ `aa0bfed1` (Alpha12 publicada; antes `release/v2.1.x` @ `165f94fb`, alpha11) |

```text
EDITOR_VERSION=4.2.8-jwplc.2 (bump a 4.2.8-jwplc.3 al cierre)
STRUCPP_VERSION=v0.5.13
VPP_VERSION_BEFORE=2.1.0-alpha.19
VPP_VERSION_AFTER=2.1.0-alpha.26   (versión vigente; historial en §7)
VPP_KEY_ID=jwcontrol-2026
VPP_SHA256=0992c24cfc6b416d30dd0011aecf617a8d449d25cb145e2fd836bb3503c78918
PLATFORM_CORE=jwplc:esp32 2.1.0-alpha.12 (requerido desde VPP alpha.25)
```

---

## 2. Cambios en openplc-editor

| Commit | Cambio |
|---|---|
| `b955e4920` | Merge de `2faf717e4` (source freeze Alpha9). Trae la identidad por slot del Backplane (`defaultFromSlot`, `uniqueAcrossSlots`), las librerías Arduino limitadas al VPP, los pines por defecto del VPP y las carpetas de proyecto. Ese commit faltaba en la rama de integración. |
| `3f986a602` | Tests de `installArduinoLib` actualizados al flag `includeLegacyGlobalLibraries`. |
| `3cec56401` | `validateModuleConfigValues()`: la compilación **se detiene** si un Slave ID está fuera de rango, no es entero o está duplicado. Además `encodeModuleConfig` respeta `defaultFromSlot`. |
| `cdb133375` | La UI del Backplane muestra junto al campo el error de valor fuera de rango. |
| `6b2c31350` | Preset "JWPLC Basic Remote I/O" de Remote Devices oculto. El Backplane queda como única fuente de verdad. |
| `353d4c325` / `3b8733e52` | Formato del test y `docs/jwplc/alpha12/SOURCE_FREEZE.md`. |

**No integrado:** `75272a4fb` (`develop/jwplc-backplane-remote`). Desactiva la verificación de firma del VPP (`DEV OVERRIDE`), algo inaceptable para un producto industrial.

### Riesgo corregido
El codificador de bytes del VPP enmascara a 8 bits, así que un Slave ID **258 se emitía como 2** y podía comandar otro módulo del bus RS-485. Ahora:
1. la UI lo marca;
2. la compilación falla con un mensaje por slot;
3. el HAL descarta los IDs duplicados o fuera de rango como última defensa.

---

## 3. Cambios en platform-jwplc (VPP 2.1.0-alpha.20)

> Hashes de platform posteriores al rebase sobre `main` (2026-10-06). Los originales sobre alpha11 quedan en la rama local `backup/openplc-engineering-closure-alpha11-0da901ae`.

| Commit | Cambio |
|---|---|
| `a36c0845` | HAL con varios slots y bus RS-485 configurable. |
| `0ce18bc0` | Sección **RS-485 Backplane** (`backplane_rtu`) en la pantalla JWPLC Backplane y versión 2.1.0-alpha.20. |
| `5511dd67` | Firma del payload con `jwcontrol-2026`. |
| `01b5ed6c` | `docs/v2.1.0-alpha.12/BACKPLANE_RTU_CONFIGURATION.md`. |

### Bus RS-485 del Backplane
- Baudrate: 9600, 19200, 38400, 57600 o 115200. Formato: 8N1, 8E1 u 8O1.
- Cadena de datos: UI → `vendorScreenData.backplane_rtu` → `vpp_config.h` (`VPP_BACKPLANE_RTU_BAUD_RATE` / `VPP_BACKPLANE_RTU_SERIAL_FORMAT`) → HAL → `JWPLC_ModbusRTU.begin()` sobre Serial2.
- Un proyecto sin estos campos (Alpha9) compila con **115200/8N1**, igual que antes.
- Un valor no soportado da **error de compilación** (`static_assert`), nunca un cambio silencioso de perfil.
- No se reutiliza `Device > Modbus`: esa pantalla es para el servidor Modbus y el debugger del propio JWPLC.

### HAL multi-slot
- Hasta **7 módulos Remote I/O** (slots 2..8), atendidos por turnos.
- Por cada slot en línea: `FC15` (salidas) → `FC01` (feedback) → `FC02` (entradas).
- **3 fallos consecutivos:** el slot pasa a fuera de línea y sus `%IX` van a **0** (estado seguro). Después solo recibe un sondeo `FC02` por vuelta y se reconecta automáticamente.
- El probe de timing Alpha7.18 queda desactivado por defecto; para banco se activa con `-DJWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS=1`.

---

## 4. Validación

### Automática

| Prueba | Resultado |
|---|---|
| `tsc --noEmit` del editor | PASS |
| ESLint de los archivos modificados | PASS |
| Jest: 79 suites / 2202 tests (store, compile, vpp, iec-address, compiler, firmware, components) | PASS |
| Compilación real del HAL (`arduino-cli`, `jwplc:esp32:jwplcbasic` 2.1.0-alpha.11) con `vpp_config.h` generado por el editor: Alpha9 sin campos, sin Backplane, solo baud, 38400/8E1 con 3 slots, probe activo | PASS (5/5) |
| Baud `250000` / formato `7N2` | FAIL esperado (`static_assert`) |
| Firma del VPP con `verifyPackageSignature` del editor | `valid=true` |
| HAL alterado después de firmar | Rechazado (`Tampered file detected`) |

### Física (banco, 2026-09-23)

| Prueba | Resultado |
|---|---|
| Importar VPP alpha.20 en JWPLC Edition | PASS |
| Maestro JWPLC Basic con Backplane (slot 2 Remote I/O, 115200/8N1 por defecto) | PASS: el Master RTU arranca en Serial2 |
| Esclavo con sketch Arduino `JWPLC_RemoteIO_Slave_RTU` (ID 2, 115200/8N1) | PASS: hay comunicación maestro ↔ esclavo y responde |
| Diagnóstico sin esclavo programado | Maestro BUS `TMO` y esclavo BUS `INI`, según lo esperado |
| Reabrir proyecto con variables ligadas a alias del Backplane (tras la corrección §5.1) | PASS: las variables de `main` se conservan |
| **Esclavo programado desde OpenPLC** (placa JWPLC BASIC Remote IO, ID 2, 115200/8N1, failsafe 1000 ms, `main` vacío) comandado por el maestro (VPP alpha.24) | **PASS**: compila, sube por USB y responde al maestro |

### Hallazgo en el banco: librerías con el mismo nombre
Las copias antiguas en `Documents\Arduino\libraries` (`JWPLC_ModbusRTU_old`, `JWPLC_RS485_old`, `JWPLC_Ethernet_yo`) declaran el mismo `name=` que las del core, en su versión 1.0.0. El Arduino IDE les da prioridad y ocultaba los ejemplos Remote I/O; además habrían compilado con una API vieja. **Solución:** sacarlas de `libraries`. Hay que documentarlo para los técnicos.

### Pendiente

La lista vigente de pendientes está en **§9.4**.

---

## 5. Correcciones posteriores a la primera prueba en banco

### 5.1 Variables del POU perdidas al reabrir (editor, `05f2d8360`)
**Síntoma:** después de cerrar y reabrir el proyecto, `main` aparecía con `VAR / END_VAR` vacío. Los slots del Backplane sí se conservaban.

**Causa:** `Entrada1 : BOOL AT Int1` estaba en **VAR_INPUT**. El archivo se guardó bien, pero al reabrir el parser estricto rechazaba `AT` en VAR_INPUT y el cargador creaba en silencio un POU de respaldo con las variables vacías. Si se hubiera guardado en ese estado, las variables se habrían perdido.

**Corrección:**
- Al cargar, nunca se descarta una declaración. En un PROGRAM la variable pasa a `VAR` conservando su alias; en FUNCTION/FB solo se quita la ubicación.
- En el store, cambiar la clase a una sin `AT` borra la ubicación en la misma operación, y se rechaza asignar ubicación a input/output/inOut/external/temp.
- Verificado con el `main.ld` real del banco: las 7 variables cargan con sus alias.

### 5.2 Failsafe de 100 ms (platform, VPP 2.1.0-alpha.21)
- Maestro: un fallo corta el ciclo del slot y los slots fuera de línea se sondean de a uno, como máximo cada 1000 ms.
- Esclavo `JWPLC_RemoteIO_Slave_RTU`: `OUTPUT_FAILSAFE_MS = 1000`.
- Peor caso entre escrituras a un módulo sano: unos 670 ms (7 slots a 9600 + 1 timeout).
- HAL compilado en 3 variantes y sketch esclavo compilado. Firma `valid=true`.

```text
VPP_VERSION=2.1.0-alpha.21
VPP_SHA256=83fdd4b22d5193d31904959aceb72a86089996b836b4b2315671bfa7a3abfd20
```

**Para probar en banco:** importar el VPP alpha.21 en el maestro y **volver a cargar el sketch esclavo** actualizado (`FAILSAFE_MS=1000` en el monitor serie).

---

### 5.3 Esclavo programable desde OpenPLC (VPP 2.1.0-alpha.22)
- Nuevo dispositivo **JWPLC BASIC Remote IO [2.0.0]** (sin `/`: el nombre se usa como carpeta de build; corregido en alpha.23). Se crea un proyecto con esa placa, se configura en la pantalla **Remote I/O Slave** (Slave ID, Baudrate, Formato, Failsafe) y se sube por USB.
- La lógica es la misma que la del sketch validado. El programa IEC del esclavo no controla su I/O.
- Un valor inválido detiene la compilación.
- No requirió cambios en el editor: es solo VPP.
- Proyecto del esclavo: **separado** del maestro. Puede tener `main` **vacío**: el dispositivo declara `iecProgramOptional` y el editor (`3437c77db`) completa en memoria una variable y un cuerpo ST no-op para `xml2st`, sin tocar el proyecto. Verificado con `XmlGenerator` + `xml2st.exe` reales.

```text
VPP_VERSION=2.1.0-alpha.24
VPP_SHA256=2670e80771133aa41b3494698fdabf647698f7b9ac5780e8446376a2597da0fd
REMOTE_IO_SLAVE_FROM_OPENPLC=PASS_PHYSICAL (2026-09-23, 1 esclavo ID 2, 115200/8N1)
```

---

## 6. Guía rápida para el técnico

**Maestro**
1. Board Manager: core `jwplc:esp32` **2.1.0-alpha.12**. Package Manager: instalar el VPP `jwplc-basic-openplc-2.1.0-alpha.26.jwcontrol-signed.vpp`.
2. Proyecto con la placa **JWPLC BASIC [2.0.0]**.
3. Pantalla **JWPLC Backplane**:
   - en **RS-485 Backplane**, elegir Baudrate y Formato;
   - en los slots 2..8, agregar **JWPLC Basic Remote I/O** con su Slave ID;
   - dar alias a los canales.
4. En el programa, usar esos alias en variables de clase **Local (VAR)**. Input/Output no admiten ubicación.
5. Compilar y subir.

**Cada esclavo**
1. Proyecto **separado**, con la placa **JWPLC BASIC Remote IO [2.0.0]**. `main` puede quedar vacío.
2. En la pantalla **Remote I/O Slave**, configurar Slave ID (el mismo del slot), Baudrate y Formato (los mismos del maestro) y el Failsafe (1000 ms recomendado).
3. Compilar y subir por USB.

**Indicador BUS del display**

| Código | Significado |
|---|---|
| `---` verde | Comunicación correcta |
| `TMO` rojo | Timeout: el otro extremo no responde (cableado, ID o baud distintos) |
| `CRC` rojo | Error de trama: A/B invertidos, formato distinto o ruido |
| `INI` | RS-485 sin iniciar: el equipo no tiene firmware de maestro ni de esclavo |

---

## 7. Historial de versiones del VPP (sesión 2026-09-23)

| VPP | Commit platform | Cambio |
|---|---|---|
| 2.1.0-alpha.20 | `a36c0845` `0ce18bc0` `5511dd67` | Bus RS-485 configurable, HAL multi-slot, validación de Slave ID |
| 2.1.0-alpha.21 | `c4cc8d26` `abc9df80` `f1231e46` | Un fallo corta el ciclo del slot, sondeo acotado de slots fuera de línea, failsafe del sketch a 1000 ms |
| 2.1.0-alpha.22 | `8cfc7b68` `11468079` | Nuevo dispositivo esclavo Remote I/O configurable desde OpenPLC |
| 2.1.0-alpha.23 | `83a53505` | Nombre del esclavo sin `/` (rompía la carpeta de build) |
| 2.1.0-alpha.24 | `46d4658b` | Esclavo con `capabilities.iecProgramOptional` (compila con `main` vacío) |
| 2.1.0-alpha.25 | `2aa46439` | Rama rebasada sobre `main` (Alpha12). Master RTU con `motor(ASYNC)` explícito y API unificada `readCoils`/`readDiscreteInputs`/`writeMultipleCoils`; `#error` si el core es anterior a Alpha12 |
| 2.1.0-alpha.26 | `1b54c7f9` | Serial2 exclusivo del Backplane: el módulo Remote I/O declara `exclusiveSerialPort`; `static_assert` en el HAL si Modbus RTU (debugger) usa Serial2 con módulos |

Commits del editor posteriores a la primera publicación:

| Commit | Cambio |
|---|---|
| `05f2d8360` | No perder variables al reabrir un POU con `AT` en VAR_INPUT; el store impide ubicación en clases sin `AT` |
| `3437c77db` | Dispositivos VPP de firmware (`iecProgramOptional`) compilan con `main` vacío; se completa solo en memoria |
| `91db7f8b5` | Tests para 100 % de statements/lines en `src/backend/shared` |

Validación automática acumulada del editor: `tsc` y ESLint limpios; Jest con 3686 tests en store, utils, services, shared y components; umbrales de cobertura del repo cumplidos en los archivos modificados. En el HAL del maestro se compilaron 7 variantes y en el del esclavo otras 7, con el core real (4 fallos esperados en ambos casos).

---

## 7b. Rebase sobre la Alpha12 publicada (2026-10-06)

- `platform-jwplc`: la rama se rebasó sobre `main @ aa0bfed1` (Alpha12 publicada) sin conflictos y sin tocar el core ni las librerías de Alpha12. Push con `--force-with-lease`. Respaldo local: `backup/openplc-engineering-closure-alpha11-0da901ae`.
- Alpha12 trae en `JWPLC_ModbusRTU` un selector de motor `SYNC`/`ASYNC` y en `JWPLC_RS485` la dirección del bus por hardware. El HAL maestro se adaptó (VPP alpha.25): `motor(ASYNC)` explícito y API unificada. El frame gap (2 ms) y el HAL esclavo no cambian.
- Detalle y verificación: `docs/v2.1.0-alpha.12/BACKPLANE_RTU_CONFIGURATION.md` §11 en `platform-jwplc`.

```text
ALPHA12_CORE_COMPILE=PASS (maestro, esclavo OpenPLC y sketch esclavo)
ALPHA12_CORE_PHYSICAL=PASS (maestro <-> esclavo con core Alpha12, HAL alpha.24)
VPP_ALPHA25_SIGNATURE=valid
VPP_ALPHA25_PHYSICAL=PASS (2026-10-06, maestro <-> esclavo)
```

---

## 7c. Debugger y bus del Backplane: Serial2 exclusivo (2026-10-06)

El debugger usa el servidor Modbus RTU de **Device > Modbus**, que es independiente del Master RTU del Backplane. Para depurar hay que usar **Interface = USB (Serial0)**, con el COM de carga y Slave ID/baud propios (no chocan con el bus).

Si se elegía **RS-485 (Serial2)** con módulos Remote I/O, el sketch reabría el UART del Backplane, los módulos quedaban fuera de línea con sus salidas en fail-safe y **compilaba sin aviso**. Ahora hay dos capas de protección:

| Capa | Cambio |
|---|---|
| Editor `f4cece27b` | `validateExclusiveSerialPorts()`: si un slot tiene un módulo con `exclusiveSerialPort` y Modbus RTU está activo en ese puerto, la compilación se detiene con un mensaje por slot |
| VPP alpha.26 (platform `1b54c7f9`) | El manifest declara `exclusiveSerialPort: "Serial2"` en `jwplc-basic-remote-io`, y el HAL tiene un `static_assert` para builds de editores que no validan |

Siguen permitidos el debugger por USB y Serial2 sin módulos Remote I/O (JWPLC como esclavo RS-485 de un SCADA).

```text
SERIAL2_EXCLUSIVE_EDITOR=PASS (72 tests, 100 % líneas en los archivos tocados)
SERIAL2_EXCLUSIVE_HAL=PASS (5 variantes compiladas; solo Serial2 + Remote I/O falla)
VPP_ALPHA26_SIGNATURE=valid
VPP_ALPHA26_PHYSICAL=PASS (2026-10-06, maestro <-> esclavo + debugger USB)
```

---

## 8. Diferido (fuera de Alpha12)

- **Commissioning por el bus** (registros 224–240 de `JWPLC_REMOTE_IO_RTU_PROTOCOL`): asignar el Slave ID sin reprogramar, identificar por UID y guardar en FRAM.
- **Estado en línea / fuera de línea por slot visible en el programa IEC:** corresponde a Alpha17 Diagnostics.
- **Backport upstream #966** (alias en LSP): requiere STruCpp v0.6.1.

---

## 9. Estado de cierre (2026-10-06)

Referencia: orden de trabajo `JWPLC_ALPHA12_OPENPLC_ENGINEERING_CLOSURE_WORK_ORDER` (2026-09-12). Esa orden es **anterior a la renumeración** de la hoja de ruta (ver §9.5).

### 9.1 Cambios de la sesión 2026-10-06

**platform-jwplc** — rama `v2.1.0-alpha.12/feature/openplc-engineering-closure`, base `main @ aa0bfed1`:

| Commit | Cambio |
|---|---|
| (rebase) | Rama movida de `release/v2.1.x @ 165f94fb` (alpha11) a `main @ aa0bfed1` (Alpha12 publicada). Sin conflictos; no se modificó el core ni las librerías de Alpha12. |
| `2aa46439` | VPP alpha.25: Master RTU con `motor(ASYNC)` explícito, API unificada de Alpha12 y `#error` si el core es anterior a Alpha12. |
| `c9f4b447` | Documentación del rebase y de la adaptación (`BACKPLANE_RTU_CONFIGURATION.md` §11). |
| `1b54c7f9` | VPP alpha.26: Serial2 exclusivo del Backplane (`exclusiveSerialPort` en el manifest y `static_assert` en el HAL). |
| `70c093cb` | Documentación del debugger y del bus (`BACKPLANE_RTU_CONFIGURATION.md` §12). |

**openplc-editor** — rama `develop/alpha12-backplane-closure`:

| Commit | Cambio |
|---|---|
| `f4cece27b` | `validateExclusiveSerialPorts()`: la compilación se detiene si Modbus RTU (debugger) usa el UART de un módulo del Backplane. |
| `d3ed3335f` | Actualización de este documento (§7c). |

### 9.2 Cerrado y verificado

| Gate | Estado | Evidencia |
|---|---|---|
| `ALPHA12_BASE_CORRECT` | PASS | Rama sobre `main @ aa0bfed1`, árbol igual a `release/v2.1.x @ 20f1b660` |
| `BACKPLANE_RTU_BAUDRATE_UI` / `SERIAL_FORMAT_UI` | PASS | Sección RS-485 Backplane |
| `BACKPLANE_RTU_CONFIG_HAL` | PASS | `vpp_config.h` → HAL; compilado con el core Alpha12 |
| `BACKPLANE_RTU_DEFAULT_COMPATIBILITY` | PASS | Proyecto sin campos → 115200/8N1 |
| Validación de Slave ID (rango, entero, duplicado) | PASS | UI + compilación + HAL |
| `RTU_DEFAULT_115200_8N1` | PASS físico | Banco, maestro ↔ esclavo |
| Esclavo programado desde OpenPLC (`main` vacío) | PASS físico | Banco, ID 2 |
| Core Alpha12 + VPP alpha.25 | PASS físico | Banco 2026-10-06 |
| Serial2 exclusivo + debugger USB (VPP alpha.26) | PASS físico | Banco 2026-10-06: maestro, esclavo y debugger funcionando |
| Firma VPP alpha.26 | PASS | `verifyPackageSignature` → `valid=true`; HAL alterado → `Tampered file detected` |
| Backports upstream #948, #949, #950, #1085, #1083, #1088, #1078 | Integrados | Rama de integración (ver `docs/jwplc/alpha12/SOURCE_FREEZE.md`) |
| `JWPLC_EDITOR_ALPHA9_SOURCE_RECOVERED` | PASS | Vía `2faf717e4` |
| Build limpio del editor | PASS | §9.3 |
| Payload del instalador reproducible | PASS | §9.3 |

### 9.3 Build reproducible del instalador

Dos builds desde clones limpios de GitHub (`develop/alpha12-backplane-closure @ d3ed3335f`, 0 archivos sucios): `npm ci` → `npm run package`.

```text
OS=Windows 11 (10.0.26200)  NODE=v22.23.1  NPM=10.9.8
ELECTRON=35.0.0  ELECTRON_BUILDER=26.0.12  STRUCPP=v0.5.13  XML2ST=v4.0.7
PACKAGE_LOCK_SHA256=daadbd9ba41247a7c7af8b36519ca15c9636a061c81ba8751c84cfb9dae7453b
RELEASE_APP_LOCK_SHA256=2584d2acd40bbaa0dd1ea2326ce3c955c209fe849b73b601311f5961cb1367a4
BINARY_VERSIONS_SHA256=dfe05d35deb9f5a468a5f2c05ca481ce1c0186ac2be1d54d4759aa82be86c553

WIN_UNPACKED=443 archivos, 0 diferencias entre build 1 y build 2
APP_ASAR_SHA256=53cdb33b7bddafc57b3a4a553171e43cbad025f6a209a15cf793abd395e58818
INSTALLER_B1=d15bef5a1b3eebe0e3a46b6c44290fa78f77b3ac0b2a109bfcc65c4f6da410e9 (133745265 B)
INSTALLER_B2=fe27fbd2c05c02cc83172d4c1f23ad1b24411259bd3904e01ff93d18394c5874 (133745266 B)

JWPLC_EDITOR_CLEAN_BUILD=PASS
JWPLC_EDITOR_INSTALLER_BUILD=PASS
JWPLC_EDITOR_REPRODUCIBLE=PARTIAL (payload idéntico; el .exe NSIS no es byte-determinista)
```

- Al extraer los dos instaladores, los 443 archivos internos son idénticos. La diferencia está en el contenedor NSIS. La causa probable es la fecha que guarda de cada archivo, pero no se comprobó.
- Esta PC tiene **Smart App Control** activo y bloqueó una vez el `.exe` temporal con el que electron-builder genera el desinstalador (`spawn UNKNOWN`). No se desactivó: en Windows 11 es casi irreversible.
- Para empaquetar en Windows sin privilegio de symlinks hace falta `winCodeSign-2.6.0` descomprimido en `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` (le faltan dos librerías de macOS que no se usan).

**Suite de tests en el clon limpio:** 5184 pasan, 5 fallan y 3 se omiten (236 de 239 suites). Los fallos son ajenos a esta rama:

- 4 en `board-info-resolver.test.ts`: el test espera rutas `\fake\...` y en Windows recibe `C:\fake\...`. Es un defecto del test.
- 1 en `debug-spec.test.ts`: `a7a541571` (fork JWPLC, julio) cambió `as: 'boolean'` a "solo `true`/`'true'`", y el test espera "cualquier valor verdadero".
- Los umbrales de 100 % de cobertura **no se cumplen en el repo completo** (`src/backend/shared`: 59 % de líneas). Los archivos tocados por esta rama sí están al 100 % de líneas.

### 9.4 Pendiente

**Pruebas de banco posibles con 2 PLC (1 maestro + 1 esclavo):**

| Gate | Cómo |
|---|---|
| `REMOTE_IO_MULTIBIT` (8 patrones) | `0x00 0xFF 0x55 0xAA 0x0F 0xF0 0x81 0x42` en las entradas del esclavo, sin bits cruzados hasta la salida. Incluir una desconexión y reconexión del RS-485. |
| `RTU_ALTERNATE_PROFILE` | 38400/8E1: cambiar en UI → guardar → cerrar y reabrir → compilar → subir maestro y esclavo. |
| `REMOTE_IO_OFFLINE_SAFE_STATE` | Desconectar el bus: entradas remotas a 0 en el maestro y salidas del esclavo OFF en 1 s. Al reconectar se recupera solo. |
| `PROJECT_SAVE_REOPEN_RECOMPILE` / `SLAVE_ID_PERSISTENCE` | Proyecto con 2 slots (ID 2 real, ID 3 sin equipo), baud y formato no default, alias, TON/TOF/TP con `.Q`: guardar → cerrar app → reabrir → compilar → reabrir → recompilar. |
| Slot ausente | Con ese proyecto, el slot 2 sigue funcionando con el 3 fuera de línea. |
| `BUS_CYCLE_TIME` | Medir con el probe de timing (sin el debugger: ambos usan Serial0). |

**Requiere un tercer PLC:** `REMOTE_IO_MULTISLOT` con 2 esclavos reales a la vez.

**Editor / release:**

- Tests del contrato de miembros de FB (§13 de la orden: `TON0.Q` válido, `TON0.X` y `BOOL0.Q` rechazados, nombre `TON0.Q` rechazado). El #950 está portado, pero no hay tests específicos.
- Versión del editor `4.2.8-jwplc.3`. Se pospone por ahora.
- Documentos de §21 de la orden. Se posponen por ahora.
- Matriz de regresión del editor (§19 de la orden), sin definir.
- Corregir los 5 tests que fallan y decidir qué hacer con los umbrales de cobertura globales.
- Instalador NSIS byte-determinista (opcional: el payload ya es idéntico).
- PR final.

### 9.5 Consultar con el responsable antes de seguir

1. **Renumeración de la hoja de ruta.** La Alpha12 publicada es Comunicaciones (Modbus TCP/RTU). El trabajo OpenPLC pasó a **Alpha14** ("OpenPLC + mejoras de integración", rama prevista `v2.1.0-alpha.14/feature/openplc-integration`), después de Alpha13 (TFT/Display). El roadmap dice que el alcance de Alpha14 se congela solo después de publicar Alpha13. ¿Se sigue avanzando ahora o se espera?
2. **Nombre de la rama.** ¿Se mantiene `v2.1.0-alpha.12/feature/openplc-engineering-closure` o se renombra a alpha14?
3. **Carpeta de documentos.** `docs/v2.1.0-alpha.12/` es ahora la carpeta del release de comunicaciones. ¿Dónde van `BACKPLANE_RTU_CONFIGURATION.md` y los documentos de §21?
4. **Destino del PR.** La orden dice `release/v2.1.x`, pero la rama parte de `main` y ambas tienen historias distintas (squash). Hay que definir la base del PR.
5. **Alcance de la orden de trabajo.** Qué partes de la orden del 2026-09-12 siguen vigentes en Alpha14.
6. **Tercer PLC** para la prueba multi-slot con 2 esclavos reales.
7. **Semántica de `as: 'boolean'`** en `debug-spec`: confirmar si el cambio de `a7a541571` es el comportamiento deseado, para corregir el test.
8. **Dónde generar los instaladores oficiales:** una PC sin Smart App Control o CI de GitHub. `release.yml` construye todas las plataformas y tiene un job `create-release`.
