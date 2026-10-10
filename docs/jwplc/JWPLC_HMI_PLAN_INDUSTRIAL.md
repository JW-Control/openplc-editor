# JWPLC Basic — Plan industrial: editor de pantallas HMI integrado en OpenPLC

Fecha: 2026-10-10
Estado: **plan aprobado en dirección (opción C)**; implementación no iniciada
Antecedente: [JWPLC_HMI_PANTALLA_OPENPLC_PROPUESTA.md](JWPLC_HMI_PANTALLA_OPENPLC_PROPUESTA.md)
Repos: `openplc-editor`, `platform-jwplc`

---

## 1. Decisión

Se adopta la **opción C**: un **editor de pantallas HMI dentro de OpenPLC**, al
estilo Unitronics (VisiLogic/UniLogic) y CODESYS Visualization, para la pantalla
TFT integrada del JWPLC Basic (ST7789, 320 × 170, 7 teclas).

- Primera versión: solo el **maestro**.
- La HMI forma parte del proyecto OpenPLC: se diseña, se valida, se compila, se
  descarga y se depura junto con el programa.
- Los objetos de la pantalla se enlazan a las **variables del programa IEC**;
  la HMI no declara variables propias.

---

## 2. Principios de diseño (nivel industrial)

| # | Principio | Consecuencia práctica |
| --- | --- | --- |
| P1 | **Una sola base de variables** | El selector de variables lee las variables del proyecto. Renombrar o borrar una variable enlazada es un error de compilación, no un fallo silencioso |
| P2 | **El scan del PLC manda** | La HMI nunca dibuja dentro del scan. El scan solo copia una foto de las variables enlazadas; el dibujo ocurre en el tiempo libre |
| P3 | **Escrituras deterministas** | Teclas y setpoints se aplican al inicio del scan siguiente, con límites min/max validados en el equipo, no solo en el editor |
| P4 | **Fallos visibles y estados seguros** | Si la HMI no se puede cargar o un enlace es inválido, el equipo muestra la IDLE con el aviso y el PLC sigue corriendo. Una falla del PLC (ERR/STOP) siempre se ve, aunque se esté en una pantalla del usuario |
| P5 | **Lo que se ve en el editor es lo que se ve en el equipo** | Una sola implementación de la geometría, las fuentes y el codegen (núcleo compartido), validada contra el hardware con pruebas de paridad por píxel |
| P6 | **Compatibilidad hacia atrás** | La API pública de `JWPLC_Display` (Alpha11) y el formato `.jwhmi` siguen funcionando; los proyectos sin HMI compilan igual que hoy |
| P7 | **Trazabilidad** | La HMI se guarda en el proyecto, en texto (JSON con esquema versionado), y se compara con diff como el resto del código |
| P8 | **Neutral respecto a la placa** | El editor HMI se activa solo si el VPP declara la capacidad `hmiDisplay`; otras placas y los merges con upstream no se ven afectados |
| P9 | **Buenas prácticas de HMI** | Guía de estilo basada en **ISA-101** (fondos neutros, color solo para estados anormales, jerarquía de información) y, para alarmas, **ISA-18.2** |

---

## 3. Estado de partida

### 3.1 Lo que ya existe

- **Motor gráfico** `JWPLC_Display` (platform-jwplc): IDLE + USER, fields
  `VALUE`, `TEXT`, `BOOL`, `BAR`, páginas, PixelMap, máximo 32 fields,
  callbacks `jwplcUIEnter` / `jwplcUIPageEnter` / `jwplcUIUpdate` /
  `jwplcUIExit`, acceso a dibujo directo con `JWPLC_Display.tft()`.
- **JWPLC HMI Designer** (Alpha11, publicado en `main`) y su continuación en la
  rama de Andr3manuel (ver sección 4).
- **OpenPLC Editor (fork JWPLC)**: pantallas VPP declarativas, camino
  `vendorScreenData` → `vpp_config.h` → HAL, tabla del debugger
  (`get_var_addr`) para leer variables por índice, buffers ubicados
  (`%IX/%QX/%MW/%MD`), POUs C/C++.

