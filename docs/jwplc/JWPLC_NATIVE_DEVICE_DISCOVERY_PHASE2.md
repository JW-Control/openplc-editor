# JWPLC Native Device Discovery - Fase 2

## Estado

Cerrado y validado.

Esta fase mejora el JWPLC Device Discovery para que el editor no dependa únicamente de detectar equipos con el puerto Modbus TCP 502 abierto.

Ahora el JWPLC Basic responde con identidad propia mediante discovery nativo UDP y el editor puede diferenciar entre:

- JWPLC confirmado.
- Equipo Modbus TCP genérico detectado por fallback.

## Versión

- Editor: OpenPLC Editor - JWPLC Edition 4.2.8-jwplc.2
- Hardware validado: JWPLC Basic v2.0.0
- Board: JWPLC BASIC [2.0.0]
- VPP compatible: com.jwcontrol.jwplc-basic v2.1.0-alpha.11

## Instalador validado

Archivo:

OpenPLC Editor - JWPLC Edition_4.2.8-jwplc.2.exe

SHA256:

0952C753DC11C1AD34FDB3BD6A92E596A1929E024A8AD094A5D1203D4F74EFDA

## Cambios principales

### Discovery nativo JWPLC

Se agregó un responder UDP en el runtime Baremetal para JWPLC Basic.

Solicitud:

JWPLC_DISCOVER_V1

Respuesta:

JWPLC_DEVICE_V1

La respuesta incluye:

- Vendor.
- Modelo.
- IP asignada.
- MAC.
- Puerto Modbus TCP.
- Modo de red: DHCP o STATIC.

### Discovery del lado del editor

El backend del editor ahora intenta primero discovery nativo JWPLC.

Si no obtiene respuesta, mantiene fallback por escaneo de puerto TCP 502.

### UI mejorada

La pantalla Modbus TCP ahora muestra una lista de dispositivos encontrados con:

- Nombre/modelo.
- Estado JWPLC confirmado.
- IP y puerto.
- Tipo de discovery.
- MAC.
- Modo DHCP/static.
- Interfaz de red detectada.

### Comportamiento de Usar para Debug

Con DHCP activo:

- Actualiza Debug IP Address.

Con DHCP desactivado:

- Actualiza Debug IP Address.
- Actualiza IP Address.

## Validación realizada

- [x] Build main OK.
- [x] Build renderer OK.
- [x] Instalador generado.
- [x] Editor abre correctamente.
- [x] Modbus TCP activo con Ethernet W5500.
- [x] DHCP activo.
- [x] Discovery detecta JWPLC Basic.
- [x] UI muestra JWPLC confirmado.
- [x] UI muestra Discovery nativo.
- [x] UI muestra MAC, DHCP e interfaz.
- [x] Usar para Debug actualiza Debug IP Address.
- [x] Debugger TCP probado con IP detectada.

## No incluido

- No se cambia la IP del JWPLC desde el editor.
- No se implementa protocolo industrial tipo DCP.
- No se modifica OTA.
- No se modifica el package Arduino base.
- No se modifica el VPP en esta fase.

## Resultado

JWPLC Device Discovery pasa de ser un escaneo genérico de Modbus TCP a una identificación nativa de JWPLC Basic, manteniendo compatibilidad con fallback TCP 502.
