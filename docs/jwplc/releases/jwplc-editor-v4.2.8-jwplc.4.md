## OpenPLC Editor – JWPLC Edition 4.2.8-jwplc.4 (pre-release)

Editor de la alpha **2.1.0-alpha.15** de JWPLC (OpenPLC + HMI). Trae el **JWPLC HMI Designer 2.1.0-alpha.15**
incluido: no hace falta instalarlo aparte ni tener `platform-jwplc` descargado.

### Contenido

| Archivo | Qué es |
|---|---|
| `__EXE_NAME__` | Instalador de Windows x64 del editor (con el HMI Designer incluido) |
| `jwplc-basic-openplc-2.1.0-alpha.15.jwcontrol-signed.vpp` | Paquete de placas JWPLC Basic (firmado por JW Control, clave `jwcontrol-2026`) |
| `SHA256SUMS.txt` | Sumas de verificación |

### Requisitos

- Windows 10/11 de 64 bits.
- Core de placas **JWPLC 2.1.0-alpha.14** instalado (paso 1). La pantalla HMI usa `JWPLC_Display`/`JWPLC_UI`
  de esa versión.

### Instalación

#### 1. Core JWPLC 2.1.0-alpha.14

El editor usa la misma carpeta de cores que el Arduino IDE (`%LOCALAPPDATA%\Arduino15`).

1. Abre el Arduino IDE → **Archivo › Preferencias** → *URLs adicionales del gestor de placas* y agrega:

   ```
   https://raw.githubusercontent.com/JW-Control/platform-jwplc/main/JWPLC/package_jwplc_index_dev.json
   ```

2. **Herramientas › Placa › Gestor de placas** → busca **JWPLC** → instala la versión **2.1.0-alpha.14**.

> Si en `Documentos\Arduino\libraries` tienes copias antiguas de librerías `JWPLC_*` (por ejemplo `*_old`),
> muévelas fuera de esa carpeta: se compilarían en lugar de las del core.

#### 2. Editor

1. Si tienes instalada una versión anterior de la JWPLC Edition, no hace falta desinstalarla: el instalador la
   actualiza.
2. Ejecuta el instalador `.exe`.
3. El instalador **no tiene firma de código**, así que Windows SmartScreen mostrará un aviso:
   pulsa **Más información › Ejecutar de todas formas**.

#### 3. Paquete de placas (VPP)

1. Abre el editor → importa el paquete `jwplc-basic-openplc-2.1.0-alpha.15.jwcontrol-signed.vpp`.
2. El editor verifica la firma; si el archivo fue modificado lo rechaza (*Tampered file detected*).
3. En la placa **JWPLC BASIC [2.0.0]** aparece la pantalla **Pantalla HMI**.

### Qué incluye esta versión

- **HMI Designer 2.1.0-alpha.15 dentro del editor** («Abrir HMI Designer» en *Pantalla HMI*): guarda el diseño en
  la carpeta `hmi/` del proyecto y el editor lo compila junto con el programa.
- **Variable PLC**: las variables del programa aparecen para enlazarlas a los objetos del HMI, también las
  declaradas en el `main` de Ladder **sin dirección** (`%IX`, `%QX`…); se leen y escriben por la tabla de
  depuración del runtime.
- Aviso al cerrar el Designer con cambios sin guardar y selector propio del puerto serie.
- Si falta el header del HMI, la compilación avisa y sigue sin pantalla, en lugar de fallar.
- En laptops ya no aparece el aviso de pantalla para «dispositivos móviles» del editor de escritorio.
- Todo lo de 4.2.8-jwplc.3 (Backplane RS-485 con módulos Remote I/O, zoom, consola acoplable, etc.).

### Limitaciones conocidas

- Enlace de variables sin dirección y la pantalla HMI en placa: pendientes de prueba física.
- Al salir del debugger y volver a entrar puede aparecer *"Could not verify MD5"*; se recupera desconectando y
  volviendo a conectar el cable USB.
- Sólo Windows x64.

### Origen

- Editor: `JW-Control/openplc-editor`, rama `v2.1.0-alpha.15/OpenPLC-HMI/feature/designer-alpha14-en-openplc`
  (el tag apunta al commit que se compiló).
- HMI Designer: `JW-Control/platform-jwplc`, commit `c368f40a`
  (`v2.1.0-alpha.15/OpenPLC-HMI/feature/designer-alpha14-en-openplc`), `tools/jwplc-hmi-designer/poc`.
- VPP: `JW-Control/platform-jwplc`, commit `a8458dcd` (`v2.1.0-alpha.15/OpenPLC-HMI/feature/vpp-version-alpha15`),
  versión 2.1.0-alpha.15, firma `jwcontrol-2026` verificada antes de publicar.
