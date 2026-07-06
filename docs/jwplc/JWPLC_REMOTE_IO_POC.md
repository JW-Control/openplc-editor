# JWPLC Remote I/O PoC

## Estado

Etapa inicial de desarrollo.

## Objetivo

Validar el uso de un JWPLC Basic como controlador maestro y un segundo JWPLC Basic como dispositivo remoto/esclavo, simulando el comportamiento futuro de módulos de expansión JWPLC.

## Topología inicial

PC / OpenPLC Editor - JWPLC Edition
        |
        | USB para programación/debug
        |
JWPLC Basic Maestro
        |
        | Ethernet / Modbus TCP
        |
JWPLC Basic Esclavo

## Roles

### JWPLC Basic Maestro

- Ejecuta el programa principal OpenPLC.
- Actúa como Modbus Master/Client.
- Lee entradas remotas del JWPLC esclavo.
- Escribe salidas remotas del JWPLC esclavo.

### JWPLC Basic Esclavo

- Ejecuta un programa OpenPLC mínimo o runtime Modbus Server.
- Expone entradas y salidas mediante Modbus TCP.
- Representa una futura expansión JWPLC.

## Primera prueba

### Maestro lee entradas del esclavo

El maestro debe leer:

- I0_0..I0_7 del esclavo.

Estas señales serán mapeadas como variables remotas internas del programa del maestro.

### Maestro escribe salidas del esclavo

El maestro debe escribir:

- Q0_0..Q0_7 del esclavo.

Estas salidas serán controladas desde variables internas del programa del maestro.

## Transporte inicial

Primera fase:

- Modbus TCP sobre Ethernet W5500.

Motivo:

- Discovery nativo JWPLC ya validado.
- DHCP/IP estática ya validado.
- Menor fricción que RS-485 para la primera prueba.
- Permite enfocarse en Remote Devices y mapeo I/O.

Segunda fase:

- Modbus RTU sobre RS-485.

Motivo:

- Será el escenario más cercano a módulos de expansión físicos.

## Hipótesis de mapeo inicial

| Función | Modbus | Dirección | Longitud | Uso |
|---|---:|---:|---:|---|
| Leer entradas digitales del esclavo | FC2 | 0 | 8 | I0_0..I0_7 |
| Escribir salidas digitales del esclavo | FC15 | 0 | 8 | Q0_0..Q0_7 |
| Leer estado de salidas del esclavo | FC1 | 0 | 8 | Estado Q0_0..Q0_7 |

## Configuración inicial del JWPLC Basic Esclavo

- Board: JWPLC BASIC [2.0.0].
- Modbus TCP: habilitado.
- Interface: Ethernet W5500.
- DHCP: habilitado inicialmente.
- Puerto Modbus TCP: 502.
- Slave ID: 1.

## Configuración inicial del JWPLC Basic Maestro

- Board: JWPLC BASIC [2.0.0].
- Programa principal OpenPLC.
- Remote Device configurado como Modbus TCP.
- Host: IP detectada del JWPLC esclavo.
- Puerto: 502.
- Slave ID: 1.

## IO Groups propuestos para el maestro

### Grupo 1: Remote Digital Inputs

- Function Code: FC2 - Read Discrete Inputs.
- Offset: 0.
- Length: 8.
- Cycle Time: 50 ms o 100 ms.
- Uso: leer entradas digitales remotas del esclavo.

### Grupo 2: Remote Digital Outputs

- Function Code: FC15 - Write Multiple Coils.
- Offset: 0.
- Length: 8.
- Cycle Time: 50 ms o 100 ms.
- Uso: escribir salidas digitales remotas del esclavo.

### Grupo 3: Remote Output Feedback

- Function Code: FC1 - Read Coils.
- Offset: 0.
- Length: 8.
- Cycle Time: 100 ms.
- Uso: leer estado actual de salidas remotas.

## Criterio de éxito

- [ ] El maestro configura al esclavo como Remote Device.
- [ ] El maestro compila con configuración Modbus Master.
- [ ] El esclavo responde por Modbus TCP.
- [ ] El maestro lee 8 entradas digitales remotas.
- [ ] El maestro escribe 8 salidas digitales remotas.
- [ ] El debugger permite observar variables locales y remotas.
- [ ] El flujo puede documentarse para futuras expansiones JWPLC.

## No incluido en esta fase

- No se implementa discovery RS-485.
- No se cambia la IP del esclavo desde el editor.
- No se crea todavía catálogo final de módulos.
- No se modifica el package Arduino base.
- No se asume OTA.
- No se define aún el protocolo final de módulos de expansión.

## Evolución esperada

Esta prueba debe servir como base para una futura función del editor:

- Add JWPLC Remote I/O Device.
- Add JWPLC Expansion Module.
- Generación automática de Remote Devices.
- Generación automática de IO Groups.
- Mapeo automático de variables IEC.
- Diagnóstico de módulos remotos.

## Resultado esperado de producto

El usuario no debería configurar manualmente cada función Modbus.

El flujo ideal futuro sería:

1. Seleccionar JWPLC Basic como controlador principal.
2. Agregar un módulo remoto JWPLC.
3. Elegir transporte: Modbus TCP o Modbus RTU.
4. Asignar IP o Slave ID.
5. Generar automáticamente el mapa de entradas/salidas.
6. Programar en Ladder usando nombres claros.
