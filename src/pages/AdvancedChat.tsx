import { BarChart3, Bot, Boxes, Brain, CalendarClock, ChevronRight, Database, FileText, Globe2, Home, Laptop, ListTree, Menu, MessageSquare, Palette, ScrollText, Send, Shield, SlidersHorizontal, Sparkles, UserCircle, Users, Video } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import Chat from "./Chat"
import Agents from "./Agents"
import Skills from "./Skills"
import AdvancedChatMCP from "./AdvancedChatMCP"
import AdvancedChatFiles from "./AdvancedChatFiles"
import AdvancedChatMemories from "./AdvancedChatMemories"
import Images from "./Images"
import Videos from "./Videos"
import AdvancedChatDevices, { AdvancedChatDeviceDetail } from "./AdvancedChatDevices"
import AdvancedChatSites from "./AdvancedChatSites"
import MessageChannels from "./MessageChannelsWorkspace"
import AdvancedChatDeliveries from "./AdvancedChatDeliveries"
import AdvancedChatScheduledTasks from "./AdvancedChatScheduledTasks"
import AgentGroupsPage from "./AgentGroupsPage"
import AgentTasks from "./AgentTasks"
import EnterpriseTasks from "./EnterpriseTasks"
import PersonalCompany from "./PersonalCompany"
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
import api, { apiURL, isDesktopTarget } from "@/lib/api"
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

interface AdvancedChatSidebarItem {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  children?: { href: string; label: string }[]
}

interface AdvancedChatSidebarGroup {
  id: string
  label: string
  items: AdvancedChatSidebarItem[]
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
  const isDesktop = isDesktopTarget()
  const topNavItems = parseTopNavItems(publicSettings.top_nav_items)
  const currentPageKey = pageKeyFromPathname(location.pathname)
  const isChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/session/")
  const transitionKey = isChatRoute ? "/chat" : location.pathname
  const layoutEditorLabel = language === "zh" ? (isLayoutEditing ? "退出编辑" : "可视化编辑") : isLayoutEditing ? "Exit editing" : "Visual editing"
  const viewportHeightClass = isDesktopTarget() ? "h-full" : "h-screen"

  useEffect(() => {
    if (!isDesktopTarget()) {
      return
    }
    window.parent?.postMessage({ type: "veloce-desktop-tab-title", title: desktopPageTitle(location.pathname, language), path: location.pathname }, "*")
  }, [language, location.pathname])

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
    <div className={cn("flex flex-col overflow-hidden", isDesktop ? "desktop-acrylic-window" : "bg-background", viewportHeightClass)}>
      {!isDesktop && <header className="z-30 flex h-16 shrink-0 items-center justify-between bg-background/95 px-4 backdrop-blur sm:px-6">
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
      </header>}
      {!isDesktop && user?.is_admin && <PageLayoutEditBar />}

      <div className={cn("flex min-h-0 flex-1", isChatRoute && "bg-background")}>
        <div className="hidden lg:block lg:h-full lg:shrink-0">
          <AdvancedChatSidebar className={isChatRoute ? "border-r-0 bg-background" : undefined} publicSettings={publicSettings} isAdmin={Boolean(user?.is_admin)} />
        </div>

        {isSidebarOpen && (
          <div className={cn("fixed inset-0 z-40 lg:hidden", isDesktop ? "top-0" : "top-16")}>
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label={t("advancedChat.closeMenu")}
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className="relative z-50 h-full w-72 max-w-[85vw]">
              <AdvancedChatSidebar className={cn("w-full", isChatRoute && "border-r-0 bg-background")} publicSettings={publicSettings} isAdmin={Boolean(user?.is_admin)} onNavigate={() => setIsSidebarOpen(false)} />
            </div>
          </div>
        )}

