# JWPLC Basic — Pantalla HMI programable desde OpenPLC

Fecha: 2026-10-10
Estado: **análisis y propuesta** (sin código todavía). Decisión: opción C;
plan en [JWPLC_HMI_PLAN_INDUSTRIAL.md](JWPLC_HMI_PLAN_INDUSTRIAL.md)
Repos: `openplc-editor` (rama `develop/alpha12-backplane-closure`) y `platform-jwplc`

---

## 1. Qué se pide

Que la pantalla integrada del JWPLC se pueda **diseñar y programar desde
OpenPLC**, igual que la lógica: agregar al proyecto una "pantalla" (HMI), y en
ella colocar textos, íconos, valores, indicadores y barras **enlazados a las
variables del programa**.

Alcance inicial: solo el **maestro** (el JWPLC que corre el programa
OpenPLC). Los esclavos Remote I/O siguen con su pantalla IDLE.

> Nota de términos: lo que se busca es una **HMI** (Human-Machine Interface),
> no HDMI.

---

## 2. Qué existe hoy

### 2.1 Hardware

| Recurso | Valor |
| --- | --- |
| Pantalla | TFT ST7789, **320 × 170 px**, RGB565, rotación 3 |
| Teclado | 7 botones (`JW_MatrixButtons`) |
| LEDs | RUN, ERR, BUS, ETH |
| MCU | ESP32 240 MHz, 520 KB RAM, 4 MB flash |

### 2.2 Librería `JWPLC_Display` (platform-jwplc)

Ya tiene casi todo el **motor** de una HMI:

- Modos **IDLE** (estado del PLC: E/S, RUN/ERR, BUS, ETH, RTC) y **USER**
  (pantalla de la aplicación), con entrada y salida por botón.
- **Fields** declarativos: `VALUE`, `TEXT`, `BOOL`, `BAR`
  (`JWPLC_UIValueField`, `JWPLC_UIBoolField`, ...). Máximo
  `JWPLC_UI_MAX_FIELDS = 32`.
- **Páginas** (`setUserPage`), refresco a demanda, invalidación por field.
- **PixelMap** (imágenes RGB565), que sirven como íconos.
- Callbacks cortos: `jwplcUIEnter`, `jwplcUIPageEnter`, `jwplcUIUpdate`,
  `jwplcUIExit`.

### 2.3 JWPLC HMI Designer (Alpha11, `platform-jwplc/tools/jwplc-hmi-designer`)

Editor visual ya validado (TEXT, VALUE, BOOL, BAR, PIXELMAP, multipágina,
vista en vivo por WebSerial, app de escritorio):

- Canvas real de 320 × 170 que reproduce la geometría del motor.
- Proyecto `.jwhmi` (JSON).
- Genera `JWPLC_HMI_Generated.h` (IDs, variables C++, `JWPLC_UIField[]`,
  PixelMaps, `jwplcHMISetup()`, `jwplcUIUpdate()`).
- Es una app web (unas 9 000 líneas de JS) dentro de Electron, la misma
  tecnología que el editor OpenPLC.

**Limitación:** está pensado para **Arduino IDE**. Las variables del HMI son
variables C++ del sketch; no conoce las variables IEC de OpenPLC.

### 2.4 OpenPLC Editor (fork JWPLC)

- **No tiene nada de HMI.** El firmware OpenPLC del JWPLC solo muestra la
  pantalla IDLE (desde 2026-10-10 también marca las entradas forzadas).
- Hay piezas que se pueden aprovechar:

| Pieza | Dónde | Para qué sirve aquí |
| --- | --- | --- |
| Pantallas VPP declarativas (`screens/*.json`, layouts `form`, `module-slots`, ...) | `vendor-screen/` en el editor | Patrón para agregar una pestaña "Pantalla HMI" al dispositivo |
| `vendorScreenData` → `vpp_config.h` | `compile/steps/generate-vpp-config.ts` | Camino ya probado editor → firmware (lo usa el Backplane) |
| HAL `hal/jwplcbasic.cpp` con `hardwareInit`, `hardwareService`, `updateInputBuffers`, `updateOutputBuffers` | VPP | Lugar natural para inicializar y alimentar la HMI |
| Buffers ubicados `bool_input`, `bool_output`, `int_memory`, `dint_memory`, ... | runtime Arduino | Leer/escribir `%IX`, `%QX`, `%MW`, `%MD` desde el HAL |
| Tabla del debugger `get_var_count()` / `get_var_addr(i)` / `get_var_size(i)` | `resources/sources/arduino/debug.h` | Leer **cualquier variable por índice**, no solo las ubicadas; el editor ya maneja esos índices para el debugger |
| POUs en C/C++ con autocompletado de la API Arduino | editor | Escribir bloques propios que llamen a `JWPLC_Display` |
| Hook `sketch_setup()` / `sketch_loop()` (`USE_ARDUINO_SKETCH`) | `Baremetal.ino` | Existe en la plantilla, pero el editor hoy no lo activa |

