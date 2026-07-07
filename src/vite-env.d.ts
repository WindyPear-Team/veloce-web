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
    onBuiltinServerStatus: (callback: (status: BuiltinServerStatus) => void) => () => void
  }
}
