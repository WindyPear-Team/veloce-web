import { useQuery } from "@tanstack/react-query"
import { Bot, CreditCard, LogOut, Menu, MessageSquare, Shield, UserCircle } from "lucide-react"
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import Settings, { type SettingsSection } from "./Settings"
import Wallet from "./Wallet"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { PageTransition } from "@/components/layout/PageTransition"
import { Button } from "@/components/ui/button"
import api, { isDesktopTarget } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
}

interface SettingsNavItem {
  href: string
  section?: SettingsSection
  label: string
  icon: typeof UserCircle
}

export default function SettingsWorkspace() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { language } = useI18n()
  const isDesktop = isDesktopTarget()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => (await api.get("/public/settings")).data,
  })
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/user/me")).data,
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const copy = settingsWorkspaceCopy(language)

  useEffect(() => {
    if (isDesktopTarget()) {
      window.parent?.postMessage({ type: "veloce-desktop-tab-title", title: desktopSettingsTitle(location.pathname, language), path: location.pathname }, "*")
    }
  }, [language, location.pathname])

  const logout = () => {
    localStorage.removeItem("token")
    navigate("/login", { replace: true })
  }

  return (
    <div className={cn("flex flex-col overflow-hidden bg-background", isDesktop ? "h-full min-h-0" : "h-screen")}>
      {!isDesktop && <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            className="lg:hidden"
            variant="outline"
            size="icon"
            aria-label={isSidebarOpen ? copy.closeMenu : copy.openMenu}
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((open) => !open)}
          >
            <Menu size={18} />
          </Button>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            {publicSettings.icon_url && <img src={publicSettings.icon_url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />}
            <span className="truncate text-sm font-semibold">{publicSettings.site_name}</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <button type="button" className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-semibold" title={user?.username || user?.email || copy.account}>
            {user?.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : avatarInitials(user?.username || user?.email || "") || <UserCircle size={20} />}
          </button>
        </div>
      </header>}

      <div className="flex min-h-0 flex-1">
        <SettingsSidebar pathname={location.pathname} copy={copy} onLogout={logout} />
        {isSidebarOpen && (
          <div className={cn("fixed inset-0 z-40 lg:hidden", isDesktop ? "top-0" : "top-16")}>
            <button type="button" className="absolute inset-0 bg-black/50" aria-label={copy.closeMenu} onClick={() => setIsSidebarOpen(false)} />
            <SettingsSidebar className="relative z-50 h-full w-72 max-w-[85vw]" pathname={location.pathname} copy={copy} onLogout={logout} onNavigate={() => setIsSidebarOpen(false)} />
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
            <PageTransition transitionKey={location.pathname}>
              <Routes>
                <Route index element={<Navigate to="profile" replace />} />
                <Route path="profile" element={<Settings section="profile" />} />
                <Route path="assistant" element={<Settings section="assistant" />} />
                <Route path="security" element={<Settings section="security" />} />
                <Route path="wallet" element={<Wallet />} />
                <Route path="*" element={<Navigate to="profile" replace />} />
              </Routes>
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  )
}

function SettingsSidebar({ pathname, copy, onLogout, className, onNavigate }: {
  pathname: string
  copy: ReturnType<typeof settingsWorkspaceCopy>
  onLogout: () => void
  className?: string
  onNavigate?: () => void
}) {
  const visibilityClass = className ? "flex flex-col" : "hidden lg:flex lg:flex-col"
  const items: SettingsNavItem[] = [
    { href: "/settings/profile", section: "profile", label: copy.account, icon: UserCircle },
    { href: "/settings/assistant", section: "assistant", label: copy.assistant, icon: Bot },
    { href: "/settings/security", section: "security", label: copy.security, icon: Shield },
    { href: "/settings/wallet", label: copy.wallet, icon: CreditCard },
  ]

  return (
    <aside className={cn(visibilityClass, "h-full min-h-0 w-60 shrink-0 border-r bg-background", className)}>
      <div className="shrink-0 px-4 pb-3 pt-5 text-sm font-semibold">{copy.title}</div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors hover:bg-muted", active && "bg-accent font-medium text-accent-foreground")}
            >
              <Icon size={17} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto shrink-0 space-y-1 border-t p-3">
        <Link to="/chat" onClick={onNavigate} className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <MessageSquare size={17} />
          <span>{copy.chat}</span>
        </Link>
        <button type="button" onClick={onLogout} className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <LogOut size={17} />
          <span>{copy.signOut}</span>
        </button>
      </div>
    </aside>
  )
}

function avatarInitials(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : ""
}

function settingsWorkspaceCopy(language: string) {
  if (language === "zh") return { title: "设置", account: "账户", assistant: "助手", security: "安全", wallet: "钱包", chat: "聊天", signOut: "退出登录", openMenu: "打开设置菜单", closeMenu: "关闭设置菜单" }
  if (language === "ja") return { title: "設定", account: "アカウント", assistant: "アシスタント", security: "セキュリティ", wallet: "ウォレット", chat: "チャット", signOut: "ログアウト", openMenu: "設定メニューを開く", closeMenu: "設定メニューを閉じる" }
  return { title: "Settings", account: "Account", assistant: "Assistant", security: "Security", wallet: "Wallet", chat: "Chat", signOut: "Sign out", openMenu: "Open settings menu", closeMenu: "Close settings menu" }
}

function desktopSettingsTitle(pathname: string, language: string) {
  const zh = language === "zh"
  if (pathname === "/settings/assistant") return zh ? "助手设置" : "Assistant settings"
  if (pathname === "/settings/security") return zh ? "安全设置" : "Security settings"
  if (pathname === "/settings/wallet") return zh ? "钱包" : "Wallet"
  return zh ? "账户设置" : "Account settings"
}
