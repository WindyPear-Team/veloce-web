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

interface DesktopSettings {
  httpProxy: string
  builtinServerPath: string
  connectorPath: string
  preparedUpdate?: {
    tagName: string
    assetName: string
    filePath: string
  } | null
}

interface DesktopUpdateResult {
  state: "ready" | "not_available" | "error"
  message: string
  version: string
  filePath?: string
}

interface DesktopTabState {
  id: string
  title: string
  serverURL: string
  path: string
}

interface Window {
  veloceDesktop?: {
    getBuiltinServerStatus: () => Promise<BuiltinServerStatus>
    getDesktopProcessStatus: () => Promise<DesktopProcessStatus>
    terminateDesktopProcess: (id: string) => Promise<DesktopProcessStatus>
    getDesktopSettings: () => Promise<DesktopSettings>
    saveDesktopSettings: (settings: DesktopSettings) => Promise<DesktopSettings>
    chooseDesktopFile: () => Promise<string>
    getDesktopSystemInfo: () => Promise<{ hostname: string; platform: string }>
    openInVSCode: (workspacePath: string) => Promise<{ ok: boolean; message: string }>
    checkDesktopUpdate: () => Promise<DesktopUpdateResult>
    installPreparedDesktopUpdate: () => Promise<{ ok: boolean; message: string }>
    getDesktopTabInitialState: () => Promise<{ windowID: number; tab: DesktopTabState | null }>
    detachDesktopTab: (input: DesktopTabState & { screenX: number; screenY: number }) => Promise<{ moved: boolean; targetWindowID?: number }>
    setBuiltinServerEnabled: (enabled: boolean) => Promise<BuiltinServerStatus>
    startConnector: (input: {
      serverURL: string
      token: string
      mode: "platform" | "web_server"
      webPort?: number
    }) => Promise<{ ok: boolean; message: string; version: string }>
    onBuiltinServerStatus: (callback: (status: BuiltinServerStatus) => void) => () => void
    onDesktopProcessStatus: (callback: (status: DesktopProcessStatus) => void) => () => void
    onDesktopTabReceived: (callback: (tab: DesktopTabState) => void) => () => void
  }
}
