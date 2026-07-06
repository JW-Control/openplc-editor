# OpenPLC Editor - JWPLC Edition 4.2.8-jwplc.1

## Estado

Cerrado y validado para JWPLC Basic v2.0.0.

Esta versión integra el flujo de OpenPLC Editor 4.2.8 con soporte específico para JWPLC Basic mediante VPP firmado, Modbus RTU, Modbus TCP sobre Ethernet W5500, DHCP, IP estática, Debug IP Address y JWPLC Device Discovery.

## Versiones

- Base upstream: OpenPLC Editor 4.2.8
- Build JW Control: OpenPLC Editor - JWPLC Edition 4.2.8-jwplc.1
- VPP validado: com.jwcontrol.jwplc-basic v2.1.0-alpha.11
- Board: JWPLC BASIC [2.0.0]
- Arduino core usado por compilación: jwplc:esp32
- Hardware objetivo: JWPLC Basic v2.0.0

## Instalador validado

Archivo:

OpenPLC Editor - JWPLC Edition_4.2.8-jwplc.1.exe

SHA256:

AAE4EB74C53CB850D972246E740F8DFB7B382EA8CAB313E67D3DACB2E8BD85DF

## Cambios principales del editor

### Identificación JWPLC Edition

Se mantiene una edición diferenciada del editor para JW Control, basada en OpenPLC Editor, con nombre de paquete, descripción y versión propios.

### Soporte de VPP firmado por JW Control

El editor acepta paquetes VPP firmados por JW Control para instalar el soporte de JWPLC Basic desde el Package Manager.

### Corrección de nombres de board con corchetes

Se corrigió el manejo de nombres de placa como:

JWPLC BASIC [2.0.0]

Antes, el frontend recortaba el nombre al encontrar corchetes y podía perder acceso a la información de specs, preview o configuración asociada al VPP.

### Modbus RTU

Se validó Modbus RTU usando:

- Serial0 / USB
- Serial2 / RS-485 / JWPLC_RS485

El debugger puede comunicarse por el puerto configurado para depuración RTU.

### Modbus TCP sobre W5500

Se integró soporte para Modbus TCP usando Ethernet W5500 en JWPLC Basic.

Se validaron dos modos:

- IP estática.
- DHCP.

### JWPLC Device Discovery

Se agregó un campo personalizado de interfaz:

JWPLC Device Discovery

Este permite buscar dispositivos JWPLC disponibles en la red local con Modbus TCP activo en el puerto 502.

El flujo validado fue:

1. Activar Modbus TCP.
2. Seleccionar Ethernet - W5500.
3. Activar DHCP o configurar IP estática.
4. Compilar y subir el programa.
5. Buscar JWPLC en la red.
6. Seleccionar el dispositivo detectado.
7. Usar su IP para debug.

### Debug IP Address

Se agregó el campo:

Debug IP Address

Este campo separa la IP usada para depuración de la IP configurada para el firmware.

Esto permite trabajar con DHCP sin depender de una IP fija escrita manualmente antes de compilar.

Si Debug IP Address está vacío, el debugger puede usar como respaldo la IP configurada en Modbus TCP.

### Debugger con gráfica temporal

Se corrigió el comportamiento de la gráfica del debugger para que continúe desplazándose aunque las variables no cambien.

La actualización quedó validada con intervalo de 100 ms.

## Checklist de validación

- [x] Instalar/cargar VPP JWPLC Basic alpha actual.
- [x] Ver Board Settings: imagen, specs y pin mapping.
- [x] Compilar/subir un ladder mínimo por USB.
- [x] Modbus RTU por USB Serial0.
- [x] Modbus RTU por RS-485 Serial2/JWPLC_RS485.
- [x] Debugger por RTU usando Debug Port.
- [x] Ver que la gráfica siga desplazándose aunque la variable no cambie.
- [x] Modbus TCP con IP estática.
- [x] Modbus TCP con DHCP.
- [x] JWPLC Device Discovery.
- [x] Debugger por TCP usando Debug IP Address.
- [x] Build final del instalador.
- [x] Verificación visual del editor, board, VPP y pantallas modificadas.

## Flujo recomendado de uso

### Modbus RTU por RS-485

1. Instalar VPP JWPLC Basic.
2. Seleccionar JWPLC BASIC [2.0.0].
3. Ir a Modbus.
4. Activar Modbus RTU.
5. Seleccionar RS-485 (Serial2).
6. Seleccionar el Debug Port correspondiente.
7. Compilar y subir.
8. Iniciar debugger.

### Modbus TCP con IP estática

1. Activar Modbus TCP.
2. Seleccionar Ethernet - W5500.
3. Desactivar DHCP.
4. Configurar IP Address, Gateway, Subnet Mask y DNS.
5. Compilar y subir.
6. Usar esa IP para Debug IP Address.
7. Iniciar debugger.

### Modbus TCP con DHCP + Discovery

1. Activar Modbus TCP.
2. Seleccionar Ethernet - W5500.
3. Activar DHCP.
4. Compilar y subir.
5. Esperar a que el JWPLC obtenga IP.
6. Usar JWPLC Device Discovery.
7. Presionar Usar para Debug.
8. Iniciar debugger.

## Decisiones técnicas

- No se integró OpenPLC como parte del package Arduino general.
- No se asumió OTA.
- No se modificó la configuración final de FlashFreq.
- No se publicó bootloader.bin como definitivo.
- No se removieron periféricos del autoload normal del JWPLC Basic.
- El soporte de discovery queda del lado de OpenPLC Editor JWPLC Edition y del VPP.
- El VPP define la experiencia de usuario específica para JWPLC Basic.
- El editor mantiene compatibilidad con VPP y con el flujo estándar de OpenPLC Editor.

## Observaciones

El discovery actual busca equipos con puerto TCP 502 accesible en la red local. No implementa un protocolo industrial tipo Siemens DCP ni cambia IPs de dispositivos automáticamente.

Para conexión directa laptop-JWPLC sin router, se recomienda usar IP estática en ambos extremos o montar un servidor DHCP local. El flujo más simple para usuarios finales sigue siendo router/switch con DHCP.

## Resultado

La integración queda validada para uso interno de JW Control y pruebas de publicación controlada como JWPLC Edition basada en OpenPLC Editor.