### 2.5 Hoja de ruta ya escrita

`platform-jwplc/docs/JWPLC_V2_1_CLOSURE_ROADMAP.md`:

- **Alpha13 = TFT / Display Update** (sobre `JWPLC_TFT`/`JWPLC_Display`,
  compatible con HMI Designer Alpha11).
- **Alpha14 = OpenPLC + Integration**, que incluye "integración HMI/OpenPLC
  pendiente".

Esta propuesta encaja ahí: el motor gráfico se cierra en Alpha13 y la
integración con OpenPLC en Alpha14 (o se adelanta, como se hizo con el
esclavo en Alpha12).

---

## 3. Cómo lo resuelve la industria

| Fabricante / herramienta | Cómo se diseña la pantalla | Cómo se enlaza a la lógica | Lo que nos sirve |
| --- | --- | --- | --- |
| **Siemens LOGO!** (Soft Comfort) | Bloque de función **"Textos de aviso"** dentro del programa; la pantalla es pequeña y de texto | El bloque recibe variables y una entrada de activación; tiene prioridad y se navega con las teclas | Lo más simple: la pantalla se "programa" con bloques, sin editor gráfico |
| **Eaton easyE4**, **Crouzet**, relés programables | Bloques "Display / D" en el programa | Igual que LOGO! | Mismo patrón, pensado para técnicos de campo |
| **Unitronics** (VisiLogic / UniLogic): PLC con pantalla integrada | **Editor de pantallas dentro del mismo software** del ladder | Cada objeto se enlaza a un operando (MB, MI, ML...) o a una etiqueta; teclas del equipo asignadas a bits | Es el **producto más parecido al JWPLC** |
| **CODESYS Visualization** (TargetVisu / WebVisu) | Editor de visualización dentro del IDE IEC | Los elementos apuntan **directo a variables IEC por nombre**; se compila con el programa y corre en el mismo runtime | La **arquitectura** más parecida a la que queremos |
| **Siemens TIA Portal + WinCC Basic** | Un solo proyecto con PLC y HMI | Tabla de tags compartida, enlace por símbolo | Una sola base de variables y validación cruzada al compilar |
| **Weintek, Delta DOP**, HMI externas | Software aparte | Por comunicación (Modbus) | Lo que ya se puede hacer hoy con el JWPLC por Modbus; no es lo que se pide |

Lo que tienen en común las soluciones con pantalla integrada:

1. **Una sola base de variables**: la HMI no declara variables propias; usa
   las del programa.
2. **Objetos estándar**: texto fijo, valor numérico (con formato y unidades),
   lámpara/indicador de bit (texto o ícono), barra, imagen, texto
   multiestado (un entero escoge un mensaje), entrada de dato (setpoint) y
   botones/teclas que escriben bits.
3. **Páginas y navegación** con las teclas del equipo.
4. **Validación al compilar**: si una variable enlazada se borra o cambia de
   tipo, el proyecto no compila.
5. **Vista previa / simulación** con valores reales o simulados.
6. La pantalla de estado del sistema (nuestra IDLE) convive con las pantallas
   del usuario.

---

## 4. Opciones de implementación

### Opción A — Bloques de función HMI (estilo LOGO!)

Una librería de bloques que el usuario pone en Ladder/FBD/ST:

```text
HMI_PAGE   (PAGE := 1)
HMI_TEXT   (PAGE, X, Y, TEXT := 'Motor 1')
HMI_VALUE  (PAGE, X, Y, IN := Temperatura, DIGITS, DECIMALS, UNIT := 'C')
HMI_LAMP   (PAGE, X, Y, IN := Motor_ON, TXT_OFF := 'PARADO', TXT_ON := 'MARCHA')
HMI_BAR    (PAGE, X, Y, IN := Nivel, MIN := 0, MAX := 100)
HMI_KEY    (BTN := 'F1') => Q (BOOL)
```

