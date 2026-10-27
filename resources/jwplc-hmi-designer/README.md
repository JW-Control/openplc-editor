# JWPLC HMI Designer (copia para el instalador)

El workflow `.github/workflows/jwplc-edition-prerelease.yml` copia aquí, en `poc/`, los archivos web del
JWPLC HMI Designer desde platform-jwplc (`tools/jwplc-hmi-designer/poc`, commit fijado en el workflow).
electron-builder los empaqueta en `resources/jwplc-hmi-designer/poc` y el editor los abre con «Abrir HMI
Designer» (`src/main/modules/hmi-designer/index.ts`).

En desarrollo `poc/` no existe (está en `.gitignore`): el editor usa `JWPLC_HMI_DESIGNER_DIR` o el checkout
vecino `../platform-jwplc/tools/jwplc-hmi-designer/poc`.
