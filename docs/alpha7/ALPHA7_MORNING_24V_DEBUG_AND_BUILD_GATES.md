# Alpha7 — Gates de mañana: 24 V, depuración y primera compilación

Fecha de preparación: 2026-08-31

## Estado de partida

Ya se comprobó físicamente en OpenPLC:

```text
OPENPLC_MASTER_UPLOAD=PASS
BACKPLANE_RTU_MASTER=PASS
SLAVE_ID_2_COMMUNICATION=PASS
FC15_REMOTE_OUTPUT=PASS
LOCAL_Q0_0=PASS
REMOTE_Q0_0=PASS
LOCAL_REMOTE_OUTPUT_SYNC=PASS
```

Quedan pendientes explícitos:

```text
FC02_REMOTE_INPUT=PENDING_24V_BENCH
FC01_OUTPUT_FEEDBACK=PENDING_EXPLICIT_TEST
OPENPLC_DEBUGGER_REMOTE_IO=PENDING_RUNTIME_TEST
FIRST_BUILD_LIBRARY_SCOPE=PENDING_RUNTIME_TEST
FIRST_BUILD_SPEED_IMPROVEMENT=PENDING_MEASUREMENT
PROJECT_NAMED_FOLDER=PENDING_UI_TEST
MULTIDROP=PENDING
```

No convertir ningún pendiente en PASS sin ejecutar el gate correspondiente.

---

## 1. Configuración OpenPLC correcta para el Master Backplane

Para el escenario actual, la pantalla `Device > Modbus` NO configura el Master del Backplane. Configura el servidor/slave Modbus del propio controlador OpenPLC.

Dejar:

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

Contrato del Backplane:

```text
RS-485 = Serial2
Baud    = 115200
Formato = 8N1

Slot 1 local:
%IX0.0..%IX0.7
%QX0.0..%QX0.7

Slot 2 remoto:
%IX1.0..%IX1.7
%QX1.0..%QX1.7
```

USB/Serial0 queda para upload y depuración por COM4. RS-485/Serial2 queda para Remote I/O.

---

## 2. Gate software nocturno

Se prepararon dos cambios independientes:

1. `Apply-VppScopedArduinoLibraries.ps1`
   - los targets VPP usan únicamente dependencias Arduino declaradas por su manifest;
   - no intentan provisionar en la primera compilación librerías globales históricas de placas no relacionadas;
   - las placas built-in conservan el comportamiento legacy.

2. `Apply-ProjectNamedFolder.ps1`
   - si el usuario selecciona `C:\...\OpenPLC` y crea `CONTROL_BOMBAS`, el proyecto se crea en `C:\...\OpenPLC\CONTROL_BOMBAS`;
   - si la carpeta elegida ya termina en `CONTROL_BOMBAS`, no crea `CONTROL_BOMBAS\CONTROL_BOMBAS`;
   - History usa la ruta raíz final.

El agregador `Invoke-Alpha7NightBatchValidation.ps1` aplica ambos y ejecuta TypeScript + `git diff --check`.

---

## 3. Gate de primera compilación / provisioning Arduino

### Hallazgo

El Editor mantiene una lista global histórica de librerías Arduino para varias placas. En la primera compilación intenta resolver/provisionar esa lista y, una vez instalada/cacheada, el ruido desaparece en compilaciones posteriores.

Para targets VPP, el manifest ya tiene su contrato de dependencias por placa. El cambio Alpha7 evita que un JWPLC VPP tenga que recorrer dependencias ajenas de otras familias.

### Validación runtime

Después de aplicar el parche y reiniciar OpenPLC DEV, hacer una compilación JWPLC y conservar el log completo.

Debe aparecer:

```text
VPP library scope: skipping unrelated legacy global Arduino libraries; using manifest dependencies only.
```

No debe aparecer una secuencia de instalación/provisioning causada por la lista global legacy, por ejemplo:

```text
Arduino_EdgeControl
Arduino_MachineControl
CONTROLLINO
P1AM
Portenta_H7_PWM
RP2040_PWM
STM32_CAN
STM32_PWM
WiFiNINA
```

si esas librerías no están declaradas por el VPP JWPLC.

Resultado:

```text
FIRST_BUILD_LIBRARY_SCOPE=PASS|FAIL
```

La mejora de tiempo es un gate distinto. No declarar velocidad mejorada sólo por reducir el ruido del log.

Para medir formalmente más adelante registrar al menos:

```text
host
commit
FQBN
cold/warm
tiempo total
tiempo Arduino CLI
log
resultado
```

Resultado de tiempos:

```text
FIRST_BUILD_SPEED_IMPROVEMENT=PENDING_MEASUREMENT
```

---

## 4. Gate de creación de carpeta por nombre

Crear un proyecto temporal:

```text
Parent seleccionado:
C:\Users\jeykc\Documentos\Programacion\OpenPLC

Nombre:
ALPHA7_FOLDER_TEST
```

Esperado:

```text
C:\Users\jeykc\Documentos\Programacion\OpenPLC\ALPHA7_FOLDER_TEST\
  project.json
  devices\
  pous\
  ...
```

No esperado:

```text
C:\Users\jeykc\Documentos\Programacion\OpenPLC\project.json
```

ni:

```text
...\ALPHA7_FOLDER_TEST\ALPHA7_FOLDER_TEST\
```

Cerrar/reabrir el proyecto desde Recent y verificar que sigue apuntando a la carpeta final.

Resultado:

```text
PROJECT_NAMED_FOLDER=PASS|FAIL
PROJECT_HISTORY_FINAL_ROOT=PASS|FAIL
```

---

## 5. Gate FC02 con entrada física de 24 V

### Topología

```text
PC
  USB COM4
    |
    v
JWPLC Master OpenPLC
    |
    | RS-485 Serial2 / 115200 / 8N1
    |
    v
JWPLC Slave Arduino / ID 2
```

Mantener el Slave Arduino ya validado.

### Cableado de prueba

Las entradas JWPLC Basic son de 24 VDC, tipo sinking, con común de 0 V/GND y señal compatible sourcing/PNP.

Para el banco:

```text
Fuente 0 V  -> referencia/común 0 V del JWPLC Slave
Fuente +24 V -> I0_0 del JWPLC Slave durante la activación
```

No aplicar 24 V a pines ESP32, USB ni señales lógicas internas.

### Ladder recomendado

Usar una memoria o condición intermedia para no mezclar estado lógico y salida física.

Conceptualmente:

```text
%IX1.0 (entrada remota)
        |
        +----> M_REMOTE_IN

M_REMOTE_IN
        +----> %QX0.0  salida local Master
        +----> %QX1.0  salida remota Slave
```

Así una sola entrada física remota produce dos evidencias simultáneas: una salida local y una salida remota.

### Secuencia

Ejecutar al menos diez ciclos:

```text
A. I0_0 sin +24 V
   esperado %IX1.0 = 0
   Q local OFF
   Q remota OFF

B. aplicar +24 V a I0_0
   esperado %IX1.0 = 1
   Q local ON
   Q remota ON

C. retirar +24 V
   esperado %IX1.0 = 0
   Q local OFF
   Q remota OFF
```

Criterios:

```text
FC02_REMOTE_INPUT=PASS|FAIL
REMOTE_INPUT_IEC_ADDRESS=PASS|FAIL
REMOTE_INPUT_TO_LOCAL_OUTPUT=PASS|FAIL
REMOTE_INPUT_TO_REMOTE_OUTPUT=PASS|FAIL
NO_BIT_SHIFT=PASS|FAIL
```

---

## 6. Gate de depuración OpenPLC

No usar `Device > Modbus > Debug Port` para convertir el Backplane en Master: esa pantalla pertenece al servidor/slave Modbus local.