### 3.2 Lo que falta

- El editor OpenPLC no tiene nada de HMI.
- No existe un núcleo HMI independiente de la interfaz (ver 4.3).
- El motor no tiene objetos de entrada (teclas → bits, setpoints), texto fijo
  sin variable, íconos de estado, multiestado ni alarmas.

---

## 4. Revisión de la rama del HMI Designer (Andr3manuel)

Rama: `origin/v2.0.1-alpha.15-(HmiDesigner)` · último commit `e0d2f2ff`
(2026-10-09) · base `main @ aa0bfed1` (Alpha12 publicada).
Revisado el 2026-10-10 sobre una copia (`git archive`), sin tocar la rama.

### 4.1 Avance

Unas **+11 700 / −930 líneas** respecto de `main`, casi todo en
`tools/jwplc-hmi-designer/poc`:

- **Lienzo tipo CAD**: lienzo infinito con paneo, zoom y ajuste a la
  selección, reglas, grilla (rejilla o puntos), snap, selección por marquesina y
  por contorno, multiselección, caja con 8 tiradores, rotación y espejo,
  copiar y pegar.
- **Dibujo**: línea, rectángulo, elipse, triángulo, polígono, texto libre
  (`RAW_TEXT`), relleno, cuentagotas, colores recientes.
- **Fuentes**: catálogo de 15 fuentes con glifos reales de TFT_eSPI (GLCD,
  FONT2, FONT4 y FreeFonts Sans/Serif/Mono de 9 y 12 pt) y cambios en
  `JWPLC_TFT` (`setFont`, `setTextDatum`, `drawString`).
- **BAR**: rediseño del inspector (pestañas Diseño / Datos PLC / Técnico) y
  variantes nuevas: barra con degradado y circular.
- **BOOL**: sin cambios de lógica respecto de Alpha11 (solo se adaptó el
  selector del botón de la barra de herramientas).

### 4.2 Prueba del BOOL (lo que se reporta como operativo)

Prueba hecha el 2026-10-10:

1. Se abrió el Designer de la rama en Chrome sin interfaz (Playwright).
2. Se creó un campo BOOL, con textos `PARADO`/`MARCHA` y estado de prueba
   `true`.
3. Se generó el código y se compiló en un sketch para
   `jwplc:esp32:jwplcbasic` (core 2.1.0-alpha.12 instalado).

| Verificación | Resultado |
| --- | --- |
| Crear campo BOOL, editar textos y estado de prueba | **PASS**: el inspector y el lienzo se actualizan (`MARCHA` con estado `true`) |
| Código BOOL generado contra la API real (`JWPLC_UIBoolField`, `JWPLC_UIBoolText`, `JWPLC_UIBoolStyle`, `setBool`) | **PASS**: coincide con `JWPLC_UI.h` |
| Compilación del header generado + sketch | **PASS**: 420 661 B de flash (10 %), 34 428 B de RAM (10 %) |
| `jwplcUIUpdate()` generado reemplaza al *weak* del runtime | **PASS**: en el ELF queda `T jwplcUIUpdate` con enlace C |
| Prueba en hardware (dibujo real en la TFT) | **No hecha** en esta revisión |

**Conclusión:** el BOOL está operativo hasta compilación y enlace. Falta la
validación en el equipo.

### 4.3 Observaciones

Están ordenadas por impacto en el plan.

