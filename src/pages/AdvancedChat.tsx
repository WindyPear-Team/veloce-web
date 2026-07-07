import { BarChart3, Bot, Boxes, CalendarClock, Database, FileText, Globe2, Laptop, ListTree, Menu, MessageSquare, Palette, ScrollText, Send, Shield, SlidersHorizontal, Sparkles, UserCircle, Users, Video } from "lucide-react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import Chat from "./Chat"
import Agents from "./Agents"
import Skills from "./Skills"
import AdvancedChatMCP from "./AdvancedChatMCP"
import AdvancedChatFiles from "./AdvancedChatFiles"
import Images from "./Images"
import Videos from "./Videos"
import AdvancedChatDevices from "./AdvancedChatDevices"
import AdvancedChatSites from "./AdvancedChatSites"
import MessageChannels from "./MessageChannelsWorkspace"
import AdvancedChatDeliveries from "./AdvancedChatDeliveries"
import AdvancedChatScheduledTasks from "./AdvancedChatScheduledTasks"
import AgentGroupsPage from "./AgentGroupsPage"
import AgentTasks from "./AgentTasks"
import SystemManagement from "./SystemManagement"
import AdminOverview from "./AdminOverview"
import AdminAuditLogs from "./AdminAuditLogs"
import Channels from "./Channels"
import Models from "./Models"
import UsersPage from "./Users"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { Button } from "@/components/ui/button"
import { PageComponentSlots } from "@/components/layout/PageComponentSlots"
import { PageLayoutEditBar, PageLayoutEditorProvider } from "@/components/layout/PageLayoutEditor"
import { PageTransition } from "@/components/layout/PageTransition"
import api, { isDesktopTarget } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { pageKeyFromPathname } from "@/lib/page-layouts"
import type { PublicSettings } from "@/lib/public-settings"
import { isPremiumEdition, parseTopNavItems, withPublicSettingsDefaults } from "@/lib/public-settings"
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
  const { data: settings, isLoading: isSettingsLoading } = useQuery<PublicSettings>({
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
  const isPremium = isPremiumEdition(publicSettings)
  const topNavItems = parseTopNavItems(publicSettings.top_nav_items)
  const currentPageKey = pageKeyFromPathname(location.pathname)
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/session/")
  const transitionKey = isChatRoute ? "/chat" : location.pathname
  const layoutEditorLabel = language === "zh" ? (isLayoutEditing ? "退出编辑" : "可视化编辑") : isLayoutEditing ? "Exit editing" : "Visual editing"
  const viewportHeightClass = isDesktopTarget() ? "h-full" : "h-screen"

  if (isSettingsLoading) {
    return (
      <div className={cn("flex items-center justify-center bg-background text-sm text-muted-foreground", viewportHeightClass)}>
        {t("common.loading")}
      </div>
    )
  }

  return (
    <PageLayoutEditorProvider
      currentPageKey={currentPageKey}
      isEditing={isLayoutEditing}
      pageLayoutsRaw={publicSettings.page_layouts}
      onEditingChange={setIsLayoutEditing}
    >
    <div className={cn("flex flex-col overflow-hidden bg-background", viewportHeightClass)}>
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
          <AdvancedChatSidebar publicSettings={publicSettings} isAdmin={Boolean(user?.is_admin)} />
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
              <AdvancedChatSidebar className="w-full" publicSettings={publicSettings} isAdmin={Boolean(user?.is_admin)} onNavigate={() => setIsSidebarOpen(false)} />
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
            <PageTransition transitionKey={transitionKey}>
              <div className="space-y-6">
                {isChatRoute ? (
                  <Chat variant="advanced" />
                ) : (
                  <Routes>
                    <Route path="agents" element={<Agents />} />
                    <Route path="skills" element={<Skills />} />
                    <Route path="mcp" element={<AdvancedChatMCP />} />
                    <Route path="devices" element={<AdvancedChatDevices />} />
                    <Route path="sites" element={<AdvancedChatSites />} />
                    <Route path="agent-groups/*" element={<AgentGroupsPage />} />
                    <Route path="agent-tasks" element={<AgentTasks />} />
                    {isPremium && publicSettings.message_channel_enabled && <Route path="channels/*" element={<MessageChannels />} />}
                    {isPremium && <Route path="deliveries" element={<AdvancedChatDeliveries />} />}
                    {isPremium && <Route path="scheduled-tasks" element={<AdvancedChatScheduledTasks />} />}
                    <Route path="images" element={<Images />} />
                    <Route path="videos" element={<Videos />} />
                    {isPremium && <Route path="files" element={<AdvancedChatFiles />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin-overview" element={<AdminOverview />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin-logs" element={<AdminAuditLogs />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin/general" element={<SystemManagement section="general" />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin/theme" element={<SystemManagement section="theme" />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin/auth" element={<SystemManagement section="auth" />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin/content" element={<SystemManagement section="content" />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin/operations" element={<SystemManagement section="operations" />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin/advanced-chat" element={<SystemManagement section="advancedChat" />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin-channels" element={<Channels />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin-models" element={<Models />} />}
                    {isDesktopTarget() && user?.is_admin && <Route path="admin-users" element={<UsersPage />} />}
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                  </Routes>
                )}
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

function AdvancedChatSidebar({
  className,
  publicSettings,
  isAdmin,
  onNavigate,
}: {
  className?: string
  publicSettings: PublicSettings
  isAdmin: boolean
  onNavigate?: () => void
}) {
  const location = useLocation()
  const { language, t } = useI18n()
  const isPremium = isPremiumEdition(publicSettings)
  const filesLabel = language === "zh" ? "文件库" : "Files"
  const messageChannelsLabel = language === "zh" ? "消息通道" : "Message Channels"
  const deliveriesLabel = language === "zh" ? "结果投递" : "Result Delivery"
  const scheduledTasksLabel = language === "zh" ? "计划任务" : "Scheduled Tasks"
  const agentGroupsLabel = language === "zh" ? "工作室" : "Agent Studios"
  const agentTasksLabel = language === "zh" ? "\u4ee3\u7406\u4efb\u52a1" : "Agent Tasks"
  const sitesLabel = language === "zh" ? "站点" : language === "ja" ? "サイト" : "Sites"
  const adminItems = [
    { href: "/chat/admin-overview", label: t("nav.adminOverview"), icon: BarChart3, active: location.pathname === "/chat/admin-overview" },
    { href: "/chat/admin-logs", label: t("nav.auditLogs"), icon: ScrollText, active: location.pathname === "/chat/admin-logs" },
    { href: "/chat/admin/general", label: t("nav.system"), icon: Shield, active: location.pathname.startsWith("/chat/admin/") },
    { href: "/chat/admin-channels", label: t("nav.channels"), icon: Database, active: location.pathname === "/chat/admin-channels" },
    { href: "/chat/admin-models", label: t("nav.models"), icon: Boxes, active: location.pathname === "/chat/admin-models" },
    { href: "/chat/admin-users", label: t("nav.users"), icon: Users, active: location.pathname === "/chat/admin-users" },
  ]
  const systemSubItems = [
    { href: "/chat/admin/general", label: t("nav.systemGeneral") },
    { href: "/chat/admin/theme", label: t("nav.systemTheme") },
    { href: "/chat/admin/auth", label: t("nav.systemAuth") },
    { href: "/chat/admin/content", label: t("nav.systemContent") },
    { href: "/chat/admin/operations", label: t("nav.systemOperations") },
    { href: "/chat/admin/advanced-chat", label: t("nav.systemAdvancedChat") },
  ]
  const items = [
    { href: "/chat", label: t("nav.chat"), icon: MessageSquare, active: location.pathname === "/chat" || location.pathname.startsWith("/chat/session/") },
    { href: "/chat/images", label: t("nav.images"), icon: Palette, active: location.pathname === "/chat/images" },
    { href: "/chat/videos", label: t("nav.videos"), icon: Video, active: location.pathname === "/chat/videos" },
    ...(isPremium ? [{ href: "/chat/files", label: filesLabel, icon: FileText, active: location.pathname === "/chat/files" }] : []),
    ...(isPremium && publicSettings.message_channel_enabled ? [{ href: "/chat/channels", label: messageChannelsLabel, icon: MessageSquare, active: location.pathname.startsWith("/chat/channels") }] : []),
    ...(isPremium ? [{ href: "/chat/deliveries", label: deliveriesLabel, icon: Send, active: location.pathname === "/chat/deliveries" }] : []),
    ...(isPremium ? [{ href: "/chat/scheduled-tasks", label: scheduledTasksLabel, icon: CalendarClock, active: location.pathname === "/chat/scheduled-tasks" }] : []),
    { href: "/chat/agents", label: t("nav.agents"), icon: Bot, active: location.pathname === "/chat/agents" },
    { href: "/chat/skills", label: t("nav.skills"), icon: Sparkles, active: location.pathname === "/chat/skills" },
    { href: "/chat/devices", label: t("nav.devices"), icon: Laptop, active: location.pathname === "/chat/devices" },
    { href: "/chat/sites", label: sitesLabel, icon: Globe2, active: location.pathname === "/chat/sites" },
    { href: "/chat/agent-groups", label: agentGroupsLabel, icon: Users, active: location.pathname.startsWith("/chat/agent-groups") },
    { href: "/chat/agent-tasks", label: agentTasksLabel, icon: ListTree, active: location.pathname === "/chat/agent-tasks" },
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
          {isDesktopTarget() && isAdmin && (
            <>
              <div className="my-2 border-t" />
              {adminItems.map((item) => (
                <div key={item.href}>
                  <Link
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
                  {item.href === "/chat/admin/general" && location.pathname.startsWith("/chat/admin/") && (
                    <div className="ml-9 mt-1 flex flex-col gap-1">
                      {systemSubItems.map((child) => (
                        <Link
                          key={child.href}
                          to={child.href}
                          onClick={onNavigate}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-xs transition-colors",
                            location.pathname === child.href ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
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
