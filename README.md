# Open PLC Editor - IDE

![GitHub stars](https://img.shields.io/github/stars/Autonomy-Logic/openplc-editor?color=fa6470)
![GitHub issues](https://img.shields.io/github/issues/Autonomy-Logic/openplc-editor?color=d8b22d)

<p align="center">
<img alt="draft-cover" src="assets/images/github-background.png">
</p>

## JWPLC Edition (JW Control)

Este fork es el **OpenPLC Editor – JWPLC Edition** para el **JWPLC Basic** de JW Control. Versión actual:
**4.2.8-jwplc.9**, que acompaña al package `jwplc:esp32@2.1.0-alpha.16`.

| Qué | Descarga |
|---|---|
| Editor (Windows x64, con el **JWPLC HMI Designer 2.1.0-alpha.16** incluido) | [`OpenPLC-Editor.exe`](https://github.com/JW-Control/openplc-editor/releases/download/jwplc-editor-v4.2.8-jwplc.9/OpenPLC-Editor.exe) · [notas y SHA-256](https://github.com/JW-Control/openplc-editor/releases/tag/jwplc-editor-v4.2.8-jwplc.9) |
| Paquete de placas **JWPLC Basic (VPP) 2.1.0-alpha.16**, firmado | [`JWPLC-Basic.vpp`](https://github.com/JW-Control/openplc-editor/releases/download/jwplc-editor-v4.2.8-jwplc.9/JWPLC-Basic.vpp) |
| Package Arduino, HMI Designer para Arduino IDE y documentación | [JW-Control/platform-jwplc](https://github.com/JW-Control/platform-jwplc) |
| **JWPLC Sim**: corre un proyecto de OpenPLC simulado en la PC, sin placa | [JW-Control/jwplc-sim](https://github.com/JW-Control/jwplc-sim/releases/latest) |

Instalación: ejecutar `OpenPLC-Editor.exe` (actualiza una JWPLC Edition anterior; si SmartScreen avisa, **Más
información → Ejecutar de todas formas**), importar `JWPLC-Basic.vpp` y elegir la placa **JWPLC BASIC**. Las
notas de cada versión están en [`docs/jwplc/releases/`](docs/jwplc/releases/).

## Running a preview version

In order to run the development version, clone the repository, and install dependencies via `npm`, you need network access.

You'll need the following tools:

- [Git](https://git-scm.com/)
- [NodeJS](https://nodejs.org/en/download/), version `>=20 <24`

### Step by step

- Clone the repository locally and go to the project folder.

```bash
git clone https://github.com/Autonomy-Logic/openplc-editor.git

cd openplc-editor
```

- Install the dependencies

```bash
npm install
```

- Run the development script

```bash
npm run dev
```

## Releasing a New Version

The project uses GitHub Actions to automatically build and release new versions for all supported platforms (macOS, Windows, and Linux) in both x64 and ARM64 architectures.

### Creating a Release

To create a new release, simply create and push a new tag with the version number:

```bash
git tag v4.2.0
git push origin v4.2.0
```

This will automatically:
1. Build the application for all platforms (macOS, Windows, Linux) and architectures (x64, ARM64)
2. Sign and notarize the macOS builds
3. Create a GitHub Release with all artifacts attached
4. Generate release notes based on commits since the last release

### Version Naming

- Use semantic versioning: `vMAJOR.MINOR.PATCH` (e.g., `v4.2.0`)
- For pre-releases, add a suffix: `v4.2.0-beta`, `v4.2.0-alpha`, or `v4.2.0-rc1`
- Pre-release tags will be marked as pre-releases on GitHub

### Manual Workflow Trigger

You can also trigger the build workflow manually from the GitHub Actions tab without creating a release. This is useful for testing builds:

1. Go to Actions > Build and Release
2. Click "Run workflow"
3. Optionally specify a version number
4. Click "Run workflow"

Note: Manual triggers will build all artifacts but won't create a GitHub Release (releases are only created when pushing a tag).

## Documentation

Please go to the repository [wiki](https://github.com/Autonomy-Logic/openplc-editor/wiki) page to get instruction about the project.

## Project Management

Go to [project](https://github.com/orgs/Autonomy-Logic/projects/4) management page to see the current state of the project.

## Issues

Go to [issues](https://github.com/Autonomy-Logic/openplc-editor/issues) page to view the current state of issues in the project.
