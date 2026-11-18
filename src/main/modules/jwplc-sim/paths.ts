import { join } from 'node:path'

const EXE_NAME = 'JWPLC Sim.exe'

/**
 * Where the JWPLC Sim installer puts the app on Windows, per-user first. The
 * installer lets the user choose another folder: those installs, and the
 * portable build, are located once with the file picker.
 */
export function installedSimPaths(env: NodeJS.ProcessEnv): string[] {
  const roots = [
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs'),
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
  ].filter((root): root is string => Boolean(root))
  return roots.flatMap((root) => [join(root, 'JWPLC Sim', EXE_NAME), join(root, 'jwplc-sim', EXE_NAME)])
}

/** The saved location wins over the default ones; a stale one is skipped. */
export function findSimExecutable(
  saved: unknown,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
): string | null {
  const candidates = [...(typeof saved === 'string' ? [saved] : []), ...installedSimPaths(env)]
  return candidates.find((path) => exists(path)) ?? null
}

/** With ELECTRON_RUN_AS_NODE inherited, the Sim would start as plain Node and never open. */
export function simEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const launchEnv = { ...env }
  delete launchEnv.ELECTRON_RUN_AS_NODE
  return launchEnv
}

/** The switch JWPLC Sim reads (app/lib/open-arg.mjs in jwplc-sim). */
export function simOpenArgument(projectPath: string): string {
  return `--jwsim-open=${projectPath}`
}
