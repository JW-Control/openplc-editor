# Update — JWPLC Backplane (Alpha12)

**Fecha:** 2026-09-23
**Alcance:** OpenPLC Engineering Closure. Bus RS-485 del Backplane configurable, Remote I/O multi-slot y validación del Slave ID.

---

## 1. Ramas y bases

| Repo | Rama | Base |
|---|---|---|
| `JW-Control/openplc-editor` | `develop/alpha12-backplane-closure` | `integration/jwplc-alpha7-alpha12-upstream` @ `db3d05506` |
| `JW-Control/platform-jwplc` | `v2.1.0-alpha.12/feature/openplc-engineering-closure` | `release/v2.1.x` @ `165f94fb` (alpha11 + roadmap) |

```text
EDITOR_VERSION=4.2.8-jwplc.2 (bump a 4.2.8-jwplc.3 al cierre)
STRUCPP_VERSION=v0.5.13
VPP_VERSION_BEFORE=2.1.0-alpha.19
VPP_VERSION_AFTER=2.1.0-alpha.20
VPP_KEY_ID=jwcontrol-2026
VPP_SHA256=ad4a5411923c85b31c68f26391ccb0c5c9d2a6508c49420cf2dab434888d94bd
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

| Commit | Cambio |
|---|---|
| `4d0d6919` | HAL con varios slots y bus RS-485 configurable. |
| `0e94c444` | Sección **RS-485 Backplane** (`backplane_rtu`) en la pantalla JWPLC Backplane y versión 2.1.0-alpha.20. |
| `6b34bfa3` | Firma del payload con `jwcontrol-2026`. |
| `410f051e` | `docs/v2.1.0-alpha.12/BACKPLANE_RTU_CONFIGURATION.md`. |

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

### Hallazgo en el banco: librerías con el mismo nombre
Las copias antiguas en `Documents\Arduino\libraries` (`JWPLC_ModbusRTU_old`, `JWPLC_RS485_old`, `JWPLC_Ethernet_yo`) declaran el mismo `name=` que las del core, en su versión 1.0.0. El Arduino IDE les da prioridad y ocultaba los ejemplos Remote I/O; además habrían compilado con una API vieja. **Solución:** sacarlas de `libraries`. Hay que documentarlo para los técnicos.

### Pendiente

```text
BACKPLANE_RTU_CONFIG_PERSISTENCE=PENDING (save -> cerrar -> reabrir)
SLAVE_ID_SAVE/REOPEN/RECOMPILE=PENDING
RTU_ALTERNATE_PROFILE=PENDING_PHYSICAL (p. ej. 38400/8E1 en maestro y esclavo)
REMOTE_IO_MULTISLOT=PENDING_PHYSICAL (>= 2 esclavos)
REMOTE_IO_OFFLINE_SAFE_STATE=PENDING_PHYSICAL
REMOTE_IO_MULTIBIT=PENDING_PHYSICAL (8 patrones)
BUS_CYCLE_TIME=PENDING (medir con el probe para 1/2/3 slots)
EDITOR_VALIDATION_UI=PENDING (probar el editor dev de esta rama: error de rango y bloqueo de compilación)
```

---

## 5. Limitación conocida (resolver antes del gate multi-slot)

El sketch esclavo aplica `OUTPUT_FAILSAFE_MS = 100`: apaga las salidas si pasan 100 ms sin `FC05`/`FC15`. Con **un** esclavo no afecta. Con **varios** slots, a baud bajo o con un esclavo fuera de línea (timeout de 250 ms), el maestro puede tardar más de 100 ms en volver a cada módulo, y las salidas de los esclavos sanos **parpadearían**. Hay que:
- subir o hacer configurable el failsafe del esclavo (unos 500–1000 ms);
- limitar en el maestro la frecuencia de sondeo de los slots fuera de línea.

---

## 6. Diferido (fuera de Alpha12)

- **Dispositivo "JWPLC BASIC Remote I/O" dentro del VPP:** programar el esclavo desde OpenPLC, con Slave ID, baud, formato y failsafe configurables. Hoy se usa el sketch de Arduino.
- **Commissioning por el bus** (registros 224–240 de `JWPLC_REMOTE_IO_RTU_PROTOCOL`): asignar el Slave ID sin reprogramar, identificar por UID y guardar en FRAM.
- **Estado en línea / fuera de línea por slot visible en el programa IEC:** corresponde a Alpha17 Diagnostics.
- **Backport upstream #966** (alias en LSP): requiere STruCpp v0.6.1.