La depuración que queremos validar es la del programa IEC/OpenPLC sobre el firmware cargado por COM4.

Variables recomendadas para observar simultáneamente:

```text
M_REMOTE_IN
%IX1.0   entrada remota
%QX0.0   salida local
%QX1.0   salida remota
```

Durante el gate FC02, activar el modo de debug/watch disponible en el Editor y comprobar que los cuatro estados siguen la señal física.

Criterio:

```text
OPENPLC_DEBUGGER_LOCAL_MEMORY=PASS|FAIL
OPENPLC_DEBUGGER_REMOTE_INPUT=PASS|FAIL
OPENPLC_DEBUGGER_LOCAL_OUTPUT=PASS|FAIL
OPENPLC_DEBUGGER_REMOTE_OUTPUT=PASS|FAIL
```

Si el debugger no logra adjuntarse al target Arduino/JWPLC, registrar:

```text
OPENPLC_DEBUGGER_REMOTE_IO=REVIEW
```

y separar el problema de depuración del protocolo RTU. Un FC02 físico correcto no debe ocultarse como FAIL de Modbus sólo porque el debugger necesite implementación adicional.

---

## 7. Gate FC01 — feedback explícito de salidas

La salida remota `%QX1.x` representa el comando deseado. FC01 debe comprobarse de manera explícita como lectura de coils/feedback del Slave; no inferir PASS únicamente porque el relé se accionó con FC15.

Antes del gate físico revisar el código generado/log de runtime y confirmar dónde se consume `requestReadCoils()` y cómo se reporta un desacuerdo.

Prueba mínima:

```text
1. ordenar Q0_0 remoto OFF
2. leer FC01 -> esperado 0
3. ordenar Q0_0 remoto ON
4. leer FC01 -> esperado 1
5. ordenar Q0_0 remoto OFF
6. leer FC01 -> esperado 0
```

Resultado:

```text
FC01_OUTPUT_FEEDBACK=PASS|FAIL
```

Si el backend ya lee FC01 pero todavía no expone el valor al debugger/UI, distinguir:

```text
FC01_PROTOCOL_FEEDBACK=PASS
FC01_DEBUG_VISIBILITY=PENDING
```

---

## 8. Robustez 1:1 después de FC01/FC02

Sólo después de cerrar FC01 + FC02:

### Desconexión/reconexión RS-485

```text
1. sistema operativo y comunicando
2. desconectar A/B unos segundos
3. confirmar que Master no se bloquea ni reinicia
4. reconectar
5. confirmar recuperación sin reset del Master
```

### Reset del Slave

```text
1. comunicación activa
2. reset/power-cycle del Slave
3. Master permanece vivo
4. al volver Slave, comunicación se recupera
```

Marcadores:

```text
RS485_DISCONNECT_RECOVERY=PASS|FAIL
SLAVE_RESET_RECOVERY=PASS|FAIL
MASTER_RESET_RECOVERY=PENDING|PASS|FAIL
```

---

## 9. Multidrop

No mezclar con el primer gate de 24 V. Mantener:

```text
MULTIDROP=PENDING
```

Después de cerrar el enlace 1:1, ampliar a:

```text
Master OpenPLC
  -> Slave ID 2
  -> Slave ID 3
```

con IDs únicos y el contrato del Backplane ya validado.

---

## 10. Criterio de cierre de esta tanda

La tanda de mañana puede considerarse completa cuando exista evidencia para:

```text
PROJECT_NAMED_FOLDER
FIRST_BUILD_LIBRARY_SCOPE
FC02_REMOTE_INPUT
OPENPLC_DEBUGGER_REMOTE_IO o REVIEW explícito
FC01_OUTPUT_FEEDBACK
RS485_DISCONNECT_RECOVERY
SLAVE_RESET_RECOVERY
```

No es requisito cerrar multidrop en la misma tanda.