| # | Observación | Impacto | Recomendación |
| --- | --- | --- | --- |
| O1 | Las figuras y el `RAW_TEXT` generan `JWPLC_Display.getTFT()->...`, pero ese método **no existe**. Compilado: `error: 'class JWPLC_DisplayClass' has no member named 'getTFT'`. La API real es `JWPLC_Display.tft()` (referencia, no puntero) | Cualquier diseño con una figura o un texto libre **no compila** | Generar `JWPLC_Display.tft().drawRect(...)`. Lo reconoce su propia nota `TFT_FONTS_RECOMPILE_PENDING.md` |
| O2 | Las figuras y el texto libre se dibujan dentro de `jwplcUIUpdate()`, que con `USER_REFRESH_PERIODIC` corre en cada refresco | Redibujo continuo del fondo: parpadeo, tiempo de SPI desperdiciado y pelea de capas con los fields | El fondo estático va en `jwplcUIPageEnter(page)` (se dibuja una vez por página), o mejor como objeto del motor (sección 6.3) |
| O3 | BAR circular y con degradado generan `JWPLC_UICircularField` y `JWPLC_UIGradientBarField`, que **no existen** en `JWPLC_Display` | Esos diseños no compilan | El Designer no debe ofrecer objetos que el firmware no soporta; agregarlos primero al motor (Alpha13) o marcarlos "experimental" sin codegen |
| O4 | Las fuentes nuevas están solo en fuente: `libJWPLC_TFT.a` **no se regeneró** (lo dice su nota). Además, `tft_setup.h` carga todas las FreeFonts | Fuentes distintas de GLCD no funcionan en el equipo; posible aumento de flash | Regenerar el `.a`, medir la flash y limitar el catálogo |
| O5 | El codegen ignora la rotación y el espejo de las figuras, la elipse sale como círculo (`r = max(rx, ry)`) y el relleno del polígono se ignora | Lo que se ve en el Designer **no es** lo que se ve en el equipo (rompe P5) | El codegen solo debe emitir lo que el equipo dibuja igual; si no, bloquear la propiedad |
| O6 | **Arquitectura del codegen**: `app.js` genera el texto y luego 7 módulos (`designer-bool`, `designer-codegen`, `designer-pages`, `designer-pixelmap*`, ...) lo parchean con reemplazos de texto y regex sobre el `textContent` del DOM. El BOOL, por ejemplo, se crea como un TEXT y se reescribe | Frágil, sin pruebas automáticas posibles, difícil de llevar a OpenPLC | Extraer un **núcleo HMI puro** (sección 6.1). Es la pieza que se reutilizará en OpenPLC |
| O7 | Un campo nuevo se crea encima de los existentes (BOOL en 28,28 sobre TEXT en 20,20) y no hay aviso de solapamiento | El usuario puede generar pantallas que se pisan | Validación de solapamiento y de límites del lienzo |
| O8 | El header define variables y funciones (no `extern`/`inline`) | Error de "multiple definition" si se incluye desde dos archivos | Para OpenPLC lo incluirá un solo archivo (HAL); en Arduino, documentarlo o separar `.h` y `.cpp` |
| O9 | Higiene del repo: commits con mensaje `.` o `,`; `desktop.html` en la raíz del repo; `poc/fix.py`; PNG de referencia de 2,4 MB; paréntesis en el nombre de la rama | Historial difícil de auditar; el nombre de la rama falla en shells y CI | Mensajes descriptivos, limpiar archivos sueltos y renombrar la rama (p. ej. `v2.1.0-alpha.13/feature/hmi-designer-cad`) |

Lo valioso para el plan: **el lienzo, la interacción tipo CAD, el catálogo de
fuentes con glifos reales y el inspector BAR**. Son la base de la interfaz del
editor dentro de OpenPLC una vez separados del DOM (O6).

---

## 5. Arquitectura objetivo

