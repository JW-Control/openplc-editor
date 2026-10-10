# JWPLC Basic — Plan industrial: HMI de la pantalla integrada desde OpenPLC

Fecha: 2026-10-10 (rev. 2)
Estado: **plan aprobado en dirección**; implementación no iniciada
Antecedente: [JWPLC_HMI_PANTALLA_OPENPLC_PROPUESTA.md](JWPLC_HMI_PANTALLA_OPENPLC_PROPUESTA.md)
Repos: `openplc-editor`, `platform-jwplc`

> **Cambio de la rev. 2.** Por indicación del jefe hay **una sola herramienta
> de diseño: JWPLC HMI Designer** (`platform-jwplc/tools/jwplc-hmi-designer`).
> OpenPLC no tendrá un editor de pantallas propio: **abre el Designer**, primero
> en una ventana vinculada al proyecto y después como pestaña dentro del
> editor. Así se mantiene y se da soporte a un solo producto.

---

## 1. Decisión

- La pantalla TFT del JWPLC Basic (ST7789, 320 × 170, 7 teclas) se diseña con
  **JWPLC HMI Designer** y se programa desde **OpenPLC**.
- El Designer es **un solo producto con tres anfitriones**:

| Anfitrión | Cómo se abre | Para quién |
| --- | --- | --- |
| **OpenPLC Editor** | Botón "Pantalla HMI" del dispositivo JWPLC: ventana vinculada (fase F3) y luego pestaña integrada (fase F4) | Programación IEC (objetivo del jefe) |
| Aplicación de escritorio | `JWPLC-HMI-Designer.exe` | Usuarios sin OpenPLC |
| Arduino IDE 2 | Extensión `jwplc-hmi-launcher` (ya existe) | Usuarios de sketches |

- Los tres usan **los mismos archivos** del Designer (`poc/`). Lo único que
  cambia es un adaptador pequeño que sabe dónde guardar y de dónde leer las
  variables.
- Primera versión: solo el **maestro**.

---

## 2. Principios de diseño (nivel industrial)

| # | Principio | Consecuencia práctica |
| --- | --- | --- |
| P1 | **Una sola herramienta** | Toda función de diseño se implementa una vez, en el Designer. OpenPLC solo lo aloja, le pasa el contexto del proyecto y compila |
| P2 | **Una sola base de variables** | En OpenPLC, cada objeto se enlaza a una variable del programa IEC elegida de una lista. Renombrar o borrar una variable enlazada es un error de compilación |
| P3 | **El scan del PLC manda** | La HMI nunca dibuja dentro del scan. El scan solo copia una foto de las variables enlazadas |
| P4 | **Escrituras deterministas** | Teclas y setpoints se aplican al inicio del scan siguiente, con límites validados en el equipo |
| P5 | **Fallos visibles y estados seguros** | HMI inválida o desactualizada: no compila, o el equipo muestra la IDLE con el aviso y el PLC sigue corriendo. ERR/STOP siempre visibles |
| P6 | **Lo que se ve es lo que sale** | El Designer solo ofrece objetos y propiedades que el firmware dibuja igual. Se valida con pruebas de paridad editor ↔ TFT |
| P7 | **Integridad** | El Designer que abre OpenPLC viaja dentro del VPP firmado: no se ejecuta nada que no esté firmado |
| P8 | **Trazabilidad** | La HMI se guarda dentro del proyecto OpenPLC (`hmi/`), en texto, versionada junto con el programa |
| P9 | **Neutral respecto a la placa** | OpenPLC aprende un mecanismo genérico ("herramientas del dispositivo" declaradas por el VPP). Otras placas y los merges con upstream no se ven afectados |
| P10 | **Buenas prácticas de HMI** | Guía de estilo basada en **ISA-101**; para alarmas, **ISA-18.2** |

---

## 3. Estado de partida