Se implementa con POUs C/C++ que llaman a `JWPLC_Display`.

- A favor: rápido; no hay que tocar la UI del editor; el enlace con variables
  es natural (son entradas del bloque); funciona en cualquier lenguaje IEC.
- En contra: se diseña "a ciegas" con coordenadas numéricas; cada bloque
  corre en el scan (hay que cuidar que solo marque datos y no dibuje); el
  diseño queda mezclado con la lógica.
- Útil como **prueba rápida** o como API para usuarios avanzados.

### Opción B — Designer externo + importar `.jwhmi` en OpenPLC

1. El usuario diseña en JWPLC HMI Designer (tal como está).
2. En OpenPLC, la pestaña "Pantalla HMI" del dispositivo **importa** el
   `.jwhmi`.
3. Una tabla enlaza cada variable del HMI con una variable del programa
   OpenPLC (lista desplegable con las variables globales).
4. Al compilar, el editor genera el header y el código de enlace.

- A favor: reutiliza el Designer validado; poco trabajo en el editor (una
  tabla y un paso de compilación).
- En contra: dos herramientas; si cambia el `.jwhmi` hay que volver a
  importar; nombres que se desincronizan.
- Útil como **primer entregable** para mostrar resultados.

### Opción C — Editor HMI integrado en OpenPLC (estilo Unitronics / CODESYS) — **recomendada como meta**

- Nuevo elemento en el árbol del proyecto: **"Pantallas HMI"** (o pestaña
  del dispositivo JWPLC), con una o varias páginas.
- Canvas 320 × 170 dentro del editor, **portando los módulos del Designer**
  (geometría, fuente, PixelMap, codegen) a componentes React.
- Panel de propiedades con **selector de variables del proyecto** (con tipo
  y filtro), en vez de declarar variables C++.
- Se guarda en el proyecto (por ejemplo `devices/hmi/*.json`) y se versiona
  con él.
- Al compilar, un paso nuevo genera el HMI y valida los enlaces.
- **Vista en vivo con el debugger**: como el editor ya consulta los valores
  para depurar, el canvas puede mostrar los valores reales del PLC mientras
  se depura, sin WebSerial aparte.

- A favor: experiencia de producto industrial; una sola herramienta; una sola
  base de variables; validación al compilar.
- En contra: es el trabajo más grande (UI en el editor + codegen + tests al
  100 % en `src/backend/shared` y `src/frontend/utils`).

### Opción D — Layout VPP genérico `hmi-canvas`

Igual que C, pero el canvas es un **layout genérico** de pantallas VPP
(como `form` o `module-slots`) y el fabricante declara en el JSON del VPP el
tamaño de la pantalla y los objetos disponibles. Los datos viajan por
`vendorScreenData` y el HAL construye los fields.

- A favor: el editor sigue siendo neutral respecto al fabricante (más fácil
  de mantener frente al upstream).
- En contra: `vpp_config.h` solo produce `#define`; 32 fields con colores,
  formatos y PixelMaps como macros es incómodo. Haría falta otro paso de
  generación (un `.h` con estructuras), con lo que se parece mucho a C.

**Conclusión:** C con la extensibilidad de D. El editor tiene un editor HMI
genérico que se activa cuando el VPP declara la capacidad, por ejemplo:

```json
"capabilities": {
  "hmiDisplay": { "width": 320, "height": 170, "color": "RGB565",
                  "keys": ["UP","DOWN","LEFT","RIGHT","OK","ESC","F1"],
                  "maxFields": 32 }
}
```

y el HAL del VPP es quien implementa el dibujo con `JWPLC_Display`.

---

## 5. Diseño técnico del enlace con variables (la parte clave)

### 5.1 Dos formas de enlazar

| Forma | Cómo | Ventaja | Desventaja |
| --- | --- | --- | --- |
| **Por dirección ubicada** (`%IX0.0`, `%QX0.1`, `%MW10`, `%MD4`) | El HAL lee `bool_input`, `bool_output`, `int_memory`, ... | Funciona hoy sin cambios en el runtime | El usuario tiene que poner `AT %MW...` a cada variable que muestra |
| **Por nombre** (cualquier variable global) | El editor resuelve el **índice de la variable en la tabla del debugger** y genera una tabla `{field, índice, tipo}`; el HAL usa `get_var_addr(índice)` | Igual que CODESYS/TIA: el usuario elige la variable y listo | Hay que regenerar la tabla en cada compilación (ya se hace) y validar tipos |

