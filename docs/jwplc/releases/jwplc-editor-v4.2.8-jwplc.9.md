## OpenPLC Editor – JWPLC Edition 4.2.8-jwplc.9 (pre-release)

Editor de la alpha **2.1.0-alpha.16** de JWPLC (en curso). Trae el **JWPLC HMI Designer 2.1.0-alpha.16** incluido:
no hace falta instalarlo aparte ni tener `platform-jwplc` descargado para diseñar.

### Contenido

| Archivo | Qué es |
|---|---|
| `__EXE_NAME__` | Instalador de Windows x64 del editor (con el HMI Designer incluido) |
| `JWPLC-Basic.vpp` | Paquete de placas JWPLC Basic 2.1.0-alpha.16 (firmado por JW Control, clave `jwcontrol-2026`) |
| `SHA256SUMS.txt` | Sumas de verificación |

### Requisitos

- Windows 10/11 de 64 bits.
- **Package JWPLC de alpha.16.** Todavía no está publicado en el gestor de placas: las pantallas con lo nuevo del
  Designer (iconos animados, medidor circular, historial de eventos) solo compilan con el package de la rama
  `v2.1.0-alpha.16/JWPLC-Sim/main` de `platform-jwplc`, instalado como placa local (`jwplc_local`). En
  *Configuration*, elige **Package Source › Local Development**.

### Instalación

1. Si tienes instalada una versión anterior de la JWPLC Edition, no hace falta desinstalarla: el instalador la
   actualiza.
2. Ejecuta el instalador `.exe`. No tiene firma de código: en el aviso de Windows SmartScreen pulsa
   **Más información › Ejecutar de todas formas**.
3. Abre el editor e importa `JWPLC-Basic.vpp`. El editor verifica la firma; si el archivo fue modificado lo
   rechaza (*Tampered file detected*).

### Qué incluye esta versión

- **HMI Designer 2.1.0-alpha.16:**
  - iconos animados e industriales: baliza modular por pisos, piloto de 2 a 8 estados, motores, pistones y
    paletas propias;
  - **Indicadores de nivel** con medidor circular;
  - plantilla de **historial de eventos** (en FRAM y SD);
  - **modo claro** con selector de tema en la barra de herramientas.
- **Panel lateral HMI** (estilo TIA Portal): el acceso al HMI Designer pasa de *Configuration* a un panel a la
  derecha del área de trabajo, con la ventana del Designer, la pestaña de enlaces y el número de variables
  enlazables.
- **VPP 2.1.0-alpha.16:** sin la pantalla «Pantalla HMI» en *Configuration* (el diagnóstico «Medir tiempos de
  scan» deja de estar en el editor).
- Todo lo de 4.2.8-jwplc.8 (ventana del Designer + vista de enlaces, guardado desde OpenPLC, variables en vivo).

### Limitaciones conocidas

- Pre-release de una alpha en curso: el package alpha.16 no está publicado (ver Requisitos).
- El proyecto «Runtime» del Designer es para Arduino IDE; dentro de OpenPLC no aparece.
- Iconos, medidor e historial dentro de un programa de OpenPLC: pendientes de prueba física.
- Sólo Windows x64.

### Origen

- Editor: `JW-Control/openplc-editor`, rama `v2.1.0-alpha.16/JWPLC-Sim/main` (el tag apunta al commit que se
  compiló). Incluye el panel lateral de `v2.1.0-alpha.16/OpenPLC-HMI/feature/panel-lateral-hmi` (`3531f31`).
- HMI Designer y VPP: `JW-Control/platform-jwplc`, commit `94edd7d4` (`v2.1.0-alpha.16/JWPLC-Sim/main`),
  `tools/jwplc-hmi-designer/poc` y `openplc-editor-installers/v4.2.7/vpp`; firma del VPP verificada antes de
  publicar.