- **Motor gráfico** `JWPLC_Display`: IDLE + USER, fields `VALUE`, `TEXT`,
  `BOOL`, `BAR`, páginas, PixelMap, máximo 32 fields, callbacks
  `jwplcUIEnter` / `jwplcUIPageEnter` / `jwplcUIUpdate` / `jwplcUIExit`,
  dibujo directo con `JWPLC_Display.tft()`.
- **JWPLC HMI Designer**: aplicación web (1,1 MB) con envoltorio Electron 31.
  Ya tiene un **puente nativo** (`window.JWPLCHMINative`: vincular un sketch,
  escribir `JWPLC_HMI_Generated.h` y el proyecto `.jwhmi`), usado solo desde
  `designer-native-project.js` y `designer-project-integration-fix.js`. Ese
  puente es el punto natural para conectarlo con OpenPLC.
- **Integración con Arduino IDE**: extensión VSIX que **lanza** el Designer
  instalado (no lo incrusta). Es el mismo patrón que se propone para la
  primera etapa con OpenPLC.
- **OpenPLC Editor** (fork JWPLC 4.2.8, Electron 35): pantallas VPP
  declarativas, camino `vendorScreenData` → `vpp_config.h` → HAL, tabla del
  debugger (`get_var_addr`), buffers ubicados (`%IX/%QX/%MW/%MD`), VPP con firma
  ed25519 por archivo (`signature.json`).

---

## 4. Revisión de la rama del HMI Designer (Andr3manuel)

Rama: `origin/v2.0.1-alpha.15-(HmiDesigner)` · último commit `e0d2f2ff`
(2026-10-09) · base `main @ aa0bfed1` (Alpha12 publicada).
Revisado el 2026-10-10 sobre una copia (`git archive`), sin tocar la rama.

### 4.1 Avance

Unas **+11 700 / −930 líneas** respecto de `main`, casi todo en
`tools/jwplc-hmi-designer/poc`:

- **Lienzo tipo CAD**: lienzo infinito, zoom y ajuste a la selección, reglas,
  grilla y snap, selección por marquesina y por contorno, multiselección,
  tiradores, rotación y espejo, copiar y pegar.
- **Dibujo**: línea, rectángulo, elipse, triángulo, polígono, texto libre
  (`RAW_TEXT`), relleno, cuentagotas.
- **Fuentes**: 15 fuentes con glifos reales de TFT_eSPI y cambios en
  `JWPLC_TFT` (`setFont`, `setTextDatum`, `drawString`).
- **BAR**: inspector rediseñado y variantes nuevas (circular y con degradado).
- **BOOL**: sin cambios de lógica respecto de Alpha11.

### 4.2 Prueba del BOOL

Prueba hecha el 2026-10-10:

1. Se abrió el Designer de la rama en Chrome sin interfaz (Playwright).
2. Se creó un campo BOOL con textos `PARADO`/`MARCHA`.
3. Se generó el código y se compiló para `jwplc:esp32:jwplcbasic` (core
   2.1.0-alpha.12).

| Verificación | Resultado |
| --- | --- |
| Crear campo BOOL, editar textos y estado de prueba | **PASS** |
| Código contra la API real (`JWPLC_UIBoolField`, `setBool`, ...) | **PASS** |
| Compilación del header + sketch | **PASS**: 420 661 B de flash (10 %), 34 428 B de RAM (10 %) |
| `jwplcUIUpdate()` generado reemplaza al *weak* del runtime | **PASS**: `T jwplcUIUpdate` con enlace C en el ELF |
| Dibujo real en la TFT | **No hecho** en esta revisión |

### 4.3 Observaciones

Pasan al backlog de la fase F1. Como ahora el Designer es la única
herramienta, son **bloqueantes** para OpenPLC.