Propuesta: **por nombre como camino principal**, y por dirección ubicada como
alternativa (sirve para la prueba rápida y para variables de E/S).

### 5.2 Dónde se copian los datos (sin frenar el scan)

```text
scan PLC (runtime_plc_cycle)
   └─ updateOutputBuffers()  → el HAL toma una "foto" de las variables enlazadas
                               (copia corta, solo valores que cambiaron)
hardwareService() (tiempo libre del scan)
   └─ JWPLC_Display: compara la foto con lo dibujado y redibuja solo esos fields
teclas / setpoints
   └─ se guardan como pendientes y se escriben en updateInputBuffers(),
      antes del siguiente scan (igual que hoy se reimponen los forzados)
```

Reglas:

- **Nunca dibujar dentro del scan.** El scan solo copia valores.
- Escrituras desde la HMI (teclas, setpoints) entran al inicio del scan, para
  que la lógica vea un valor estable durante todo el ciclo.
- Respetar los forzados del debugger (ya existe `runtime_located_bool_is_forced`).

### 5.3 Tipos IEC → objetos de pantalla

| Tipo IEC | Objeto por defecto | Otros objetos válidos |
| --- | --- | --- |
| `BOOL` | Lámpara con texto ON/OFF | Ícono ON/OFF (2 PixelMaps), botón/tecla (escritura) |
| `INT`, `DINT`, `UINT`, ... | Valor numérico con formato | Barra (con min/max), texto multiestado, entrada de setpoint |
| `REAL` | Valor numérico con decimales y unidad | Barra |
| `STRING` | Texto dinámico (capacidad fija) | — |
| `TIME` | Valor formateado (mm:ss) | — |
| Sin variable | Texto fijo, ícono fijo, marco | — |

El compilador **falla con un mensaje claro** si una variable enlazada no
existe o el tipo no corresponde al objeto (criterio del proyecto: fallos
visibles).

### 5.4 Objetos nuevos que pide el motor (`JWPLC_Display`, Alpha13)

El motor actual cubre VALUE, TEXT, BOOL y BAR. Para una HMI de máquina faltan:

1. **Texto fijo / etiqueta** sin variable (hoy se simula con un field).
2. **Ícono de estado** (PixelMap ON/OFF según un BOOL).
3. **Texto multiestado** (un entero elige uno de N mensajes: "PARADO",
   "MARCHA", "FALLA").
4. **Entrada de setpoint** con las teclas (editar un número con ↑/↓, OK
   confirma, ESC cancela) con límites min/max.
5. **Tecla → bit** (F1 = arranque, por ejemplo), momentánea o con retención.
6. **Navegación de páginas** configurable (qué tecla va a qué página).
7. (Después) **alarmas**: una lista de mensajes ligados a bits, con hora del
   RTC.

Estos cambios son de la plataforma, no del editor; conviene hacerlos en
Alpha13 sin romper la API de Alpha11 ni el `.jwhmi` actual.

### 5.5 Convivencia con la IDLE

- Si el proyecto **no tiene** HMI: todo como hoy (solo IDLE).
- Si **tiene** HMI: la IDLE sigue siendo la pantalla de sistema; la HMI del
  usuario se abre con la tecla configurada (o al arrancar, si se elige), y
  ESC vuelve a la IDLE. Ya existen `setIdleWakeMode`, `setIdleWakeButton` y
  `setIdleReturnMode`.
- Una falla del PLC (ERR) o un STOP debe verse aunque se esté en la HMI del
  usuario (barra de estado mínima o salto automático a la IDLE).

---

## 6. Cambios por repositorio (opción C, a grandes rasgos)

### openplc-editor

- Modelo del proyecto: `hmi` (páginas, objetos, enlaces) guardado en el
  proyecto.
- UI: árbol del proyecto + editor de canvas + panel de propiedades + selector
  de variables (reutiliza el de la tabla de variables).
- Paso de compilación nuevo, por ejemplo `compile/steps/generate-hmi.ts`
  (mismo estilo que `generate-vpp-config.ts`: función pura, salida
  determinista) que escribe `src/jwplc_hmi_generated.h` en el bundle.
