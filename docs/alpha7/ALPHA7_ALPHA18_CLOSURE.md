# Alpha7 — Cierre Alpha18: servicio cooperativo, Remote I/O y debugger TCP

Fecha de cierre: 2026-09-01

## Estado

```text
ALPHA18_STATUS=CLOSED
ALPHA18_RUNTIME_VALIDATION=PASS
ALPHA18_DEBUGGER_GATE=PASS
ALPHA18_PUBLICATION=PASS
```

Alpha18 cierra la integración del servicio cooperativo de hardware necesario para mantener operativo el Backplane Remote I/O del JWPLC Basic dentro del runtime Baremetal de OpenPLC sin introducir concurrencia adicional ni bloquear el ciclo IEC.

La validación cubre específicamente:

- OpenPLC ejecutando el programa IEC en el JWPLC Basic Master.
- Backplane Remote I/O Modbus RTU sobre RS-485 / Serial2.
- Remote I/O Slave ID 2.
- Modbus TCP del runtime OpenPLC sobre Ethernet W5500.
- Debugger online del OpenPLC Editor utilizando ese servidor Modbus TCP.
- Pérdida y recuperación del Slave.
- Reset del Master.
- Power-cycle del Slave.
- Comportamiento temporal del scan IEC y del servicio RTU.

No se interpreta este gate como validación de todas las combinaciones posibles de protocolos o cargas del producto.

## 1. Commits de cierre publicados

### OpenPLC Editor

```text
branch: develop/alpha7-openplc-remote-io-rtu
commit: 2adff7733d0aa33801514cf58954c2350e0b7143
subject: feat(alpha7): integrar servicio hardware cooperativo alpha18
```

### Platform JWPLC

```text
branch: v2.1.0-alpha.7/feature/openplc-backplane-validation
commit: 26160ab5f7f58fd25aea1ef846b9b85d64f55d6b
subject: feat(alpha7): consolidar VPP alpha18 y preservar payload firmado
```

Después de la publicación:

```text
OPENPLC_DIVERGENCE=0/0
PLATFORM_DIVERGENCE=0/0
FORCE_PUSH_USED=NO
```

## 2. Arquitectura Alpha18

Se incorporó el hook cooperativo:

```cpp
hardwareService()
```

Contrato implementado:

1. `openplc.h` declara `hardwareService()`.
2. Baremetal proporciona una implementación `weak` por defecto.
3. El HAL JWPLC proporciona la implementación `strong`.
4. El loop de OpenPLC llama al servicio únicamente durante tiempo idle, cuando todavía no corresponde ejecutar el siguiente scan IEC.
5. No se introduce una tarea FreeRTOS adicional.
6. No se ejecutan transacciones RTU concurrentes desde dos contextos.
7. No se modifica la API pública ya validada de `JWPLC_ModbusRTU`.

Configuración temporal del servicio:

```text
JWPLC_REMOTE_IDLE_SERVICE_PERIOD_US=1000
```

Configuración RTU conservada:

```text
Serial2
115200
8N1
Master timeout = 250 ms
Frame gap      = 2 ms
```

La comprobación del ELF confirmó que el firmware enlaza la implementación `strong` del HAL JWPLC:

```text
T hardwareService
```

## 3. Topología validada

```text
OpenPLC Editor / PC
        |
        | Ethernet / Modbus TCP
        | debugger OpenPLC
        v
+---------------------------+
| JWPLC Basic Master        |
|                           |
| OpenPLC IEC runtime       |
| W5500 / TCP 502           |
|                           |
| Backplane Master          |
| Serial2 / RS-485          |
+-------------+-------------+
              |
              | Modbus RTU
              | 115200 8N1
              v
+---------------------------+
| JWPLC Basic Remote I/O    |
| Slave ID = 2              |
+---------------------------+
```

USB/Serial0 continúa disponible para programación y diagnóstico serial.

El Backplane Remote I/O no depende del servidor Modbus RTU local de OpenPLC.

Durante el gate simultáneo:

```text
MBSERIAL=OFF
MBTCP=ON
Backplane RTU Serial2=ON
```

Por tanto, el PASS simultáneo de Alpha18 significa:

```text
JWPLC Backplane RTU + OpenPLC Modbus TCP/W5500 = PASS
OpenPLC debugger TCP + JWPLC Backplane RTU     = PASS
```

No significa que Modbus RTU local, Modbus TCP y Backplane RTU hayan sido ensayados todos simultáneamente.

## 4. Timing RTU Alpha18 sin debugger

