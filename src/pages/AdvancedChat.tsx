import { Bot, Laptop, Menu, MessageSquare, Palette, SlidersHorizontal, Sparkles, UserCircle } from "lucide-react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import Chat from "./Chat"
import Agents from "./Agents"
import Skills from "./Skills"
import AdvancedChatMCP from "./AdvancedChatMCP"
import Images from "./Images"
import AdvancedChatDevices from "./AdvancedChatDevices"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { Button } from "@/components/ui/button"
import { PageComponentSlots } from "@/components/layout/PageComponentSlots"
import { PageLayoutEditBar, PageLayoutEditorProvider } from "@/components/layout/PageLayoutEditor"
import { PageTransition } from "@/components/layout/PageTransition"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { pageKeyFromPathname } from "@/lib/page-layouts"
import type { PublicSettings } from "@/lib/public-settings"
import { parseTopNavItems, withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  username?: string
  email?: string
  avatar_url?: string
  is_admin?: boolean
}

export default function AdvancedChat() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isLayoutEditing, setIsLayoutEditing] = useState(false)
  const location = useLocation()
  const { language, t } = useI18n()
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const topNavItems = parseTopNavItems(publicSettings.top_nav_items)
  const currentPageKey = pageKeyFromPathname(location.pathname)
  const layoutEditorLabel = language === "zh" ? (isLayoutEditing ? "退出编辑" : "可视化编辑") : isLayoutEditing ? "Exit editing" : "Visual editing"

  return (
    <PageLayoutEditorProvider
      currentPageKey={currentPageKey}
      isEditing={isLayoutEditing}
      pageLayoutsRaw={publicSettings.page_layouts}
      onEditingChange={setIsLayoutEditing}
    >
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            className="lg:hidden"
            variant="outline"
            size="icon"
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-label={isSidebarOpen ? t("advancedChat.closeMenu") : t("advancedChat.openMenu")}
            aria-expanded={isSidebarOpen}
          >
            <Menu size={18} />
          </Button>
          <Link to="/" className="flex min-w-0 items-center gap-2">
            {publicSettings.icon_url && <img src={publicSettings.icon_url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />}
            <span className="truncate text-sm font-semibold">{publicSettings.site_name}</span>
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          {publicSettings.top_nav_enabled && topNavItems.length > 0 && (
            <div className="hidden min-w-0 items-center gap-4 text-sm text-muted-foreground lg:flex">
              {topNavItems.map((item) => (
                <TopNavLink key={`${item.label}-${item.href}`} label={item.label} href={item.href} external={item.external} />
              ))}
            </div>
          )}
          {user?.is_admin && (
            <Button
              variant={isLayoutEditing ? "default" : "outline"}
              size="icon"
              title={layoutEditorLabel}
              aria-label={layoutEditorLabel}
              disabled={!settings}
              onClick={() => setIsLayoutEditing((editing) => !editing)}
            >
              <SlidersHorizontal size={18} />
            </Button>
          )}
          <ThemeSwitcher />
          <UserAvatar user={user} />
        </div>
      </header>
      {user?.is_admin && <PageLayoutEditBar />}

      <div className="flex min-h-0 flex-1">
        <div className="hidden lg:block lg:h-full lg:shrink-0">
          <AdvancedChatSidebar />
        </div>

        {isSidebarOpen && (
          <div className="fixed inset-0 top-16 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label={t("advancedChat.closeMenu")}
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className="relative z-50 h-full w-72 max-w-[85vw]">
              <AdvancedChatSidebar className="w-full" onNavigate={() => setIsSidebarOpen(false)} />
            </div>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {publicSettings.announcement && (
            <div className="border-b bg-muted/50 px-4 py-3 text-sm sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl whitespace-pre-wrap">{publicSettings.announcement}</div>
            </div>
          )}
          <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">
            <PageTransition>
              <div className="space-y-6">
                <Routes>
                  <Route index element={<Chat variant="advanced" />} />
                  <Route path="agents" element={<Agents />} />
                  <Route path="skills" element={<Skills />} />
                  <Route path="mcp" element={<AdvancedChatMCP />} />
                  <Route path="devices" element={<AdvancedChatDevices />} />
                  <Route path="images" element={<Images />} />
                  <Route path="*" element={<Navigate to="/chat" replace />} />
                </Routes>
                <PageComponentSlots pageKey={currentPageKey} slotKey="after" />
              </div>
            </PageTransition>
          </div>
          {publicSettings.footer_text && (
            <footer className="border-t px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
              {publicSettings.footer_text}
            </footer>
          )}
        </main>
      </div>
    </div>
    </PageLayoutEditorProvider>
  )
}

function AdvancedChatSidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const location = useLocation()
  const { t } = useI18n()
  const items = [
    { href: "/chat", label: t("nav.chat"), icon: MessageSquare, active: location.pathname === "/chat" },
    { href: "/chat/images", label: t("nav.images"), icon: Palette, active: location.pathname === "/chat/images" },
    { href: "/chat/agents", label: t("nav.agents"), icon: Bot, active: location.pathname === "/chat/agents" },
    { href: "/chat/skills", label: t("nav.skills"), icon: Sparkles, active: location.pathname === "/chat/skills" },
    { href: "/chat/devices", label: t("nav.devices"), icon: Laptop, active: location.pathname === "/chat/devices" },
    { href: "/chat/mcp", label: t("nav.mcp"), icon: Bot, active: location.pathname === "/chat/mcp" },
  ]

  return (
    <aside className={cn("flex h-full w-64 flex-col border-r bg-card", className)}>
      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                item.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <item.icon size={18} />
              <span className="flex-1 truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
      <div className="shrink-0 border-t p-4">
        <LanguageSwitcher placement="top" />
      </div>
    </aside>
  )
}

function UserAvatar({ user }: { user?: CurrentUser }) {
  const { t } = useI18n()
  const label = user?.username || user?.email || t("common.user")
  const initials = avatarInitials(label)
  return (
    <Link
      to="/dashboard/settings"
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-semibold text-foreground hover:bg-accent"
      title={label}
      aria-label={label}
    >
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        initials
      ) : (
        <UserCircle size={20} />
      )}
    </Link>
  )
}

function avatarInitials(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

function TopNavLink({ label, href, external }: { label: string; href: string; external: boolean }) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    )
  }
  return <Link to={href}>{label}</Link>
}