| # | Observación | Recomendación |
| --- | --- | --- |
| O1 | Figuras y `RAW_TEXT` generan `JWPLC_Display.getTFT()->...`, que **no existe** (compilado: `no member named 'getTFT'`). La API real es `JWPLC_Display.tft()` | Generar `JWPLC_Display.tft().drawRect(...)` |
| O2 | Figuras y texto libre se dibujan dentro de `jwplcUIUpdate()`, que corre en cada refresco | Dibujar el fondo una vez por página (`jwplcUIPageEnter`) o como objeto del motor |
| O3 | BAR circular y con degradado generan `JWPLC_UICircularField` y `JWPLC_UIGradientBarField`, que **no existen** en la librería | No ofrecerlos sin soporte en el firmware, o agregarlos al motor primero |
| O4 | Fuentes nuevas solo en fuente: `libJWPLC_TFT.a` **no regenerado** | Regenerar, medir la flash y acotar el catálogo |
| O5 | El codegen ignora rotación y espejo; la elipse sale como círculo; el relleno del polígono se pierde | Bloquear las propiedades que el equipo no reproduce |
| O6 | El código se genera parcheando texto del DOM con regex desde 7 módulos | Extraer el modelo y el codegen a un módulo puro y probado (F1/F6) |
| O7 | Los campos nuevos se crean encima de los existentes, sin aviso de solapamiento | Validar solapamiento y límites del lienzo |
| O8 | El header define variables y funciones (no `extern`/`inline`) | Lo incluye un solo archivo (el HAL en OpenPLC); documentarlo |
| O9 | Commits con mensaje `.`/`,`; `desktop.html` en la raíz del repo; `poc/fix.py`; PNG de 2,4 MB; paréntesis en el nombre de la rama | Higiene del repo y renombrar la rama |

---

## 5. Arquitectura objetivo

```text
┌──────────────────────────── OpenPLC Editor ────────────────────────────┐
│ Proyecto/                                                               │
│   ├─ POUs, variables                                                    │
│   └─ hmi/  pantalla.jwhmi  +  JWPLC_HMI_Generated.h   (P8)              │
│                                                                         │
│ Dispositivo JWPLC ─► [Pantalla HMI]                                     │
│        │                                                                │
│        ▼                                                                │
│  Host de herramientas VPP (genérico, P9)                                │
│   • sirve los archivos del Designer desde el VPP instalado (firmado)    │
│   • F3: ventana propia · F4: pestaña (iframe)                           │
│   • puente  jwplc-hmi-host/1  ◄──────────────►  JWPLC HMI Designer      │
│        contexto, variables, guardar,                (mismos archivos    │
│        valores en vivo                               que el .exe)       │
│                                                                         │
│ Compilación: paso generate-hmi                                          │
│   • verifica que el header corresponda al .jwhmi (revisión)             │
│   • valida enlaces (existe, tipo compatible)                            │
│   • genera jwplc_hmi_bindings (variable HMI ↔ índice de variable PLC)   │
└─────────────────────────────────────────────────────────────────────────┘
                                   │ firmware
┌────────────────────────────── JWPLC Basic ──────────────────────────────┐
│ updateOutputBuffers(): foto PLC ─► variables HMI   (bindings)           │
│ hardwareService(): JWPLC_Display redibuja solo lo que cambió            │
│ teclas/setpoints ─► cola ─► updateInputBuffers() (inicio del scan)      │
│ IDLE (sistema) ⇄ USER (HMI del proyecto)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Cómo llega el Designer a OpenPLC

**Dentro del VPP firmado** (`vpp/tools/hmi-designer/`, unos 1,1 MB). El
manifest del dispositivo lo declara:

```json
"tools": [
  {
    "id": "hmi-designer",
    "title": "Pantalla HMI",
    "entry": "tools/hmi-designer/desktop.html",
    "modes": ["window", "tab"],
    "bridge": "jwplc-hmi-host/1",
    "projectFolder": "hmi"
  }
]
```

- **Una sola fuente**: el script de empaquetado del VPP copia
  `platform-jwplc/tools/jwplc-hmi-designer/poc` (versión etiquetada) dentro del
  VPP y lo firma. El `.exe` standalone se construye desde la misma etiqueta.
- **Actualizar el Designer = publicar un VPP nuevo**. No hace falta reinstalar
  OpenPLC, y la versión del Designer queda ligada a la del HAL que entiende su
  código.
- Alternativa descartada: que OpenPLC lance el `.exe` instalado aparte. Habría
  dos instalaciones con versiones que pueden no coincidir y menos control de
  la integridad.

### 5.2 Contrato del puente `jwplc-hmi-host/1`

El Designer deja de usar `window.JWPLCHMINative` directamente y pasa a usar un
**adaptador de anfitrión** con la misma interfaz en los tres casos:

| Función | Navegador / `.exe` / Arduino IDE | OpenPLC |
| --- | --- | --- |
| `getContext()` | Sketch vinculado | Proyecto, dispositivo, versión del VPP, pantalla 320 × 170 |
| `loadProject()` / `saveProject(jwhmi)` | Archivo `.jwhmi` del sketch | `Proyecto/hmi/pantalla.jwhmi` |
| `writeGeneratedHeader(text)` | `JWPLC_HMI_Generated.h` del sketch | `Proyecto/hmi/JWPLC_HMI_Generated.h` |
| `listVariables(filtro)` | — (no aplica) | Variables globales del proyecto: nombre, tipo IEC, dirección |
| `onLiveValues(cb)` | WebSerial (actual) | Valores del debugger de OpenPLC |
| `onHostCommand(cb)` | — | Guardar (Ctrl+S del editor), cerrar, tema claro/oscuro |
| `setDirty(bool)` | — | Marca de "sin guardar" en la pestaña |

Implementación:

- **Ventana (F3)**: `BrowserWindow` propio de OpenPLC, con un preload que
  expone el adaptador por IPC. Sin acceso a Node para el Designer.
- **Pestaña (F4)**: `iframe` dentro de la pestaña del editor. El adaptador
  habla con la pestaña por `postMessage`, validando origen y versión del
  contrato, y la pestaña reenvía al proceso principal.
- Los archivos se sirven por un protocolo propio de solo lectura (p. ej.
  `vpp-tool://<packageId>/...`), solo desde el VPP instalado y verificado.