```text
┌──────────────────────── openplc-editor ────────────────────────┐
│  Proyecto OpenPLC                                               │
│   ├─ POUs / variables                                           │
│   └─ hmi/  (pantallas, objetos, enlaces, recursos)  ◄── P7      │
│                                                                 │
│  Editor HMI (React)  ──usa──►  @jwplc/hmi-core (TS puro)        │
│   canvas · inspector ·          modelo + esquema + validación   │
│   selector de variables ·       geometría + fuentes + PixelMap  │
│   vista en vivo (debugger)      codegen  (golden tests)         │
│                                                                 │
│  Compilación: paso generate-hmi ──► src/jwplc_hmi_generated.h   │
│               (tabla de enlaces: field ↔ índice de variable)    │
└─────────────────────────────────────────────────────────────────┘
                              │ firmware
┌──────────────────────── JWPLC Basic ────────────────────────────┐
│  scan PLC ─► updateOutputBuffers(): foto de variables enlazadas │
│  hardwareService() (tiempo libre): JWPLC_Display redibuja solo  │
│               los fields que cambiaron                          │
│  teclas/setpoints ─► cola ─► updateInputBuffers() (inicio scan) │
│  IDLE (sistema) ⇄ USER (HMI del proyecto)                       │
└─────────────────────────────────────────────────────────────────┘

JWPLC HMI Designer (Arduino IDE) ──usa──► el mismo @jwplc/hmi-core
```

### 5.1 Componentes

| Componente | Repo | Responsabilidad |
| --- | --- | --- |
| `hmi-core` | platform-jwplc (`tools/jwplc-hmi-core`), consumido por el editor | Modelo y esquema JSON versionado, migraciones, validación, geometría idéntica al motor, métricas de fuentes, PixelMap, codegen. **Sin DOM.** |
| Editor HMI | openplc-editor | Árbol del proyecto "Pantallas HMI", canvas, inspector, selector de variables, vista en vivo, mensajes de validación |
| Paso `generate-hmi` | openplc-editor (`src/backend/shared/compile/steps/`) | Resuelve los enlaces a índices de variables, valida y escribe el header en el bundle del firmware |
| Capacidad `hmiDisplay` | VPP `manifest.json` | Tamaño, formato de color, teclas, límites (fields, flash de recursos) |
| HAL | VPP `hal/jwplcbasic.cpp` | `jwplcHMISetup()` en `hardwareInit()`, foto y escrituras alrededor del scan, estado de la HMI hacia la IDLE |
| Motor | `JWPLC_Display` / `JWPLC_TFT` | Dibujo, objetos nuevos, enlace por tabla, navegación, alarmas |
| Designer standalone | `tools/jwplc-hmi-designer` | Sigue sirviendo para Arduino IDE, reescrito sobre `hmi-core` |

### 5.2 Modelo de datos (esquema v1, resumen)

```json
{
  "schema": "jwplc-hmi/1",
  "target": { "width": 320, "height": 170, "color": "RGB565" },
  "startup": { "screen": "IDLE", "wakeKey": "OK", "returnKey": "ESC" },
  "screens": [
    {
      "id": "principal", "title": "Principal", "background": "0x0000",
      "keys": { "LEFT": "screen:alarmas", "F1": "write:Marcha:momentary" },
      "objects": [
        { "type": "label", "x": 8, "y": 6, "text": "Bomba 1", "font": "GLCD", "size": 2 },
        { "type": "lamp", "x": 8, "y": 40,
          "bind": { "var": "Bomba1_Marcha", "access": "R" },
          "states": [ { "text": "PARADA", "color": "0x8410" },
                      { "text": "MARCHA", "color": "0x07E0" } ] },
        { "type": "numeric", "x": 8, "y": 70,
          "bind": { "var": "Presion", "access": "R" },
          "format": { "digits": 4, "decimals": 1, "unit": "bar" } },
        { "type": "setpoint", "x": 8, "y": 100,
          "bind": { "var": "Presion_SP", "access": "RW", "min": 0, "max": 10 },
          "format": { "digits": 4, "decimals": 1, "unit": "bar" } }
      ]
    }
  ],
  "alarms": [],
  "resources": { "images": [] }
}
```

- Los enlaces apuntan a **variables por nombre** (globales del recurso o
  `%MW/%QX`). El índice de la tabla del debugger se resuelve en cada
  compilación, así que no se guarda en el proyecto.
- El `.jwhmi` actual se importa con una migración `jwhmi → jwplc-hmi/1`.

### 5.3 Contrato del runtime

