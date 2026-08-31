# Alpha7 — Nota de configuración: debugger USB/Serial0 + Backplane RS-485/Serial2

Fecha: 2026-08-31

## Motivo

La pantalla `Device > Modbus` y el `JWPLC Backplane` cumplen funciones distintas.

- `JWPLC Backplane` configura el **Master Remote I/O** que habla por RS-485/Serial2 con los módulos remotos.
- `Device > Modbus` configura el **servidor/slave Modbus local** del JWPLC. El VPP usa ese servidor también como transporte para el debugger Modbus del Editor.

Por tanto, hay dos configuraciones válidas según el gate.

## A. Baseline Remote I/O sin debugger online

Usar la configuración más simple:

```text
Device > Configuration
Communication Port = COM4

Device > Modbus
Enable Modbus RTU = OFF
Enable Modbus TCP = OFF

JWPLC Backplane
Slot 1 = JWPLC Basic local
Slot 2 = JWPLC Basic Remote I/O
Slave ID = 2
```

El Master Remote I/O sigue trabajando por:

```text
Serial2
115200
8N1
Slave remoto = 2
```

Este modo sirve para aislar FC02/FC15/FC01 del debugger.

## B. Debugger serial de OpenPLC + Remote I/O simultáneo

Para que el VPP ofrezca su canal de depuración `modbus-serial`, el servidor RTU local debe estar habilitado. Configurarlo sobre USB/Serial0, no sobre Serial2:

```text
Device > Configuration
Communication Port = COM4

Device > Modbus
Enable Modbus RTU = ON
Interface = USB (Serial0)
Debug Port = COM4
Baud Rate = 115200
Slave ID = 1
Use RS485 EN Pin = OFF

Enable Modbus TCP = OFF

JWPLC Backplane
Slot 1 = JWPLC Basic local
Slot 2 = JWPLC Basic Remote I/O
Slave ID = 2
```

La separación esperada es:

```text
PC / OpenPLC debugger
        |
        | USB / COM4 / Serial0
        v
JWPLC Master
        |
        | RS-485 / Serial2 / 115200 / 8N1
        v
JWPLC Remote I/O Slave ID 2
```

`Slave ID = 1` en `Device > Modbus` identifica al servidor local que atiende al debugger. No cambia el `Slave ID = 2` del módulo remoto del Backplane.

El JWPLC usa MAX13487E con autodirección en RS-485, por lo que `Use RS485 EN Pin` debe permanecer deshabilitado para el hardware normal.

## Gate requerido

La coexistencia todavía debe validarse físicamente. No marcar PASS sólo porque la configuración sea coherente.

Observar simultáneamente:

```text
M_REMOTE_IN
%IX1.0
%QX0.0
%QX1.0
```

Resultado esperado:

```text
OPENPLC_DEBUGGER_SERIAL0=PASS|FAIL|REVIEW
BACKPLANE_MASTER_SERIAL2_DURING_DEBUG=PASS|FAIL
DEBUG_AND_REMOTE_IO_COEXISTENCE=PASS|FAIL
```

Si el debugger falla pero la entrada/salida Remote I/O funciona físicamente, registrar el debugger como `REVIEW` y mantener separado el resultado del protocolo RTU.