### 5.3 Enlace de variables en modo OpenPLC

Cambio mínimo en el Designer: en el inspector aparece **"Variable PLC"** (lista
de `listVariables`, filtrada por tipo compatible), que se guarda en el campo:

```json
{ "type": "BOOL", "id": "FIELD_BOOL_2", "variable": "estado2",
  "plcBinding": { "var": "Bomba1_Marcha", "access": "R" } }
```

- El header del Designer **no cambia** (sigue declarando `bool estado2`).
- OpenPLC genera el código de enlace al compilar. El índice de cada variable
  se resuelve en cada compilación, como ya hace el debugger:

```cpp
// jwplc_hmi_bindings.cpp (generado por OpenPLC)
void jwplcHMIBindingsSnapshot()          // llamado desde updateOutputBuffers()
{
    estado2 = (*(IEC_BOOL *)get_var_addr(HMI_IDX_BOMBA1_MARCHA)) != 0;
    temperatura = (float)(*(IEC_REAL *)get_var_addr(HMI_IDX_TEMP));
}
```

Tipos:

| Variable PLC | Objeto | Regla |
| --- | --- | --- |
| `BOOL` | BOOL / ícono | Exacto |
| `INT`, `DINT`, `UINT`, ... | VALUE / BAR | Conversión a `float` |
| `REAL` | VALUE / BAR | Exacto |
| `STRING` | TEXT | Truncado a la capacidad, con advertencia |
| Otro | — | Error de compilación |

- **Consistencia**: el `.jwhmi` y el header llevan el mismo número de revisión.
  Si no coinciden (alguien editó uno sin guardar el otro), la compilación
  falla con "Abre Pantalla HMI y guarda".

### 5.4 Contrato del runtime