| Situación | Comportamiento |
| --- | --- |
| Arranque | IDLE o la pantalla inicial, según `startup`. La HMI se registra en `hardwareInit()` |
| Scan normal | En `updateOutputBuffers()` se copian solo las variables enlazadas de la pantalla activa (y de las alarmas). Presupuesto: < 50 µs por scan con 32 enlaces (a validar en la Fase 0) |
| Tiempo libre | `hardwareService()` redibuja solo los fields que cambiaron; refresco objetivo 5 Hz (los ensayos A14.3 dieron estable con 175–200 ms) |
| Escritura desde la HMI | Se encola; se aplica en `updateInputBuffers()` del scan siguiente; se rechaza si está fuera de min/max; no pisa un forzado del debugger |
| PLC en STOP o ERR | La HMI muestra una franja de estado o salta a la IDLE (configurable); las escrituras se bloquean |
| Enlace inválido en el equipo (versión cruzada) | La HMI no se activa; la IDLE muestra "HMI inválida" y el PLC sigue corriendo |
| Debugger forzando una variable | El objeto la marca como forzada (misma convención que la IDLE: rayado + F) |
| Sin HMI en el proyecto | Comportamiento actual (solo IDLE), sin código extra enlazado |

---

## 6. Plan por fases

Cada fase cierra con un **gate**: pruebas automáticas, compilación de la matriz
de ejemplos y prueba en banco, documentados en `docs/` y en la bitácora. Las
ramas y versiones siguen la convención del proyecto (VPP firmado con versión
monotónica, package nuevo del core cuando cambia una librería).

### Fase 0 — Prueba de concepto en el HAL (riesgo técnico)

Objetivo: validar el acople scan ↔ pantalla antes de invertir en la interfaz.

- HAL de prueba con 3 fields fijos: VALUE ← `%MW0`, BOOL ← `%QX0.0`,
  BAR ← `%MW1`, más un enlace **por nombre** usando `get_var_addr(índice)`.
- Medir el tiempo de scan (con y sin HMI) y la latencia variable → pantalla.

**Gate F0:** el programa ladder mueve los tres valores y se ven en la TFT; el
scan no aumenta más de 5 %; la IDLE, el debugger (USB y TCP) y el Backplane
siguen funcionando; el informe de tiempos está en `docs/`.

### Fase 1 — Núcleo `hmi-core` (sin interfaz nueva)

Objetivo: una sola fuente de verdad para el modelo y el codegen (resuelve O6,
O1, O5).

- Extraer del Designer el modelo, la geometría, las fuentes, PixelMap y el
  codegen a TypeScript puro, con esquema JSON `jwplc-hmi/1` y la migración
  desde `.jwhmi`.
- El codegen genera solo API existente; los objetos sin soporte en el firmware
  se rechazan con un mensaje claro.
- El Designer standalone pasa a usar `hmi-core` (el trabajo de Andr3manuel
  sobre el lienzo se conserva; cambia solo de dónde sale el modelo y el
  código).

**Gate F1:** golden tests del codegen (cada tipo de objeto y combinación de
páginas); 100 % de cobertura en el núcleo; matriz de compilación con
`arduino-cli` para todos los ejemplos; los proyectos `.jwhmi` de Alpha11 abren y
generan el mismo resultado.

### Fase 2 — Motor ampliado (Alpha13, platform-jwplc)

Objetivo: los objetos que necesita una HMI de máquina.

| Objeto | Uso típico |
| --- | --- |
| Texto fijo / etiqueta | Títulos y rótulos sin variable |
| Lámpara multiestado (BOOL o entero → texto/color) | "PARADA / MARCHA / FALLA" |
| Ícono de estado (PixelMap por estado) | Motor, válvula, bomba |
| Numérico con formato y escala | Presión, temperatura, contador |
| Barra (lineal; circular y degradado si se aprueban) | Nivel, porcentaje |
| Figuras estáticas (línea, rectángulo, marco) | Fondo de pantalla, dibujado una vez por página (resuelve O2) |
| Setpoint editable con teclas | Ajuste con ↑/↓, OK confirma, ESC cancela, con límites |
| Tecla → bit (momentáneo, enclavado, set, reset) | Arranque, paro, reconocer alarma |
| Navegación entre pantallas | Teclas ←/→ o F1 asignables por pantalla |
| Enlace por tabla `{field, puntero, tipo}` | El HAL alimenta la HMI sin código por field |

