# VPP integrado (JWPLC Edition)

El workflow `jwplc-edition-prerelease.yml` deja aquí `JWPLC-Basic.vpp` (empaquetado
desde `platform-jwplc` en `PLATFORM_VPP_SHA` y verificado con la firma) y
`bundled.json` (`file`, `packageId`, `version`). electron-builder lo copia a
`resources/jwplc-vpp/` y el editor lo instala al arrancar si falta o es más viejo
(`src/main/modules/jwplc-bundled-vpp`). En desarrollo la carpeta queda sin paquete
y no se instala nada.
