import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Layout } from "./components/layout/Layout"
import Dashboard from "./pages/Dashboard"
import Channels from "./pages/Channels"
import Models from "./pages/Models"
import Users from "./pages/Users"
import Logs from "./pages/Logs"
import Login from "./pages/Login"
import Setup from "./pages/Setup"
import Home from "./pages/Home"
import ModelCatalog from "./pages/ModelCatalog"
import Settings from "./pages/Settings"
import APIKeys from "./pages/APIKeys"
import Chat from "./pages/Chat"
import Images from "./pages/Images"
import SystemManagement from "./pages/SystemManagement"
import AdminOverview from "./pages/AdminOverview"
import PublicContent from "./pages/PublicContent"
import StatusPage from "./pages/StatusPage"
import api from "./lib/api"
import { I18nProvider, useI18n } from "./lib/i18n"
import type { TranslationKey } from "./lib/i18n"
import type { PublicSettings } from "./lib/public-settings"
import { withPublicSettingsDefaults } from "./lib/public-settings"

const queryClient = new QueryClient()

type Language = "zh" | "en"

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

interface CurrentUser {
  is_admin: boolean
}

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

const ProtectedRoute = ({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode
  isAuthenticated: boolean
}) => {
  const location = useLocation()
  if (!isAuthenticated && location.pathname !== "/login") {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { t } = useI18n()
  const { data: user, isLoading } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
  }
  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

const SetupGate = ({ children }: { children: React.ReactNode }) => {
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
    return <Navigate to={localStorage.getItem("token") ? "/dashboard" : "/login"} replace />
  }

  return <>{children}</>
}

const DocumentTitle = () => {
  const location = useLocation()
  const { language, t } = useI18n()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)

  useEffect(() => {
    const siteName = publicSettings.site_name.trim() || "flai"
    const pageTitle = pageTitleForPath(location.pathname, language, t)
    document.title = pageTitle && pageTitle !== siteName ? `${pageTitle} - ${siteName}` : siteName
  }, [language, location.pathname, publicSettings.site_name, t])

  return null
}

function pageTitleForPath(pathname: string, language: Language, t: Translate) {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/"
  const publicTitles =
    language === "zh"
      ? {
          "/": "首页",
          "/setup": "初始化站点",
          "/login": "登录",
          "/models": "模型列表",
          "/status": "状态监测",
          "/about": "关于",
          "/privacy": "隐私政策",
          "/terms": "用户协议",
        }
      : {
          "/": "Home",
          "/setup": "Initial Setup",
          "/login": "Sign in",
          "/models": "Models",
          "/status": "Status",
          "/about": "About",
          "/privacy": "Privacy",
          "/terms": "Terms",
        }

  if (normalizedPathname in publicTitles) {
    return publicTitles[normalizedPathname as keyof typeof publicTitles]
  }

  if (normalizedPathname === "/dashboard") {
    return t("dashboard.title")
  }
  if (normalizedPathname === "/dashboard/admin-overview") {
    return t("nav.adminOverview")
  }
  if (normalizedPathname.startsWith("/dashboard/admin/")) {
    return t("system.title")
  }
  if (normalizedPathname === "/dashboard/channels") {
    return t("channels.title")
  }
  if (normalizedPathname === "/dashboard/users") {
    return t("users.title")
  }
  if (normalizedPathname === "/dashboard/models") {
    return t("models.title")
  }
  if (normalizedPathname === "/dashboard/logs") {
    return t("usage.title")
  }
  if (normalizedPathname === "/dashboard/api-keys") {
    return t("settings.apiKeys")
  }
  if (normalizedPathname === "/dashboard/chat") {
    return language === "zh" ? "聊天" : "Chat"
  }
  if (normalizedPathname === "/dashboard/images") {
    return language === "zh" ? "AI 绘画" : "AI Images"
  }
  if (normalizedPathname === "/dashboard/settings") {
    return t("settings.title")
  }

  return ""
}

function App() {
  const [isAuthenticated] = useState(() => {
    const token = getTokenFromURL()
    if (token) {
      localStorage.setItem("token", token)
      localStorage.removeItem("referral_code")
      return true
    }
    return Boolean(localStorage.getItem("token"))
  })

  useEffect(() => {
    const token = getTokenFromURL()
    if (token) {
      localStorage.setItem("token", token)
      localStorage.removeItem("referral_code")
      window.history.replaceState(null, "", "/dashboard")
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <DocumentTitle />
          <SetupGate>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/login" element={<Login />} />
              <Route path="/models" element={<ModelCatalog />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/about" element={<PublicContent kind="about" />} />
              <Route path="/privacy" element={<PublicContent kind="privacy" />} />
              <Route path="/terms" element={<PublicContent kind="terms" />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute isAuthenticated={isAuthenticated}>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route
                  path="admin-overview"
                  element={
                    <AdminRoute>
                      <AdminOverview />
                    </AdminRoute>
                  }
                />
                <Route path="admin" element={<Navigate to="/dashboard/admin/general" replace />} />
                <Route
                  path="admin/general"
                  element={
                    <AdminRoute>
                      <SystemManagement section="general" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/auth"
                  element={
                    <AdminRoute>
                      <SystemManagement section="auth" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/content"
                  element={
                    <AdminRoute>
                      <SystemManagement section="content" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/operations"
                  element={
                    <AdminRoute>
                      <SystemManagement section="operations" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/subscriptions"
                  element={
                    <AdminRoute>
                      <SystemManagement section="operations" initialTab="subscriptionPlans" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="admin/redeem-codes"
                  element={
                    <AdminRoute>
                      <SystemManagement section="operations" initialTab="redeemCodes" />
                    </AdminRoute>
                  }
                />
                <Route
                  path="channels"
                  element={
                    <AdminRoute>
                      <Channels />
                    </AdminRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <AdminRoute>
                      <Users />
                    </AdminRoute>
                  }
                />
                <Route
                  path="models"
                  element={
                    <AdminRoute>
                      <Models />
                    </AdminRoute>
                  }
                />
                <Route path="logs" element={<Logs />} />
                <Route path="api-keys" element={<APIKeys />} />
                <Route path="chat" element={<Chat />} />
                <Route path="images" element={<Images />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SetupGate>
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  )
}

export default App
