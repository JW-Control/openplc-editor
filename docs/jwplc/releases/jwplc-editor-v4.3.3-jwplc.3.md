## OpenPLC Editor – JWPLC Edition 4.3.3-jwplc.3 (pre-release)

Editor de la alpha **2.1.0-alpha.18** de JWPLC: **OpenPLC Editor y JWPLC Sim trabajan juntos**. Misma base que
4.3.3-jwplc.2 (OpenPLC Editor 4.3.3 de Autonomy con lo propio de JW Control), con el mismo HMI Designer y el
mismo VPP.

### Contenido

| Archivo | Qué es |
|---|---|
| `__EXE_NAME__` | Instalador de Windows x64 del editor (con el HMI Designer y el VPP JWPLC Basic incluidos) |
| `JWPLC-Basic.vpp` | El mismo paquete de placas que trae el instalador, por si se quiere importar a mano |
| `SHA256SUMS.txt` | Sumas de verificación |

### Instalación

1. Si tienes instalada la 4.3.3-jwplc.2 u otra anterior, no hace falta desinstalarla: el instalador la actualiza
   (o acepta el aviso de actualización dentro del editor).
2. Ejecuta el instalador `.exe`. No tiene firma de código: en el aviso de Windows SmartScreen pulsa
   **Más información › Ejecutar de todas formas**.
3. El VPP JWPLC Basic ya viene instalado (2.1.0-alpha.17, sin cambios).

### Qué cambia respecto de 4.3.3-jwplc.2

- **Simular en JWPLC Sim:** botón nuevo en la barra de actividad que abre el proyecto en el Sim. Si el Sim no
  está instalado, el editor pide ubicarlo y recuerda la ruta.
- **Abrir desde JWPLC Sim:** el Sim puede abrir un proyecto en el editor (`--open-project=<carpeta>`), también
  con el editor ya abierto, y al cerrarse cierra el editor (con la confirmación de salida).
- **HMI:** se enlazan a variables PLC los canales 2 y 3 del TREND y los pisos de la Baliza en modo
  independiente; Guardar ya no reescribe el diseño si no cambió; la vista de enlaces carga bien cuando el
  editor se abre desde el Sim.
- **Modbus TCP del JWPLC Basic (firmware OpenPLC):** el puerto 502 arranca aunque el cable de red se conecte
  después del encendido (o tras reiniciar el W5500) y acepta peticiones que llegan en varios segmentos TCP.

### Limitaciones conocidas

- Las mismas de 4.3.3-jwplc.2: pre-release, depuración sólo por USB o red, algunos textos internos en inglés,
  RETAIN sobre FRAM para una alpha posterior, sólo Windows x64.
- El arreglo de Modbus TCP no se probó todavía en una placa real; los enlaces de TREND y Baliza se validaron
  con pruebas automáticas.
- Las versiones 4.3.4 y 4.3.5 de Autonomy entran en la alpha 19.

### Origen

- Editor: `JW-Control/openplc-editor` `v2.1.0-alpha.18/JWPLC-Sim/main` (PR #19, #20, #21) sobre 4.3.3-jwplc.2.
- HMI Designer y VPP: `JW-Control/platform-jwplc` en `PLATFORM_DESIGNER_SHA` (`3f29398`) y `PLATFORM_VPP_SHA`
  (`0647a84`) del workflow, sin cambios; firma del VPP verificada antes de empaquetar.
