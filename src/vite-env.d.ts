/// <reference types="vite/client" />

interface BuiltinServerStatus {
  enabled: boolean
  running: boolean
  phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
  message: string
  serverURL: string
  version: string
}

interface DesktopProcessStatus {
  generatedAt: string
  processes: Array<{
    id: string
    kind: "builtin-server" | "connector"
    running: boolean
    phase: "idle" | "checking" | "downloading" | "starting" | "running" | "error"
    message: string
    pid: number | null
    version: string
    serverURL?: string
    mode?: string
    enabled?: boolean
    startedAt?: string
  }>
}

interface Window {
  veloceDesktop?: {
    getBuiltinServerStatus: () => Promise<BuiltinServerStatus>
    getDesktopProcessStatus: () => Promise<DesktopProcessStatus>
    terminateDesktopProcess: (id: string) => Promise<DesktopProcessStatus>
    setBuiltinServerEnabled: (enabled: boolean) => Promise<BuiltinServerStatus>
    startConnector: (input: {
      serverURL: string
      token: string
      mode: "platform" | "web_server"
      webPort?: number
    }) => Promise<{ ok: boolean; message: string; version: string }>
    onBuiltinServerStatus: (callback: (status: BuiltinServerStatus) => void) => () => void
    onDesktopProcessStatus: (callback: (status: DesktopProcessStatus) => void) => () => void
  }
}