- Validación de enlaces (variable existe, tipo correcto, límites de fields y
  memoria).
- Vista en vivo usando los valores del debugger.
- Tests al 100 % en `src/backend/shared` y `src/frontend/utils`.

### platform-jwplc (VPP y librería)

- VPP: capacidad `hmiDisplay` en el `manifest.json`; el HAL
  `hal/jwplcbasic.cpp` incluye el header generado (si existe), llama
  `jwplcHMISetup()` en `hardwareInit()` y hace la copia de valores y escrituras
  como en 5.2. Nueva versión del VPP firmada.
- `JWPLC_Display`: objetos nuevos de 5.4 y una función de enlace por tabla
  (`{fieldId, puntero, tipo}`) para que el HAL no tenga que generar código por
  field.
- HMI Designer: importar/exportar el mismo formato, para que el Designer siga
  sirviendo a los usuarios de Arduino IDE.

---

## 7. Plan por fases

| Fase | Entregable | Criterio de aceptación en banco |
| --- | --- | --- |
| **0. Prueba de concepto** (días) | HAL de prueba que dibuja 3 fields fijos (VALUE de `%MW0`, BOOL de `%QX0.0`, BAR de `%MW1`) con `JWPLC_Display` | Programa ladder cambia `%MW0` y `%QX0.0`; la pantalla del maestro lo muestra; el tiempo de scan no sube de forma apreciable; la IDLE sigue funcionando |
| **1. Importar `.jwhmi` + tabla de enlaces** (opción B) | Pestaña "Pantalla HMI" en el dispositivo; importa el diseño; enlaza cada variable HMI con una variable OpenPLC; genera el header al compilar | Diseño hecho en el Designer se ve igual en el JWPLC con variables de un programa OpenPLC; error claro si falta una variable |
| **2. Motor ampliado** (Alpha13) | Texto fijo, ícono ON/OFF, multiestado, tecla → bit, setpoint, navegación | Ejemplos de banco por cada objeto; escritura desde teclas respeta forzados |
| **3. Editor integrado** (opción C) | Canvas dentro de OpenPLC, selector de variables, vista en vivo con el debugger | Un técnico arma una pantalla de 2 páginas sin salir de OpenPLC ni abrir el Arduino IDE |
| **4. Extras** | Alarmas con hora, idiomas, librería de íconos industriales (motor, válvula, bomba, alarma), protección por clave de páginas | Por definir |

La Fase 0 confirma la parte de más riesgo (rendimiento y convivencia con el
scan) antes de invertir en la UI.

---

## 8. Riesgos y límites

- **Tiempo de dibujo**: en las pruebas A14.3 (runtime completo con Modbus TCP
  a 1000 req/s) el refresco USER quedó estable con periodos de 175–200 ms
  (unos 5 Hz); 150 ms fue parcial. Redibujar solo lo que cambia y hacerlo
  fuera del scan.
- **Memoria**: los PixelMaps RGB565 pesan (un ícono de 32 × 32 = 2 KB de
  flash). Limitar y avisar en el editor.
- **32 fields** como máximo hoy; el editor debe mostrar el contador.
- **Serial2** sigue siendo exclusivo del Backplane; la HMI no usa puertos
  serie.
- **Upstream**: un editor HMI dentro de OpenPLC es código propio del fork;
  mantenerlo detrás de la capacidad `hmiDisplay` para que no afecte a otras
  placas ni a los merges con upstream.
- **Package**: los cambios de `JWPLC_Display` requieren un package nuevo del
  core (decisión del jefe; hoy el banco usa archivos reemplazados en
  `Arduino15`).

---

## 9. Preguntas para decidir

1. ¿Primer entregable con el Designer externo (Fase 1) o ir directo al
   editor integrado (Fase 3)?
2. ¿Enlace por nombre de variable (recomendado) o basta con direcciones
   `%MW`/`%QX` en la primera versión?
3. ¿Las teclas pueden escribir en el programa (setpoints, arranque/paro) desde
   la primera versión, o solo visualización?
4. ¿Al encender, el equipo muestra la IDLE o la HMI del usuario?
5. ¿Esto entra en Alpha13/Alpha14 según la hoja de ruta, o se adelanta como el
   esclavo en Alpha12?
