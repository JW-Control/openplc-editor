# Alpha12 — Source freeze del JWPLC Editor

## Base

```text
Rama de trabajo:  develop/alpha12-backplane-closure
Base:             integration/jwplc-alpha7-alpha12-upstream @ db3d05506
Versión:          4.2.8-jwplc.2 (sin bump todavía; objetivo 4.2.8-jwplc.3 al cierre)
STruCpp:          v0.5.13
Node / npm:       v22.23.1 / 10.9.8
```

## Contenido de la base de integración

La rama de integración ya contiene `development` (incluido el PR #6, Remote I/O PoC), la línea Alpha7 hasta `51843ca8b`, `ddf942af4` y estos backports upstream:

| Upstream | Commit en integración |
|---|---|
| #948 edit hot-path clones | `d762bfdfb` |
| #949 hot-path scans | `8519cd150` |
| #950 dotted refs / miembros FB | `22ccf9bfb` |
| #1085 execution order UX | `2e335be53` |
| #1083 nombres case-insensitive | `d962def3f` |
| #1088 duplicados desde code view | `874660418` |
| #1078 colisión con símbolos de librería | `9d676a699` |

No incluidos: #966 (requiere STruCpp v0.6.1), #1092, #1095 y #1097.

## Recuperación del worktree de taller (Alpha9)

El instalador de taller se construyó desde un worktree con cambios sin confirmar. Esos cambios se consolidaron después en `2faf717e4` (`develop/alpha7-openplc-remote-io-rtu`), que **no** estaba en la rama de integración. Contiene:

- La política de identidad por slot del Backplane (`defaultFromSlot`, `uniqueAcrossSlots`).
- Las librerías Arduino limitadas al VPP (`includeLegacyGlobalLibraries`).
- Los pines por defecto del VPP (`default-pin-mapping.ts`).
- La carpeta de proyecto con nombre y el selector de carpeta padre.

Se integró con merge `b955e4920`, sin conflictos.

**No integrado a propósito:** `75272a4fb` (`develop/jwplc-backplane-remote`). Desactiva la verificación de firma del VPP (`DEV OVERRIDE`), algo inaceptable para un producto industrial.

Los scripts `scripts/alpha7/Apply-*.ps1` parchean el código fuente por texto de referencia. Una vez integrado `2faf717e4` ya no hacen falta y no deben volver a ejecutarse sobre esta rama.

```text
JWPLC_EDITOR_ALPHA9_SOURCE_RECOVERED=PASS (vía 2faf717e4)
JWPLC_EDITOR_WORKTREE_CLEAN=PASS
JWPLC_EDITOR_SOURCE_FREEZE=PARTIAL
  -> no se reconstruyó el instalador para comparar con el SHA de taller
     79C22B2C1816170997CA8A8F5D952DA0BE2098EA2941C5D7E58D0800716C47C7
```

## Cambios Alpha12 del Backplane en esta rama

| Commit | Cambio |
|---|---|
| `3f986a602` | Tests de `installArduinoLib` actualizados al flag `includeLegacyGlobalLibraries` |
| `3cec56401` | `validateModuleConfigValues()`: la compilación se detiene si hay un Slave ID fuera de rango o duplicado; `encodeModuleConfig` respeta `defaultFromSlot` |
| `cdb133375` | Error de rango visible por slot en la UI del Backplane |
| `6b2c31350` | Preset "JWPLC Basic Remote I/O" de Remote Devices oculto (el Backplane es la única fuente de verdad) |

El bus RS-485 (baudrate y formato) no necesitó código en el Editor. Es una sección `form` del VPP que el walker genérico exporta como `VPP_BACKPLANE_RTU_*`. Ver `platform-jwplc/docs/v2.1.0-alpha.12/BACKPLANE_RTU_CONFIGURATION.md`.
