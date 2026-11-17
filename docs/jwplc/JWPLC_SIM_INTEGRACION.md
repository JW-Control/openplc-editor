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

## Alias de E/S

Las variables ligadas a alias (`AT Out0`) compilan en el Sim desde `feature/alpha18-alias-openplc` de `jwplc-sim`. El
editor resuelve los alias en el renderer, así que el Sim hace lo mismo con `resolveProjectAliases`, usando las
direcciones guardadas en el proyecto.

**Por comprobar:** `PruebaMultibit` ya compila, pero falta ver si el Sim simula las E/S remotas (`RI0`, `RQ0`) de un
esclavo.

## VPP y editor

El VPP instalado debe ser de la misma línea que el editor. Con el editor 4.3.3 y un VPP alpha.16, la compilación falla
con «expected unqualified-id before numeric constant» en `NUM_DISCRETE_INPUT`: el HAL viejo declara esa constante y el
editor la genera como macro. El HAL de alpha.17 ya la renombró a `JWPLC_NUM_DISCRETE_INPUT`.
