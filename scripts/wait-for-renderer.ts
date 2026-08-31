import http from 'http'

const port = Number(process.env.PORT || 1313)
const host = '127.0.0.1'
const path = '/index.html'
const totalTimeoutMs = Number(process.env.RENDERER_READY_TIMEOUT_MS || 300000)
const requestTimeoutMs = 2000
const retryDelayMs = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function probeRenderer(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false

    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      resolve(ready)
    }

    const request = http.get(
      {
        host,
        port,
        path,
        timeout: requestTimeoutMs,
      },
      (response) => {
        response.resume()
        const status = response.statusCode ?? 0
        finish(status >= 200 && status < 300)
      },
    )

    request.on('timeout', () => {
      request.destroy()
      finish(false)
    })

    request.on('error', () => finish(false))
  })
}

async function waitForRenderer(): Promise<void> {
  const startedAt = Date.now()
  console.log(`[dev] Waiting for renderer at http://${host}:${port}${path} ...`)

  while (Date.now() - startedAt < totalTimeoutMs) {
    if (await probeRenderer()) {
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
      console.log(`[dev] Renderer ready after ${elapsedSeconds}s. Starting Electron.`)
      return
    }

    await sleep(retryDelayMs)
  }

  throw new Error(
    `Renderer did not become ready at http://${host}:${port}${path} within ${Math.round(totalTimeoutMs / 1000)}s`,
  )
}

void waitForRenderer().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
