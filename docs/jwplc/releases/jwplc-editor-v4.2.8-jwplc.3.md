## OpenPLC Editor – JWPLC Edition 4.2.8-jwplc.3 (pre-release)

Paquete para la plataforma **JWPLC 2.1.0-alpha.12** (core `jwplc:esp32 2.1.0-alpha.12`).

### Contenido

| Archivo | Qué es |
|---|---|
| `__EXE_NAME__` | Instalador de Windows x64 del editor |
| `jwplc-basic-openplc-2.1.0-alpha.26.jwcontrol-signed.vpp` | Paquete de placas JWPLC Basic (firmado por JW Control, clave `jwcontrol-2026`) |
| `SHA256SUMS.txt` | Sumas de verificación |

### Requisitos

- Windows 10/11 de 64 bits.
- Core de placas **JWPLC 2.1.0-alpha.12** instalado (paso 1). El VPP alpha.26 no compila
  con cores anteriores: el error dice *"requiere el package jwplc:esp32 2.1.0-alpha.12 o superior"*.

### Instalación

#### 1. Core JWPLC 2.1.0-alpha.12

El editor usa la misma carpeta de cores que el Arduino IDE (`%LOCALAPPDATA%\Arduino15`).

1. Abre el Arduino IDE → **Archivo › Preferencias** → *URLs adicionales del gestor de placas* y agrega:

   ```
   https://raw.githubusercontent.com/JW-Control/platform-jwplc/main/JWPLC/package_jwplc_index_dev.json
   ```

2. **Herramientas › Placa › Gestor de placas** → busca **JWPLC** → instala la versión **2.1.0-alpha.12**.

> Si en `Documentos\Arduino\libraries` tienes copias antiguas de `JWPLC_ModbusRTU`, `JWPLC_RS485`
> o `JWPLC_Ethernet` (por ejemplo `*_old`, `*_yo`), muévelas fuera de esa carpeta. Tienen el mismo
> nombre que las del core y se compilarían en su lugar con una API antigua.

#### 2. Editor

1. Ejecuta el instalador `.exe`.
2. El instalador **no tiene firma de código**, así que Windows SmartScreen mostrará un aviso:
   pulsa **Más información › Ejecutar de todas formas**.

#### 3. Paquete de placas (VPP)

1. Abre el editor → importa el paquete `jwplc-basic-openplc-2.1.0-alpha.26.jwcontrol-signed.vpp`.
2. El editor verifica la firma; si el archivo fue modificado lo rechaza (*Tampered file detected*).
3. Aparecen las placas **JWPLC BASIC [2.0.0]** y **JWPLC BASIC Remote IO [2.0.0]**.

### Qué incluye esta versión

- Backplane RS-485 con hasta 7 módulos Remote I/O (slots 2..8), baudrate 9600–115200 y formato 8N1/8E1/8O1.
- Validación de Slave ID (rango, entero y duplicados) en la interfaz y al compilar.
- Esclavo Remote I/O programable desde OpenPLC (placa *JWPLC BASIC Remote IO*).
- Serial2 reservado al bus del Backplane: el debugger debe usar **USB (Serial0)**; el editor detiene
  la compilación si Modbus RTU usa RS-485 (Serial2) con módulos Remote I/O.
- Correcciones de estabilidad del editor (bucles "Maximum update depth exceeded"), zoom en Ladder y en
  el editor de texto, consola/debugger acoplable a la derecha.

### Validado en banco

Con 1 maestro y hasta 2 esclavos JWPLC Basic: comunicación maestro ↔ esclavo a 115200/8N1 y
38400/8N1, esclavo programado desde OpenPLC, debugger por USB, salidas remotas con 8 patrones sin
bits cruzados, recuperación automática al desconectar y reconectar el RS-485, y multi-slot.

### Limitaciones conocidas

- Formato serie **8E1/8O1**: compila, pero no se ha probado físicamente.
- Entradas remotas (FC02) verificadas solo forzándolas desde el debugger, no con señales físicas.
- Al salir del debugger y volver a entrar puede aparecer *"Could not verify MD5"* (y tampoco se puede
  subir firmware). Se recupera desconectando y volviendo a conectar el cable USB. El cierre controlado
  del puerto que lo corrige está en una versión posterior.
- Sólo Windows x64.

### Origen

- Editor: `JW-Control/openplc-editor`. El tag apunta al commit de corte `d3ed3335f`
  (`develop/alpha12-backplane-closure`). El instalador se construyó en el
  [run 39501464185](https://github.com/JW-Control/openplc-editor/actions/runs/39501464185) desde `09378f606`,
  que es `d3ed3335f` más el cambio de versión a `4.2.8-jwplc.3` (`package.json` y lockfiles) y el workflow
  de build; no cambia código fuente.
- VPP: `JW-Control/platform-jwplc`, commit `1b54c7f9`
  (`v2.1.0-alpha.12/feature/openplc-engineering-closure`), versión 2.1.0-alpha.26.
