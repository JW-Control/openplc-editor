# JWPLC Sim desde el editor

Con una placa JWPLC Basic, la barra de actividad muestra **Simular en JWPLC Sim**, debajo de Iniciar PLC. Es el
gate `JWSIM_G6_SIMULATE_BUTTON` de `jwplc-sim` (`docs/GATES.md`).

## Qué hace el botón

1. Guarda el proyecto: el Sim compila lo que hay en disco.
2. Busca el programa: primero la ruta guardada (`jwplc_sim_path`) y luego las carpetas por defecto del instalador.
   Si no lo encuentra, pide ubicarlo una vez. Así se cubren las instalaciones en otra carpeta y el portable.
3. Lanza `JWPLC Sim.exe --jwsim-open=<carpeta del proyecto>`. Si el Sim ya está abierto, el proyecto se abre en esa
   ventana. Si ya era ese proyecto, no se recarga y la simulación sigue.

Después, cada guardado en el editor recompila en el Sim sin volver a pulsar el botón (`G6 RELOAD_FROM_EDITOR`).

## Requisitos

- Un JWPLC Sim que entienda `--jwsim-open`. Uno anterior arranca, pero no abre el proyecto.
- Un `editor.lock` del Sim en la misma línea que este editor. Si no, compila con otra cadena distinta a la del
  proyecto.

## Límites

Los que indica `ARCHITECTURE.md` §3.6 de `jwplc-sim`: el Sim todavía no recibe el MENU/HMI del proyecto (`hmi/`) ni
el Modbus de la pantalla del VPP.

El botón se muestra con `capabilities.hmiDisplay`, la marca que usa el editor para el JWPLC Basic.

## Mejora pendiente: alias de E/S en el Sim

Los proyectos con variables ligadas a alias de E/S (`AT M_Q0`, `AT RI0`) no compilan en el Sim. Dan «is an I/O alias,
not an address». Se reprodujo con `PruebaMultibit` y la cadena 4.3.3 (PR #28 de `jwplc-sim`).

- **Causa:** el editor resuelve los alias en el renderer antes de compilar, con `getCompileReadyProjectData()`.
  `cli/lib/openplc.mjs` del Sim solo reproduce la cadena del proceso principal, así que ese paso no se ejecuta.
- **Datos:** los alias están en `vendorScreenData['io-mapping'].entries` de `devices/configuration.json`, cada uno con
  su `iecAddress`.
- **Arreglo:** en `jwplc-sim`, resolver `variable.location` antes de `runCompilePipeline`, sobre el PR #28. Conviene
  reutilizar la lógica del editor (`buildAliasRegistry` y `resolveAlias`, en `src/middleware/shared/utils/iec-address/`)
  en lugar de copiarla.
- **Por comprobar:** con los alias resueltos, si el Sim simula las E/S remotas (`RI0`, `RQ0`) de un esclavo.
- **Prueba de cierre:** `PruebaMultibit` compila con `jwsim-cli build`, y se agrega un fixture con alias a `tests/openplc/`.