| Situación | Comportamiento |
| --- | --- |
| Arranque | IDLE o la pantalla inicial (configurable); `jwplcHMISetup()` en `hardwareInit()` |
| Scan normal | `jwplcHMIBindingsSnapshot()` en `updateOutputBuffers()`. Presupuesto: < 50 µs con 32 enlaces (a medir en F0) |
| Tiempo libre | `hardwareService()` redibuja solo lo que cambió; objetivo de 5 Hz (los ensayos A14.3 dieron estable con 175–200 ms) |
| Escritura desde la HMI | Encolada; se aplica en `updateInputBuffers()`; se rechaza fuera de min/max; no pisa forzados |
| PLC en STOP o ERR | Franja de estado o salto a la IDLE; escrituras bloqueadas |
| Variable forzada | Se marca en pantalla (misma convención que la IDLE: rayado + F) |
| Proyecto sin HMI | Igual que hoy (solo IDLE), sin código extra |

---

## 6. Plan por fases

Cada fase cierra con un **gate**: pruebas automáticas, compilación de la matriz
de ejemplos y prueba en banco, documentados en `docs/` y en la bitácora.

### F0 — Prueba de concepto en el HAL (riesgo técnico)

- HAL de prueba con 3 fields: VALUE ← `%MW0`, BOOL ← `%QX0.0`, BAR ← `%MW1`,
  y un enlace **por nombre** con `get_var_addr(índice)`.
- Usar un header generado por el Designer actual (el BOOL ya compila).
- Medir el tiempo de scan con y sin HMI y la latencia variable → pantalla.

**Gate F0:** el ladder mueve los valores y se ven en la TFT; el scan no
aumenta más de 5 %; la IDLE, el debugger (USB/TCP) y el Backplane siguen
funcionando.

### F1 — Designer confiable (una sola herramienta = cero código roto)

Responsable principal: Andr3manuel.

- Corregir O1 a O5 y O7: solo se genera código que compila y que se dibuja
  igual en el equipo; los objetos sin soporte en el firmware quedan ocultos o
  marcados como "experimental" sin codegen.
- **CI del Designer**: Playwright crea cada tipo de objeto, genera el header y
  lo compila con `arduino-cli` (el procedimiento ya probado en la revisión del
  BOOL).
- Validar en hardware TEXT, VALUE, BOOL y BAR.
- Higiene del repo (O9) y versión etiquetada del Designer.

**Gate F1:** matriz "objeto × página × fuente" compila en CI; foto de la TFT
igual al lienzo para los 4 objetos básicos; `.jwhmi` de Alpha11 abren sin
pérdida.

### F2 — Contrato de anfitrión `jwplc-hmi-host/1`

- Reemplazar el uso directo de `JWPLCHMINative` por el adaptador de 5.2, con
  implementaciones para navegador, `.exe` y Arduino IDE (sin cambiar lo que
  ve el usuario hoy).
- Agregar en el inspector "Variable PLC" (solo cuando el anfitrión entrega
  `listVariables`), `plcBinding` en el `.jwhmi` y número de revisión compartido
  `.jwhmi` ↔ header.
- Un anfitrión simulado para pruebas automáticas.

**Gate F2:** el `.exe` y la extensión de Arduino IDE funcionan igual que
antes; con el anfitrión simulado se elige una variable, se guarda y se
regenera de forma determinista.

### F3 — OpenPLC abre el Designer en ventana vinculada

- **VPP**: carpeta `tools/hmi-designer/` firmada y entrada `tools` en el
  manifest; nueva versión firmada.
- **Editor (genérico)**:
  - lector de `tools` del manifest;
  - protocolo de solo lectura desde el VPP verificado;
  - ventana con preload y puente IPC;
  - botón "Pantalla HMI" en el dispositivo.
- **Editor (proyecto)**: carpeta `hmi/`, entrega de variables al Designer.
- **Compilación**: paso `generate-hmi` (revisión, validación de enlaces,
  `jwplc_hmi_bindings`), copia del header al bundle; el HAL llama
  `jwplcHMISetup()` y el *snapshot*.

