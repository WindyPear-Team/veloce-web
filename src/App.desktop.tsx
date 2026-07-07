import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query"
import { Server } from "lucide-react"
import Login from "./pages/Login"
import Setup from "./pages/Setup"
import AdvancedChat from "./pages/AdvancedChat"
import api, { desktopServerStorageKey, getDesktopServerURL, normalizeServerURL } from "./lib/api"
import { I18nProvider, useI18n } from "./lib/i18n"
import { ThemeProvider } from "./lib/theme"
import { ToastProvider } from "./components/ui/toast"
import { Button } from "./components/ui/button"
import { Input } from "./components/ui/input"

const queryClient = new QueryClient()

interface SetupStatus {
  required: boolean
}

const getTokenFromURL = () => {
  const hash = window.location.hash
  if (hash.startsWith("#token=")) {
    return hash.substring("#token=".length)
  }

  const hashQueryIndex = hash.indexOf("?")
  if (hashQueryIndex >= 0) {
    const token = new URLSearchParams(hash.substring(hashQueryIndex + 1)).get("token")
    if (token) {
      return token
    }
  }

  return new URLSearchParams(window.location.search).get("token")
}

const hasAuthToken = () => Boolean(localStorage.getItem("token") || getTokenFromURL())

function TokenBridge() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const token = getTokenFromURL()
    if (!token) {
      return
    }
    localStorage.setItem("token", token)
    localStorage.removeItem("referral_code")
    navigate("/chat", { replace: true })
  }, [location.key, navigate])

  return null
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!hasAuthToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

function SetupGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { t } = useI18n()
  const { data, isLoading } = useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const res = await api.get("/setup/status")
      return res.data
    },
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    )
  }

  if (data?.required && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />
  }

  if (!data?.required && location.pathname === "/setup") {
    return <Navigate to={hasAuthToken() ? "/chat" : "/login"} replace />
  }

  return <>{children}</>
}

function DocumentTitle() {
  const location = useLocation()
  const { language, t } = useI18n()

  useEffect(() => {
    const pageTitle = location.pathname.startsWith("/chat")
      ? t("nav.chat")
      : location.pathname === "/setup"
        ? language === "zh" ? "初始化站点" : "Initial Setup"
        : language === "zh" ? "登录" : "Sign in"
    document.title = `${pageTitle} - Veloce Desktop`
  }, [language, location.pathname, t])

  return null
}

function DesktopServerSelector() {
  const { language } = useI18n()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(() => getDesktopServerURL())
  const copy = language === "zh"
    ? { label: "服务器", placeholder: "http://localhost:12789", save: "保存" }
    : { label: "Server", placeholder: "http://localhost:12789", save: "Save" }

  const saveServer = () => {
    const nextURL = normalizeServerURL(value)
    localStorage.setItem(desktopServerStorageKey, nextURL)
    setValue(nextURL)
    queryClient.clear()
    window.location.reload()
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex w-[min(480px,calc(100vw-2rem))] items-center gap-2 rounded-md border bg-background/95 p-2 shadow-lg backdrop-blur">
      <div className="flex shrink-0 items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
        <Server size={15} />
        <span>{copy.label}</span>
      </div>
      <Input
        value={value}
        placeholder={copy.placeholder}
        className="h-8 min-w-0 text-xs"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            saveServer()
          }
        }}
      />
      <Button className="h-8 shrink-0 px-3 text-xs" onClick={saveServer}>
        {copy.save}
      </Button>
    </div>
  )
}

function DesktopRoutes() {
  return (
    <HashRouter>
      <TokenBridge />
      <DocumentTitle />
      <DesktopServerSelector />
      <SetupGate>
        <Routes>
          <Route path="/" element={<Navigate to={hasAuthToken() ? "/chat" : "/login"} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route
            path="/chat/*"
            element={
              <ProtectedRoute>
                <AdvancedChat />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={hasAuthToken() ? "/chat" : "/login"} replace />} />
        </Routes>
      </SetupGate>
    </HashRouter>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <ToastProvider>
            <DesktopRoutes />
          </ToastProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