También: regenerar `libJWPLC_TFT.a` con el catálogo de fuentes acotado
(resuelve O4) y paridad de píxeles editor ↔ TFT.

**Gate F2:** un ejemplo de banco por objeto; prueba de paridad (captura del
editor contra foto de la TFT) en los tamaños de fuente soportados; flash y RAM
medidas y documentadas; API Alpha11 sin cambios rotos.

### Fase 3 — Editor HMI en OpenPLC (MVP)

Objetivo: diseñar sin salir de OpenPLC.

- Nodo **"Pantallas HMI"** en el árbol del proyecto (solo si el VPP declara
  `hmiDisplay`).
- Canvas 320 × 170 con zoom, grilla, snap, selección y alineación (se porta la
  interacción del Designer).
- Inspector por tipo de objeto y **selector de variables** con filtro por tipo
  compatible.
- Paso `generate-hmi` en la compilación; errores y advertencias en la consola
  del editor con enlace al objeto (variable inexistente, tipo incompatible,
  más de 32 fields, solapamiento, fuera del lienzo, flash de recursos
  excedida).
- Guardado en el proyecto (`hmi/`), con deshacer/rehacer.

**Gate F3:** un técnico arma una pantalla de 2 páginas con lámparas,
numéricos y una barra enlazadas a un programa ladder, compila, descarga y la ve
en el equipo, **sin abrir Arduino IDE**. Tests al 100 % en
`src/backend/shared` y `src/frontend/utils`; e2e del flujo "crear pantalla →
compilar".

### Fase 4 — Vista en vivo y operación

- **Vista en vivo**: con el debugger conectado, el canvas muestra los valores
  reales (reutiliza el polling del debugger, sin WebSerial aparte).
- Objetos de entrada en el editor: setpoints, teclas → bits, navegación.
- Simulación offline: dar valores a mano a las variables para revisar los
  estados de cada objeto.

**Gate F4:** en banco, los setpoints y las teclas escriben en el programa
respetando los límites y los forzados; con el PLC en STOP las escrituras se
bloquean; la vista en vivo coincide con el equipo.

### Fase 5 — Funciones de producto

- **Alarmas** (ISA-18.2 simplificado): lista ligada a bits, con prioridad,
  hora del RTC, reconocimiento por tecla, banner en todas las pantallas e
  historial en FRAM.
- **Seguridad**: pantallas protegidas por clave (operador / mantenimiento).
- **Idiomas**: textos en tabla, con idioma seleccionable.
- **Librería de símbolos industriales** (motor, bomba, válvula, tanque,
  alarma) en RGB565 optimizado.
- **Plantillas de pantalla** (estado de máquina, ajustes, alarmas,
  diagnóstico).

**Gate F5:** prueba de aceptación con un caso real (por ejemplo, una
estación de bombeo de demostración), revisada por el jefe.

### Fase 6 — Liberación industrial

- Manual de usuario y guía de estilo (ISA-101 aplicada a 320 × 170).
- Ejemplos oficiales en el VPP.
- Notas de versión y matriz de compatibilidad (editor ↔ VPP ↔ core).
- Instalador reproducible y VPP firmado.
- Prueba de larga duración (72 h con HMI activa, Modbus TCP y Backplane) sin
  pérdida de scan ni bloqueos de pantalla.

**Gate F6:** checklist de liberación firmado; release publicado.

### 6.1 Resumen

