## OpenPLC Editor – JWPLC Edition 4.3.3-jwplc.2 (pre-release)

Editor de la alpha **2.1.0-alpha.17** de JWPLC. Es la misma base que 4.3.3-jwplc.1 (OpenPLC Editor 4.3.3 de
Autonomy con lo propio de JW Control) con el **HMI Designer final de la alpha 17**.

### Contenido

| Archivo | Qué es |
|---|---|
| `__EXE_NAME__` | Instalador de Windows x64 del editor (con el HMI Designer y el VPP JWPLC Basic incluidos) |
| `JWPLC-Basic.vpp` | El mismo paquete de placas que trae el instalador, por si se quiere importar a mano |
| `SHA256SUMS.txt` | Sumas de verificación |

### Instalación

1. Si tienes instalada la 4.3.3-jwplc.1 u otra anterior, no hace falta desinstalarla: el instalador la actualiza
   (o acepta el aviso de actualización dentro del editor).
2. Ejecuta el instalador `.exe`. No tiene firma de código: en el aviso de Windows SmartScreen pulsa
   **Más información › Ejecutar de todas formas**.
3. El VPP JWPLC Basic ya viene instalado (es el mismo 2.1.0-alpha.17 de jwplc.1).

### Qué cambia respecto de 4.3.3-jwplc.1

- **HMI Designer 2.1.0-alpha.17 completo** (platform-jwplc `3f29398`):
  - widgets **TREND** (hasta 3 canales y 2 umbrales) y **QR** estático o dinámico;
  - proyectos de **varias páginas** con **subvistas** internas y **ventanas emergentes** (INFO, WARN, CRIT y
    CONFIRM) que pueden navegar al cerrarse;
  - menú **CARDS**, enlaces de variables PLC en MENU, TREND y Baliza, y hasta **64 campos** por proyecto;
  - iconos del catálogo con la biblioteca nativa `JWPLC_Icons` (sólo se enlaza el tamaño elegido).
- Para compilar los HMI nuevos hace falta el package **JWPLC 2.1.0-alpha.17**.

### Limitaciones conocidas

- Las mismas de 4.3.3-jwplc.1: pre-release, depuración sólo por USB o red, algunos textos internos en inglés,
  RETAIN sobre FRAM para una alpha posterior, sólo Windows x64.

### Origen

- Editor: `JW-Control/openplc-editor` `release/v2.1.x` (4.3.3-jwplc.1) con el Designer actualizado.
- HMI Designer y VPP: `JW-Control/platform-jwplc` en `PLATFORM_DESIGNER_SHA` y `PLATFORM_VPP_SHA` del
  workflow; firma del VPP verificada antes de empaquetar.