| Métrica | Resultado |
|---|---:|
| Scan IEC promedio | 20.002 ms |
| Servicio hardware | 1.000 ms |
| Poll FC02 | 10.272 ms |
| RTT FC02 | 3.454 ms |
| RTT FC15 | 3.726 ms |
| Ciclo FC15 | 10.272 ms |
| Detección lógica → ACK | 19.958 ms |
| Físico estimado → ACK | 28.548 ms |

Errores:

```text
FC02_FAILURES=0
FC15_FAILURES=0
```

Como referencia, en Alpha17 se había estimado aproximadamente:

```text
PHYSICAL_TO_ACK_ALPHA17 ~= 57.551 ms
```

Alpha18 reduce de forma importante la latencia observada sin retirar periféricos ni cambiar el contrato RTU.

## 5. Gate A — TCP habilitado, Editor cerrado

Duración: 120 s.

```text
TCP_502_PRE=LISTENING
TCP_502_POST=LISTENING
FC02_FAILURES=0
FC15_FAILURES=0
INPUT_CHANGES=76
Q_CHANGES=76
DEBUG_CONTROL_A=PASS
```

Promedios observados:

| Métrica | Resultado |
|---|---:|
| Scan IEC | 19.994 ms |
| Servicio | 2.750 ms |
| Poll FC02 | 17.661 ms |
| RTT FC02 | 5.573 ms |
| RTT FC15 | 5.610 ms |
| Ciclo FC15 | 17.661 ms |
| Entrada → Q | 6.189 ms |
| Q → FC15 | 13.259 ms |
| Detección → ACK | 25.058 ms |
| Físico estimado → ACK | 33.889 ms |

## 6. Gate B — Editor abierto, debugger apagado

```text
FC02_FAILURES=0
FC15_FAILURES=0
TCP_DEBUG_SESSION_COUNT=0
DEBUG_CONTROL_B=PASS
```

Promedios:

| Métrica | Resultado |
|---|---:|
| Scan IEC | ~20.001 ms |
| Servicio | ~2.727 ms |
| Poll FC02 | 18.063 ms |
| RTT FC02 | 6.318 ms |
| RTT FC15 | 5.945 ms |
| Ciclo FC15 | 18.063 ms |

Durante la fase final aparecieron más transiciones contabilizadas que las generadas por el toggle controlado. Se clasificó como artefacto del probe y no se utilizó Gate B para comparar fidelidad de flancos. El transporte y el timing permanecieron válidos.

## 7. Gate C — debugger OpenPLC activo

Durante 120 s:

```text
TCP_SESSION_SAMPLES=111/111
TCP_MAX_SIMULTANEOUS_SESSIONS=1
FC02_FAILURES=0
FC15_FAILURES=0
INPUT_CHANGE_DELTA=156
Q_CHANGE_DELTA=154
```

El debugger permaneció conectado mientras el Backplane RTU continuó ejecutándose.

Los toggles rápidos del probe pueden coalescer varios flancos antes de que la instrumentación los correlacione, por lo que la diferencia 156/154 no se utilizó como criterio de fallo del protocolo.

```text
TCP_DEBUGGER_SESSION_STABLE=PASS
RTU_TRANSPORT_WITH_DEBUGGER=PASS
PLC_SCAN_REGRESSION_WITH_DEBUGGER=NO
FAST_EDGE_CORRELATION=REVIEW
```

## 8. Gate C2 — fidelidad con flancos lentos

Se ejecutaron diez ciclos ON/OFF con aproximadamente 2 s por estado.

```text
EXPECTED_EDGES=20
INPUT_CHANGES=20
Q_CHANGES=20
SLOW_EDGE_CORRELATION=20/20
COUNTER_GAP_INITIAL=6
COUNTER_GAP_FINAL=6
COUNTER_GAP_GROWTH=0
FC02_FAILURES=0
FC15_FAILURES=0
TCP_CONNECTED_SAMPLES=75/75
```

Resultado final:

```text
ALPHA18_DEBUGGER_GATE=PASS
MODBUS_TCP_SERVER_WITH_RTU_BACKPLANE=PASS
OPENPLC_DEBUGGER_TCP_WITH_RTU_BACKPLANE=PASS
TCP_DEBUGGER_SESSION_STABLE=PASS
RTU_FC02_FAILURES=0
RTU_FC15_FAILURES=0
PLC_SCAN_REGRESSION_WITH_DEBUGGER=NO
SLOW_EDGE_CORRELATION=20/20
COUNTER_GAP_GROWTH=0
OPENPLC_RTU_TCP_SIMULTANEOUS_REVALIDATION=PASS
```

## 9. Robustez validada

Antes del cierre Alpha18 también se ejecutaron gates autónomos sobre el mismo runtime:

