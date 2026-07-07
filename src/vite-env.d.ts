/// <reference types="vite/client" />

interface BuiltinServerStatus {
  enabled: boolean
  running: boolean
  phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
  message: string
  serverURL: string
  version: string
}

interface Window {
  veloceDesktop?: {
    getBuiltinServerStatus: () => Promise<BuiltinServerStatus>
    setBuiltinServerEnabled: (enabled: boolean) => Promise<BuiltinServerStatus>
    startConnector: (input: {
      serverURL: string
      token: string
      mode: "platform" | "web_server"
      webPort?: number
    }) => Promise<{ ok: boolean; message: string; version: string }>
    onBuiltinServerStatus: (callback: (status: BuiltinServerStatus) => void) => () => void
  }
}