| Fase | Entregable | Repo principal | Tamaño |
| --- | --- | --- | --- |
| F0 | Prueba de concepto en el HAL | platform-jwplc (VPP) | S |
| F1 | `hmi-core` + migración `.jwhmi` + golden tests | platform-jwplc (tools) | M |
| F2 | Motor ampliado (Alpha13) | platform-jwplc (librerías) | L |
| F3 | Editor HMI en OpenPLC (MVP) | openplc-editor | L |
| F4 | Vista en vivo, entradas y simulación | openplc-editor + VPP | M |
| F5 | Alarmas, seguridad, idiomas, símbolos | ambos | L |
| F6 | Liberación industrial | ambos | M |

F1 y F2 pueden avanzar en paralelo después de F0. F3 necesita F1 y los objetos
básicos de F2.

---

## 7. Calidad y verificación

| Nivel | Qué se prueba | Herramienta |
| --- | --- | --- |
| Unidad | Modelo, validación, geometría, codegen | Jest; golden files del header generado |
| Compilación | Cada ejemplo y cada tipo de objeto compila para `jwplc:esp32:jwplcbasic` | `arduino-cli` en CI |
| Paridad | Editor contra TFT, píxel a píxel por objeto y fuente | Captura del canvas contra foto o volcado del framebuffer |
| Integración | Proyecto OpenPLC con HMI: compilar, descargar, depurar | e2e del editor + banco |
| Rendimiento | Tiempo de scan, latencia variable → pantalla, refresco, flash y RAM | Instrumentación tipo `[RTU-TIMING]` |
| Robustez | STOP/ERR, forzados, HMI inválida, 72 h de funcionamiento continuo | Banco |

Reglas que se mantienen: 100 % de statements y lines en `src/backend/shared` y
`src/frontend/utils`; nunca integrar el bypass de firma VPP (`75272a4fb`);
versión del VPP monotónica y firmada en cada cambio del payload.

---

## 8. Organización sugerida

| Rol | Responsabilidad |
| --- | --- |
| Jefe de proyecto | Aprueba los gates, el alcance de cada alpha y la publicación de packages |
| Integración OpenPLC (editor, HAL, VPP) | F0, paso `generate-hmi`, editor HMI, vista en vivo |
| HMI Designer / UI (Andr3manuel) | F1 (extraer `hmi-core` desde su trabajo), interacción del canvas, inspector, fuentes |
| Firmware / librerías | F2: objetos nuevos en `JWPLC_Display` y regeneración de `.a` |
| Banco | Pruebas físicas de cada gate |

Acuerdo de interfaz entre equipos: el **esquema `jwplc-hmi/1`** y los **golden
files** del codegen. Cualquier cambio en ellos se revisa entre ambos frentes.

---

## 9. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El dibujo afecta el tiempo de scan o al Backplane | F0 primero; dibujo solo en el tiempo libre; presupuesto medido en cada gate |
| Lo que se ve en el editor no coincide con el equipo | Núcleo único (F1), pruebas de paridad (F2) y bloqueo de propiedades sin soporte |
| Flash y RAM (fuentes, PixelMaps) | Catálogo de fuentes acotado; contador de recursos en el editor; límite declarado en `hmiDisplay` |
| Divergencia entre el Designer standalone y el editor | Ambos sobre `hmi-core` desde F1 |
| Merges con OpenPLC upstream | Todo detrás de la capacidad `hmiDisplay`; código del editor HMI en módulos propios |
| Packages del core (el banco usa archivos reemplazados en `Arduino15`) | Publicar el package de Alpha13 antes de F3 en banco |

---

## 10. Decisiones pendientes del jefe

1. ¿`hmi-core` vive en `platform-jwplc/tools` o en un repo propio?
2. ¿BAR circular y con degradado entran en Alpha13 o quedan para después?
3. ¿Arranque en IDLE o en la pantalla del usuario por defecto?
4. ¿Las escrituras desde la HMI (setpoints, teclas) entran en el MVP (F3) o en
   F4?
5. ¿Nombre y base de las ramas de trabajo (editor y platform)?