```text
SOAK_10_MIN=PASS
RS485_LINK_LOSS_RECOVERY=PASS
MASTER_RESET_FAILSAFE=PASS
SLAVE_COLD_BOOT_REJOIN=PASS
NONBLOCKING_SCAN_DURING_250MS_FAILURE=PASS
```

En la prueba de power-cycle del Slave:

- las salidas remotas cayeron durante el reset inicial del Master;
- regresaron automáticamente al completar el arranque;
- el Slave arrancó normalmente tras devolverle 24 V;
- comunicación y salida regresaron sin reiniciar el Master;
- el Ladder del Master continuó ejecutándose con el Slave apagado;
- no quedaron estados pegados tras la recuperación.

Los timeouts durante una ausencia física del Slave se consideran comportamiento esperado del enlace, siempre que el Master permanezca operativo y la comunicación se recupere al regresar el nodo.

## 10. VPP Alpha18

La versión validada del paquete VPP es:

```text
2.1.0-alpha.18
```

```text
SIGNED_FILE_COUNT=9
SIGNED_PAYLOAD_PHYSICAL=9/9
FRESH_CHECKOUT_SIGNED_PAYLOAD=9/9
```

El detalle de reproducibilidad, firma y política EOL queda documentado en Platform JWPLC.

## 11. Hallazgo de reproducibilidad EOL

Durante la preservación de Alpha18 se detectó que la firma existente fue calculada sobre bytes físicos del working tree y no sobre un formato textual canónico único.

El payload validado contiene históricamente:

```text
6 archivos de texto firmados en CRLF
2 archivos de texto firmados en LF
1 archivo binario
signature.json en LF
```

Para no invalidar Alpha18, Platform preserva explícitamente esos bytes mediante `.gitattributes`.

```text
PRESERVE_VALIDATED_ALPHA18_BYTES=YES
RESIGN_ALPHA18_WITH_DIFFERENT_EOL=NO
SIGNER_CANONICAL_TEXT_FORMAT=PENDING
```

Antes de cambiar el algoritmo o proceso de firma se deberá decidir y documentar un formato canónico para texto, independiente de `core.autocrlf`.

## 12. Lo que Alpha18 no cierra

Permanece pendiente:

```text
FC01_OUTPUT_FEEDBACK=PENDING
ALL_8_REMOTE_CHANNELS_EXPLICIT_VALIDATION=PENDING
MULTIDROP_OPENPLC_BACKPLANE=PENDING
```

`JWPLC_ModbusRTU` ya validó físicamente FC01, FC02, FC05 y FC15 en la ruta Arduino ↔ Arduino.

En el HAL OpenPLC actual, el flujo principal validado es esencialmente:

```text
FC15 WRITE OUTPUTS
      ↓
FC02 READ DISCRETE INPUTS
      ↓
repeat
```

El siguiente gate debe revisar la API real del HAL y de `JWPLC_ModbusRTU` antes de modificar código. No asumir nombres ni contratos sin inspeccionarlos.

Objetivo conceptual:

```text
FC15 WRITE requested outputs
      ↓
FC01 READ actual coils
      ↓
compare requested vs feedback
      ↓
FC02 READ discrete inputs
      ↓
repeat
```

Estados conceptuales que podrán resultar útiles, sin constituir todavía una API aprobada:

```text
requestedOutputs
feedbackOutputs
feedbackValid
feedbackMismatch
```

## 13. Próximo gate

```text
NEXT_GATE=FC01_OUTPUT_FEEDBACK
```

Antes de editar:

1. inspeccionar el HAL `jwplcbasic.cpp` actual;
2. inspeccionar la API actual de `JWPLC_ModbusRTU`;
3. identificar la operación FC01 disponible;
4. definir el estado de feedback sin romper la API existente;
5. implementar de forma cooperativa;
6. compile-check;
7. prueba física OFF → ON → OFF;
8. ampliar después a los ocho canales remotos.

No avanzar al siguiente gate Alpha7 hasta cerrar explícitamente FC01 o registrar su resultado como pendiente/review.

## 14. Conclusión Alpha18

Alpha18 demuestra que OpenPLC puede mantener simultáneamente:

```text
IEC runtime
+ JWPLC Remote I/O RTU sobre Serial2
+ Ethernet W5500
+ servidor Modbus TCP
+ debugger OpenPLC TCP
```

sin regresión observada del scan IEC y sin fallos FC02/FC15 durante los gates de coexistencia realizados.

El mecanismo `hardwareService()` cooperativo queda aceptado como base para continuar Alpha7.

```text
ALPHA18=CLOSED
NEXT=FC01_OUTPUT_FEEDBACK
```