**Gate F3:** un técnico abre "Pantalla HMI" desde OpenPLC, diseña 2 páginas,
enlaza lámparas, numéricos y una barra a variables de un ladder, compila,
descarga y lo ve en el equipo, **sin Arduino IDE y sin instalar nada aparte**.
Tests al 100 % en `src/backend/shared` y `src/frontend/utils`.

### F4 — Pestaña integrada en OpenPLC

- El mismo Designer en una pestaña del editor (`iframe` + `postMessage`).
- Marca de "sin guardar" en la pestaña, Ctrl+S del editor, tema claro y
  oscuro.
- Resolver los atajos que comparten el Designer y el editor (Ctrl+Z, Ctrl+C/V,
  Espacio, Supr): con el foco en la pestaña HMI mandan los del Designer.
- Al reabrir el proyecto, se reabre la pestaña.

**Gate F4:** el flujo de F3 completo sin salir de la ventana de OpenPLC; los
diálogos del editor se ven por encima de la pestaña; no hay pérdida de cambios
al cambiar de pestaña o cerrar el proyecto.

### F5 — Motor ampliado + operación (Alpha13 y siguientes)

Se avanza en paralelo con F2 a F4, en `JWPLC_Display`:

| Objeto | Uso típico |
| --- | --- |
| Texto fijo | Títulos sin variable |
| Lámpara multiestado | "PARADA / MARCHA / FALLA" |
| Ícono por estado (PixelMap) | Motor, válvula, bomba |
| Figuras estáticas dibujadas una vez por página | Fondo (resuelve O2) |
| Setpoint con teclas (↑/↓, OK, ESC, límites) | Ajustes |
| Tecla → bit (momentáneo, enclavado, set, reset) | Arranque, paro, reconocer |
| Navegación entre pantallas por tecla | Menús |
| BAR circular y con degradado (si se aprueban) | Indicadores |

En el Designer y en OpenPLC:

- **Vista en vivo**: el lienzo muestra los valores del debugger de OpenPLC.
- **Escrituras**: `access: "RW"` en `plcBinding`.

**Gate F5:** ejemplo de banco por objeto; setpoints y teclas respetan límites
y forzados; con el PLC en STOP las escrituras se bloquean; la vista en vivo
coincide con el equipo.

### F6 — Funciones de producto

- **Alarmas** (ISA-18.2 simplificado): lista ligada a bits, prioridad, hora
  del RTC, reconocimiento, banner, historial en FRAM.
- **Seguridad**: pantallas con clave (operador / mantenimiento).
- **Idiomas**: tabla de textos.
- **Símbolos industriales** y **plantillas** de pantalla.
- **Recomendado**: codegen del Designer como módulo puro (O6), que OpenPLC
  pueda ejecutar al compilar sin abrir la ventana. Esto elimina el riesgo de
  un header desactualizado.

**Gate F6:** prueba de aceptación con un caso real de demostración, revisada
por el jefe.

### F7 — Liberación industrial

- Manual de usuario (un solo manual del Designer, con un capítulo por
  anfitrión).
- Guía de estilo ISA-101 aplicada a 320 × 170.
- Ejemplos oficiales en el VPP.
- Matriz de compatibilidad editor ↔ VPP ↔ Designer ↔ core.
- Instalador reproducible y VPP firmado.
- Prueba de 72 h con HMI, Modbus TCP y Backplane.

**Gate F7:** checklist de liberación firmado; release publicado.

### 6.1 Resumen

| Fase | Entregable | Repo principal | Tamaño | Depende de |
| --- | --- | --- | --- | --- |
| F0 | Prueba de concepto en el HAL | platform-jwplc (VPP) | S | — |
| F1 | Designer confiable + CI de compilación | platform-jwplc (tools) | M | — |
| F2 | Contrato de anfitrión + "Variable PLC" | platform-jwplc (tools) | M | F1 |
| F3 | OpenPLC abre el Designer en ventana | openplc-editor + VPP | M | F0, F2 |
| F4 | Pestaña integrada | openplc-editor | M | F3 |
| F5 | Motor ampliado, vista en vivo, escrituras | platform-jwplc + ambos | L | F3 |
| F6 | Alarmas, seguridad, idiomas, codegen puro | ambos | L | F5 |
| F7 | Liberación industrial | ambos | M | F6 |

