import { BrowserWindow, dialog } from 'electron'
import { promises } from 'fs'
import { join } from 'path'


type GetProjectPathProps = InstanceType<typeof BrowserWindow>

const getProjectPath = async (serviceManager: GetProjectPathProps) => {
  // Alpha7 project-parent picker policy: selected directory may contain other projects.
  // ProjectService resolves the final root as parent/projectName and protects
  // that final target from non-empty collisions before writing any files.
  const { canceled, filePaths } = await dialog.showOpenDialog(serviceManager, {
    title: 'Choose a parent directory for new project',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (canceled) {
    return {
      success: false,
      error: {
        title: 'Operation canceled',
        description: 'Operation canceled by the user.',
      },
    }
  }

  const [filePath] = filePaths


  return {
    success: true,
    path: filePath,
  }
}

const getOpenProjectPath = async (serviceManager: GetProjectPathProps) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(serviceManager, {
    title: 'Select a PLC project to open',
    properties: ['openDirectory'],
  })
  if (canceled) {
    return {
      success: false,
      error: {
        title: 'Operation canceled',
        description: 'Operation canceled by the user.',
      },
    }
  }

  const [filePath] = filePaths

  try {
    await promises.access(join(filePath, 'project.json'))
  } catch {
    return {
      success: false,
      error: {
        title: 'Invalid project',
        description: 'The selected directory is not a valid OpenPLC project. No project.json file found.',
      },
    }
  }

  return {
    success: true,
    path: filePath,
  }
}

export { getOpenProjectPath, getProjectPath }
