## OpenPLC Editor – JWPLC Edition 4.3.3-jwplc.1 (pre-release)

Editor de la alpha **2.1.0-alpha.17** de JWPLC (en curso). Es la JWPLC Edition puesta al día con
**OpenPLC Editor 4.3.3** de Autonomy, conservando todo lo propio de JW Control.

### Contenido

| Archivo | Qué es |
|---|---|
| `__EXE_NAME__` | Instalador de Windows x64 del editor (con el HMI Designer y el VPP JWPLC Basic incluidos) |
| `JWPLC-Basic.vpp` | El mismo paquete de placas que trae el instalador, por si se quiere importar a mano |
| `SHA256SUMS.txt` | Sumas de verificación |

### Instalación

1. Si tienes instalada una versión anterior de la JWPLC Edition, no hace falta desinstalarla: el instalador la
   actualiza.
2. Ejecuta el instalador `.exe`. No tiene firma de código: en el aviso de Windows SmartScreen pulsa
   **Más información › Ejecutar de todas formas**.
3. Abre el editor. **El VPP JWPLC Basic ya viene instalado**: al arrancar, el editor lo instala si falta o si el
   que tienes es más viejo (con la misma verificación de firma que «Add from file…»). Si instalaste a mano uno
   más nuevo, se respeta.

### Qué incluye esta versión

- **Base OpenPLC Editor 4.3.3:** editores LD/FBD más rápidos, autocompletado con miembros de bloques y
  estructuras, tipos de datos, variables RETAIN (sin almacenamiento en la placa por ahora), servidor Modbus como
  elemento del proyecto, firmware Modbus modular y búsqueda de equipos en red.
- **Modbus del JWPLC Basic:**
  - la configuración Modbus pasa a *Servers* del proyecto (RTU y TCP en un solo servidor);
  - **los proyectos de alpha.16 se migran solos** al abrirlos: se crea el servidor con los mismos datos y la red
    pasa a la pantalla *Network*. Se guarda una copia `devices/configuration.pre-4.3.backup.json`;
  - el firmware sigue usando el driver Ethernet propio (W5500 por SPI compartido, `JWPLC_Ethernet`) y el RS-485
    del equipo (`JWPLC_RS485`) cuando el servidor usa `Serial2`;
  - «Buscar» encuentra el equipo por el protocolo JWPLC y también por el de OpenPLC.
- **Actualizaciones automáticas** desde las releases de `JW-Control/openplc-editor` (aviso arriba de la ventana).
- **Sin cuenta Autonomy ni asistente de IA:** el inicio de sesión, los proyectos en la nube y la IA quedan
  desactivados.
- **Interfaz en español** por defecto (menús, inicio, diálogos, editores y avisos). El idioma se cambia en
  **Ver › Idioma**.
- **HMI Designer dentro de OpenPLC:** la entrada «HMI Designer» de *Device* abre una pestaña con la vista de
  enlaces de variables, con el tema claro u oscuro del editor. La ventana del Designer se abre solo con
  «Abrir HMI Designer para diseñar». Se retira el panel lateral azul de HMI.
- **Pantallas del VPP para 4.3:** *Serial* (USB y el RS-485 del Backplane), *Network* (MAC de fábrica del ESP32
  si se deja vacía) y *Backplane* (módulos de E/S remotas). El servidor Modbus nombra los puertos serie como
  los da el VPP.
- **arduino-cli sigue usando Arduino15 estándar**, así el modo developer (`jwplc_local`) funciona igual.
- Todo lo de 4.2.8-jwplc.9 (HMI Designer, zoom, consola acoplable).

### Limitaciones conocidas

- Pre-release de una alpha en curso.
- La depuración ya no va por RS-485: se depura por USB o por red.
- Algunos textos internos (mensajes de compilación y de servicios) siguen en inglés.
- RETAIN sobre la FRAM del JWPLC Basic: para una alpha posterior.
- Firmware Modbus/Ethernet: pendiente de prueba física en placa.
- Sólo Windows x64.

### Origen

- Editor: `JW-Control/openplc-editor`, merge de `v4.3.3` (Autonomy) sobre `release/v2.1.x`.
- HMI Designer y VPP: `JW-Control/platform-jwplc` en `PLATFORM_DESIGNER_SHA` y `PLATFORM_VPP_SHA` del
  workflow; firma del VPP verificada antes de empaquetar.