        <main className={cn("flex min-h-0 flex-1 flex-col", isChatRoute ? "overflow-hidden" : "overflow-y-auto")}>
          {!isChatRoute && publicSettings.announcement && (
            <div className="border-b bg-muted/50 px-4 py-3 text-sm sm:px-6 lg:px-8">
              <div className="mx-auto max-w-6xl whitespace-pre-wrap">{publicSettings.announcement}</div>
            </div>
          )}
          <div className={cn("w-full flex-1", isChatRoute ? "min-h-0" : "mx-auto max-w-6xl p-4 sm:p-6 lg:p-8")}>
            <PageTransition transitionKey={transitionKey} className={isChatRoute ? "h-full min-h-0" : undefined}>
              <div className={cn(isChatRoute ? "h-full" : "space-y-6")}>
                {isChatRoute ? (
                  <Chat variant="advanced" />
                ) : (
                  <Routes>
                    <Route path="agents" element={<Agents />} />
                    <Route path="skills" element={<Skills />} />
                    <Route path="skills/:id" element={<Skills />} />
                    <Route path="mcp" element={<AdvancedChatMCP />} />
                    <Route path="devices" element={<AdvancedChatDevices />} />
                    <Route path="devices/:id" element={<AdvancedChatDeviceDetail />} />
                    <Route path="sites" element={<AdvancedChatSites />} />
                    <Route path="agent-groups/:groupID/operations" element={<PersonalCompany />} />
                    <Route path="agent-groups/*" element={<AgentGroupsPage />} />
                    <Route path="agent-tasks" element={<AgentTasks />} />
                    <Route path="tasks" element={<EnterpriseTasks />} />
                    {publicSettings.message_channel_enabled && <Route path="channels/*" element={<MessageChannels />} />}
                    <Route path="deliveries" element={<AdvancedChatDeliveries />} />
                    <Route path="scheduled-tasks" element={<AdvancedChatScheduledTasks />} />
                    <Route path="images" element={<Images />} />
                    <Route path="videos" element={<Videos />} />
                    <Route path="files" element={<AdvancedChatFiles />} />
                    <Route path="memories" element={<AdvancedChatMemories />} />
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
          {!isChatRoute && publicSettings.footer_text && (
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

function desktopPageTitle(pathname: string, language: string) {
  const zh = language === "zh"
  if (pathname === "/chat" || pathname.startsWith("/chat/session/")) return zh ? "聊天" : "Chat"
  if (pathname === "/chat/images") return zh ? "图像" : "Images"
  if (pathname === "/chat/videos") return zh ? "视频" : "Videos"
  if (pathname === "/chat/files") return zh ? "文件库" : "Files"
  if (pathname === "/chat/memories") return zh ? "记忆" : "Memory"
  if (pathname.startsWith("/chat/channels")) return zh ? "消息通道" : "Message Channels"
  if (pathname === "/chat/deliveries") return zh ? "结果投递" : "Result Delivery"
  if (pathname === "/chat/scheduled-tasks") return zh ? "计划任务" : "Scheduled Tasks"
  if (pathname === "/chat/agents") return zh ? "助理" : "Agents"
  if (pathname === "/chat/skills" || pathname.startsWith("/chat/skills/")) return zh ? "技能" : "Skills"
  if (pathname === "/chat/devices" || pathname.startsWith("/chat/devices/")) return zh ? "设备" : "Devices"
  if (pathname === "/chat/sites") return zh ? "站点" : "Sites"
  if (pathname.includes("/agent-groups/") && pathname.endsWith("/operations")) return zh ? "工作室运营" : "Studio Operations"
  if (pathname.startsWith("/chat/agent-groups")) return zh ? "工作室" : "Agent Studios"
  if (pathname === "/chat/agent-tasks") return zh ? "代理任务" : "Agent Tasks"
  if (pathname === "/chat/mcp") return zh ? "MCP" : "MCP"
  if (pathname === "/chat/admin-overview") return zh ? "管理概览" : "Admin Overview"
  if (pathname === "/chat/admin-logs") return zh ? "审计日志" : "Audit Logs"
  if (pathname.startsWith("/chat/admin/")) return zh ? "系统设置" : "System"
  if (pathname === "/chat/admin-channels") return zh ? "渠道" : "Channels"
  if (pathname === "/chat/admin-models") return zh ? "模型" : "Models"
  if (pathname === "/chat/admin-users") return zh ? "用户" : "Users"
  return zh ? "聊天" : "Chat"
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
  const filesLabel = language === "zh" ? "文件库" : "Files"
  const memoriesLabel = language === "zh" ? "记忆" : "Memory"
  const messageChannelsLabel = language === "zh" ? "消息通道" : "Message Channels"
  const deliveriesLabel = language === "zh" ? "结果投递" : "Result Delivery"
  const scheduledTasksLabel = language === "zh" ? "计划任务" : "Scheduled Tasks"
  const agentGroupsLabel = language === "zh" ? "工作室" : "Agent Studios"
  const agentTasksLabel = language === "zh" ? "\u4ee3\u7406\u4efb\u52a1" : "Agent Tasks"
  const sitesLabel = language === "zh" ? "站点" : language === "ja" ? "サイト" : "Sites"
  const creationLabel = language === "zh" ? "创作" : language === "ja" ? "作成" : "Create"
  const workflowLabel = language === "zh" ? "工作流" : language === "ja" ? "ワークフロー" : "Workflows"
  const agentLabel = language === "zh" ? "代理" : language === "ja" ? "エージェント" : "Agents"
  const adminLabel = language === "zh" ? "管理" : language === "ja" ? "管理" : "Admin"
  const systemSubItems = [
    { href: "/chat/admin/general", label: t("nav.systemGeneral") },
    { href: "/chat/admin/theme", label: t("nav.systemTheme") },
    { href: "/chat/admin/auth", label: t("nav.systemAuth") },
    { href: "/chat/admin/content", label: t("nav.systemContent") },
    { href: "/chat/admin/operations", label: t("nav.systemOperations") },
    { href: "/chat/admin/advanced-chat", label: t("nav.systemAdvancedChat") },
  ]
  const adminItems: AdvancedChatSidebarItem[] = [
    { href: "/chat/admin-overview", label: t("nav.adminOverview"), icon: BarChart3, active: location.pathname === "/chat/admin-overview" },
    { href: "/chat/admin-logs", label: t("nav.auditLogs"), icon: ScrollText, active: location.pathname === "/chat/admin-logs" },
    { href: "/chat/admin/general", label: t("nav.system"), icon: Shield, active: location.pathname.startsWith("/chat/admin/"), children: systemSubItems },
    { href: "/chat/admin-channels", label: t("nav.channels"), icon: Database, active: location.pathname === "/chat/admin-channels" },
    { href: "/chat/admin-models", label: t("nav.models"), icon: Boxes, active: location.pathname === "/chat/admin-models" },
    { href: "/chat/admin-users", label: t("nav.users"), icon: Users, active: location.pathname === "/chat/admin-users" },
  ]
  const homeItem: AdvancedChatSidebarItem = {
    href: "/chat",
    label: t("nav.chat"),
    icon: MessageSquare,
    active: location.pathname === "/chat" || location.pathname.startsWith("/chat/session/"),
  }
  const directItems: AdvancedChatSidebarItem[] = [
    { href: "/chat/tasks", label: language === "zh" ? "任务" : "Tasks", icon: ListTree, active: location.pathname === "/chat/tasks" },
    { href: "/chat/files", label: filesLabel, icon: FileText, active: location.pathname === "/chat/files" },
  ]
  const groups: AdvancedChatSidebarGroup[] = [
    {
      id: "creation",
      label: creationLabel,
      items: [
        { href: "/chat/images", label: t("nav.images"), icon: Palette, active: location.pathname === "/chat/images" },
        { href: "/chat/videos", label: t("nav.videos"), icon: Video, active: location.pathname === "/chat/videos" },
      ],
    },
    {
      id: "workflow",
      label: workflowLabel,
      items: [
        ...(publicSettings.message_channel_enabled ? [{ href: "/chat/channels", label: messageChannelsLabel, icon: MessageSquare, active: location.pathname.startsWith("/chat/channels") }] : []),
        { href: "/chat/deliveries", label: deliveriesLabel, icon: Send, active: location.pathname === "/chat/deliveries" },
        { href: "/chat/scheduled-tasks", label: scheduledTasksLabel, icon: CalendarClock, active: location.pathname === "/chat/scheduled-tasks" },
      ],
    },
    {
      id: "agents",
      label: agentLabel,
      items: [
        { href: "/chat/agents", label: t("nav.agents"), icon: Bot, active: location.pathname === "/chat/agents" },
        { href: "/chat/memories", label: memoriesLabel, icon: Brain, active: location.pathname === "/chat/memories" },
        { href: "/chat/skills", label: t("nav.skills"), icon: Sparkles, active: location.pathname === "/chat/skills" || location.pathname.startsWith("/chat/skills/") },
        { href: "/chat/devices", label: t("nav.devices"), icon: Laptop, active: location.pathname === "/chat/devices" || location.pathname.startsWith("/chat/devices/") },
        { href: "/chat/sites", label: sitesLabel, icon: Globe2, active: location.pathname === "/chat/sites" },
        { href: "/chat/agent-groups", label: agentGroupsLabel, icon: Users, active: location.pathname.startsWith("/chat/agent-groups") },
        { href: "/chat/agent-tasks", label: agentTasksLabel, icon: ListTree, active: location.pathname === "/chat/agent-tasks" },
        { href: "/chat/mcp", label: t("nav.mcp"), icon: Bot, active: location.pathname === "/chat/mcp" },
      ],
    },
    ...(isDesktopTarget() && isAdmin ? [{ id: "admin", label: adminLabel, items: adminItems }] : []),
  ].filter((group) => group.items.length > 0)
  const [selectedGroupID, setSelectedGroupID] = useState("")
  const routeGroup = groups.find((group) => group.items.some((item) => item.active || item.children?.some((child) => location.pathname === child.href)))
  const activeGroup = groups.find((group) => group.id === selectedGroupID) || routeGroup
  const showingGroup = Boolean(activeGroup)

  useEffect(() => {
    if (homeItem.active) {
      setSelectedGroupID("")
      return
    }
    setSelectedGroupID(routeGroup?.id || "")
  }, [homeItem.active, location.pathname, routeGroup?.id])

  const renderSidebarLink = (item: AdvancedChatSidebarItem) => (
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
      {item.children && item.active && (
        <div className="ml-9 mt-1 flex flex-col gap-1">
          {item.children.map((child) => (
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
  )

  return (
    <aside className={cn("flex h-full w-64 flex-col border-r bg-card", className)}>
      <nav className="relative min-h-0 flex-1 overflow-hidden px-4 py-4">
        <div className={cn("h-full overflow-y-auto transition-transform duration-200 ease-out", showingGroup && "-translate-x-full")}>
          <div className="flex flex-col gap-1">
            {renderSidebarLink(homeItem)}
            {directItems.map((item) => renderSidebarLink(item))}
            <div className="my-2" />
            {groups.map((group) => {
              const firstItem = group.items[0]
              return (
                <Link
                  key={group.id}
                  to={firstItem.href}
                  onClick={() => setSelectedGroupID(group.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    group.id === routeGroup?.id ? "bg-muted text-foreground" : "hover:bg-muted"
                  )}
                >
                  <firstItem.icon size={18} />
                  <span className="flex-1 truncate">{group.label}</span>
                  <ChevronRight size={15} className="text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        </div>
        <div className={cn("absolute inset-0 h-full overflow-y-auto px-4 py-4 transition-transform duration-200 ease-out", showingGroup ? "translate-x-0" : "translate-x-full")}>
          {activeGroup && (
            <div className="flex flex-col gap-1">
              <div className="mb-3 flex items-center gap-1 border-b pb-3 text-sm">
                <Link
                  to="/chat"
                  onClick={() => setSelectedGroupID("")}
                  className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                  aria-label={t("nav.chat")}
                  title={t("nav.chat")}
                >
                  <Home size={16} />
                </Link>
                <ChevronRight size={14} className="text-muted-foreground" />
                <span className="min-w-0 truncate font-medium">{activeGroup.label}</span>
              </div>
              {activeGroup.items.map((item) => renderSidebarLink(item))}
            </div>
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
      to="/settings/profile"
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-semibold text-foreground hover:bg-accent"
      title={label}
      aria-label={label}
    >
      {user?.avatar_url ? (
        <img src={apiURL(user.avatar_url)} alt="" className="h-full w-full object-cover" />
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