**Respecto de la rev. 1:**

- Desaparece el editor React propio en OpenPLC (era la fase más grande).
- El trabajo de interfaz se concentra en el Designer.
- OpenPLC aporta el anfitrión, las variables y la compilación.

---

## 7. Calidad y verificación

| Nivel | Qué se prueba | Herramienta |
| --- | --- | --- |
| Designer | Crear cada objeto, generar y compilar | Playwright + `arduino-cli` en CI |
| Contrato | `jwplc-hmi-host/1` con un anfitrión simulado | Tests del Designer |
| Editor | Host de herramientas, protocolo, puente, `generate-hmi` | Jest (100 % en `shared`/`utils`) + e2e |
| Paridad | Lienzo contra TFT por objeto y fuente | Captura contra foto o volcado |
| Rendimiento | Scan, latencia, refresco, flash, RAM | Instrumentación tipo `[RTU-TIMING]` |
| Robustez | STOP/ERR, forzados, HMI desactualizada, 72 h | Banco |
| Seguridad | Solo archivos del VPP verificados; el Designer sin Node; mensajes del puente validados | Revisión + tests |

Reglas que se mantienen: nunca integrar el bypass de firma VPP (`75272a4fb`);
versión del VPP monotónica y firmada en cada cambio del payload (ahora también
cuando cambia el Designer).

---

## 8. Organización sugerida

| Rol | Responsabilidad |
| --- | --- |
| Jefe de proyecto | Aprueba los gates, el alcance de cada alpha y los releases |
| HMI Designer (Andr3manuel) | F1, F2, objetos nuevos del lado del Designer, vista en vivo en el lienzo |
| Integración OpenPLC | F0, F3, F4, `generate-hmi`, HAL, empaquetado del Designer en el VPP |
| Firmware / librerías | F5: objetos nuevos en `JWPLC_Display`, regeneración de `.a` |
| Banco | Pruebas físicas de cada gate |

**Interfaces acordadas entre los equipos:**

- el contrato `jwplc-hmi-host/1`;
- el formato `.jwhmi` (incluido `plcBinding` y la revisión);
- la API pública de `JWPLC_Display`.

Cualquier cambio en ellas se revisa entre ambos frentes.

---

## 9. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El Designer genera código que no compila (hoy pasa con figuras y BAR nuevos) | F1 antes de integrar; CI de compilación obligatoria para publicar una versión |
| Header desactualizado respecto al `.jwhmi` | Revisión compartida y error de compilación; codegen puro en F6 |
| Conflictos de atajos y foco en la pestaña | F3 en ventana primero; en F4, el foco decide quién maneja los atajos |
| El VPP crece (+1,1 MB) y cada cambio del Designer obliga a firmar un VPP nuevo | Aceptable; a cambio, versión del Designer y del HAL siempre coherentes |
| Ejecutar contenido web dentro del editor | Solo archivos firmados, protocolo de solo lectura, sin Node, puente con lista blanca de mensajes |
| El dibujo afecta al scan o al Backplane | F0 primero; dibujo solo en el tiempo libre |
| Merges con upstream | Mecanismo genérico de herramientas VPP, en módulos propios del fork |

---

## 10. Decisiones pendientes del jefe

1. ¿Se confirma que el Designer viaja dentro del VPP (recomendado) y no como
   instalación aparte?
2. ¿F3 (ventana) como primer entregable y F4 (pestaña) después, o directo a la
   pestaña?
3. ¿BAR circular y con degradado entran en Alpha13 o se ocultan hasta tener
   soporte en el firmware?
4. ¿Las escrituras desde la HMI (setpoints, teclas) entran con F3 o con F5?
5. ¿Arranque en IDLE o en la pantalla del usuario por defecto?
6. ¿Nombre y base de las ramas (la del Designer tiene paréntesis)?
