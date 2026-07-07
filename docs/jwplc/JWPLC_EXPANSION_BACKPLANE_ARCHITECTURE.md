# JWPLC Expansion Backplane Architecture

## Estado

Diseño inicial.

Este documento registra la decisión de usar una interfaz tipo Backplane Configuration para la futura configuración de módulos de expansión JWPLC dentro de OpenPLC Editor - JWPLC Edition.

## Decisión principal

La configuración final de módulos JWPLC no debe quedar expuesta únicamente como Remote Devices genéricos.

Remote Devices seguirá siendo la capa técnica interna para generar configuración Modbus Master, pero la experiencia de usuario final debe ser una pantalla tipo backplane o rack de módulos.

## Enfoque visual deseado

El usuario debería ver una configuración similar a:

Slot 1:
JWPLC Basic v2.0.0
Controlador principal

Slot 2:
JWPLC Expansion DI16
16 entradas digitales
Slave ID 2

Slot 3:
JWPLC Expansion DO16
16 salidas digitales
Slave ID 3

Slot 4:
JWPLC Expansion AI8
8 entradas analógicas
Slave ID 4

## Justificación

La configuración manual mediante Remote Devices es técnicamente correcta, pero poco amigable para usuarios finales.

Remote Devices requiere conocer detalles como:

- Function Code.
- Offset.
- Length.
- Cycle Time.
- Slave ID.
- Transporte Modbus.
- Direcciones IEC.

Para un ecosistema JWPLC, el flujo debe ser más cercano a fabricantes industriales:

1. Seleccionar controlador principal.
2. Agregar módulos de expansión.
3. Configurar dirección o Slave ID.
4. Ver canales disponibles.
5. Asignar alias.
6. Programar Ladder usando nombres claros.

## Relación con Remote Devices

Remote Devices queda como capa técnica.

La pantalla JWPLC Backplane debe generar o sincronizar internamente:

- Remote Devices.
- Configuración Modbus TCP o RTU.
- IO Groups.
- IEC addresses.
- Aliases.
- Cycle time.
- Slave ID.

El usuario avanzado podrá seguir usando Remote Devices directamente, pero el flujo recomendado para módulos JWPLC será Backplane Configuration.

## Primera prueba PoC

Antes de crear módulos JWPLC dedicados, se usará un segundo JWPLC Basic como módulo remoto.

Topología inicial:

PC con OpenPLC Editor - JWPLC Edition
|
USB para programación/debug
|
JWPLC Basic Maestro
|
Ethernet o RS-485 usando Modbus
|
JWPLC Basic Esclavo

## Roles

### JWPLC Basic Maestro

- Ejecuta el programa principal.
- Actúa como Modbus Master/Client.
- Lee entradas remotas.
- Escribe salidas remotas.

### JWPLC Basic Esclavo

- Actúa como dispositivo remoto.
- Expone entradas y salidas.
- Simula el comportamiento de una futura expansión JWPLC.

## Fase 1: Remote I/O manual

Objetivo:

Validar que el flujo técnico funcione usando Remote Devices.

Acciones:

- Habilitar Remote Devices para targets JWPLC.
- Crear un Remote Device Modbus.
- Agregar preset JWPLC Basic Remote I/O.
- Compilar.
- Subir al JWPLC maestro.
- Probar comunicación contra el JWPLC esclavo.

Criterio de éxito:

- El maestro compila con configuración Modbus Master.
- El maestro puede leer entradas remotas.
- El maestro puede escribir salidas remotas.
- El debugger permite observar variables asociadas.

## Fase 2: Backplane visual JWPLC

Objetivo:

Crear una pantalla propia para configurar módulos JWPLC usando el layout module-slots existente.

Pantalla propuesta:

JWPLC Backplane Configuration

Slots iniciales:

- Slot 1: JWPLC Basic v2.0.0
- Slot 2: JWPLC Basic Remote I/O
- Slot 3+: Reservado para futuras expansiones

Módulos iniciales:

- JWPLC Basic Remote I/O
- JWPLC Expansion DI16
- JWPLC Expansion DO16
- JWPLC Expansion 8DI/8DO
- JWPLC Expansion AI8
- JWPLC Expansion AO4
- JWPLC Expansion Relay8

## Fase 3: Descriptor de módulos JWPLC

Cada módulo debe tener un descriptor declarativo.

Campos propuestos:

- id
- name
- model
- description
- image
- transport
- defaultSlaveId
- defaultBaudRate
- channels
- modbusGroups
- defaultCycleTime
- allowedSlotRange

Ejemplo conceptual:

id: jwplc-expansion-di16
name: JWPLC Expansion DI16
transport: modbus-rtu
defaultSlaveId: 2
channels:
  - I1_0 digitalInput
  - I1_1 digitalInput
  - ...
modbusGroups:
  - FC2 offset 0 length 16

## Fase 4: Generación automática

Desde la pantalla Backplane se debe generar automáticamente:

- Remote Device por módulo.
- IO Groups por función.
- Direcciones IEC.
- Alias iniciales opcionales.
- Configuración Modbus Master.

Ejemplo:

Módulo: JWPLC Expansion DI16
Slave ID: 2

Genera:

Remote Device:
JWPLC_EXP_DI16_01

Transport:
Modbus RTU

IO Group:
Read Discrete Inputs
FC2
Offset 0
Length 16
Cycle Time 100 ms

## Fase 5: Diagnóstico

La pantalla debe mostrar estado de módulos:

- Configurado.
- Sin respuesta.
- Respondiendo.
- Error de timeout.
- Slave ID duplicado.
- Módulo detectado diferente al configurado.

## Decisiones pendientes

- Definir si el bus principal de expansión será Modbus RTU, Modbus TCP o ambos.
- Definir mapa Modbus final por familia de módulos.
- Definir si cada módulo tendrá firmware propio con discovery.
- Definir método de asignación de Slave ID.
- Definir si el Backplane podrá modificar parámetros del módulo.
- Definir si habrá modo avanzado para editar Remote Devices generados.

## No incluido todavía

- No se implementa discovery RS-485.
- No se modifica IP o Slave ID desde el editor.
- No se define todavía protocolo final de módulos.
- No se elimina Remote Devices.
- No se asume OTA.
- No se modifica el package Arduino base.

## Conclusión

El flujo recomendado para JWPLC Expansion será:

Backplane Configuration como interfaz de producto.

Remote Devices como backend técnico.

Modbus Master como mecanismo inicial de comunicación.

Esta arquitectura permite empezar con un JWPLC Basic como esclavo remoto y evolucionar luego hacia módulos JWPLC Expansion dedicados.
