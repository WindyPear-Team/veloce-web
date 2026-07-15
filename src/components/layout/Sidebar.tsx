import { BarChart3, Boxes, Building2, ChevronDown, ClipboardList, Database, History, KeyRound, LayoutDashboard, MessageSquare, Puzzle, ScrollText, Settings, Shield, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { TranslationKey } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { chatPathForSettings, withPublicSettingsDefaults } from "@/lib/public-settings"
import { cn } from "@/lib/utils"

interface CurrentUser {
  is_admin: boolean
}

interface MenuItem {
  icon: LucideIcon
  labelKey?: TranslationKey
  label?: string
  path: string
  settingKey?: keyof PublicSettings
  enterpriseOnly?: boolean
  children?: SystemSubItem[]
}

interface SystemSubItem {
  path: string
  labelKey: TranslationKey
}

const systemSubItems: SystemSubItem[] = [
  { path: "/dashboard/admin/general", labelKey: "nav.systemGeneral" },
  { path: "/dashboard/admin/theme", labelKey: "nav.systemTheme" },
  { path: "/dashboard/admin/auth", labelKey: "nav.systemAuth" },
  { path: "/dashboard/admin/content", labelKey: "nav.systemContent" },
  { path: "/dashboard/admin/operations", labelKey: "nav.systemOperations" },
  { path: "/dashboard/admin/advanced-chat", labelKey: "nav.systemAdvancedChat" },
]

const userMenuItems: MenuItem[] = [
  { icon: LayoutDashboard, labelKey: "nav.dashboard", path: "/dashboard", settingKey: "sidebar_dashboard_enabled" },
  { icon: BarChart3, labelKey: "nav.dataBoard", path: "/dashboard/data-board", settingKey: "sidebar_data_board_enabled" },
  { icon: History, labelKey: "nav.details", path: "/dashboard/logs", settingKey: "sidebar_usage_enabled" },
  { icon: KeyRound, labelKey: "nav.apiKeys", path: "/dashboard/api-keys", settingKey: "sidebar_api_keys_enabled" },
  { icon: MessageSquare, labelKey: "nav.chat", path: "/dashboard/chat", settingKey: "sidebar_chat_enabled" },
  { icon: ClipboardList, label: "任务", path: "/dashboard/tasks", enterpriseOnly: true },
  { icon: Settings, labelKey: "nav.settings", path: "/settings/profile", settingKey: "sidebar_settings_enabled" },
]

const adminMenuItems: MenuItem[] = [
  { icon: BarChart3, labelKey: "nav.adminOverview", path: "/dashboard/admin-overview", settingKey: "sidebar_admin_overview_enabled" },
  { icon: ScrollText, labelKey: "nav.auditLogs", path: "/dashboard/admin-logs", settingKey: "sidebar_admin_overview_enabled" },
  { icon: Shield, labelKey: "nav.system", path: "/dashboard/admin/general", settingKey: "sidebar_system_enabled", children: systemSubItems },
  { icon: Building2, label: "企业管理", path: "/dashboard/enterprise", enterpriseOnly: true },
  { icon: Database, labelKey: "nav.channels", path: "/dashboard/channels", settingKey: "sidebar_channels_enabled" },
  { icon: Boxes, labelKey: "nav.models", path: "/dashboard/models", settingKey: "sidebar_models_enabled" },
  { icon: Users, labelKey: "nav.users", path: "/dashboard/users", settingKey: "sidebar_users_enabled" },
  { icon: Puzzle, labelKey: "nav.plugins", path: "/dashboard/plugins" },
]

export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const location = useLocation()
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })
  const { data: pluginExtensions } = useQuery<unknown>({
    queryKey: ["plugins-frontend"],
    queryFn: async () => {
      const res = await api.get("/user/plugins/frontend")
      return res.data
    },
    enabled: Boolean(user),
  })
  const publicSettings = withPublicSettingsDefaults(settings)
  const chatPath = chatPathForSettings()
  const visibleUserItems = userMenuItems
    .map((item) => {
      if (item.labelKey === "nav.chat") {
        return { ...item, path: chatPath }
      }
      return item
    })
    .filter((item) => (!item.settingKey || publicSettings[item.settingKey] !== false) && (!item.enterpriseOnly || publicSettings.system_mode === "enterprise"))
  const visibleAdminItems = adminMenuItems
    .filter((item) => !item.settingKey || publicSettings[item.settingKey] !== false)
    .map((item) => item.path === "/dashboard/users" && publicSettings.system_mode === "enterprise" ? { ...item, label: "员工管理", labelKey: undefined } : item)
  const pluginItems = pluginSidebarItems(pluginExtensions)

  return (
    <div className={cn("flex h-full w-64 flex-col border-r bg-card", className)}>
      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1">
          {visibleUserItems.map((item) => (
            <SidebarLink key={item.path} item={item} active={location.pathname === item.path} onNavigate={onNavigate} />
          ))}
          {user?.is_admin && visibleAdminItems.length > 0 && (
            <>
              <div className="my-2 border-t" />
              {visibleAdminItems.map((item) => (
                <SidebarLink
                  key={item.path}
                  item={item}
                  active={isSidebarItemActive(location.pathname, item)}
                  currentPath={location.pathname}
                  onNavigate={onNavigate}
                />
              ))}
              {pluginItems.map((item) => (
                <SidebarLink key={item.path} item={item} active={location.pathname === item.path || location.pathname.startsWith(item.path + "/")} onNavigate={onNavigate} />
              ))}
            </>
          )}
        </div>
      </nav>
      <div className="shrink-0 border-t p-4">
        <LanguageSwitcher placement="top" />
      </div>
    </div>
  )
}

function SidebarLink({
  item,
  active,
  currentPath = "",
  onNavigate,
}: {
  item: MenuItem
  active: boolean
  currentPath?: string
  onNavigate?: () => void
}) {
  const { t } = useI18n()
  const isExpanded = active && Boolean(item.children?.length)
  const label = item.label || (item.labelKey ? t(item.labelKey) : item.path)
  return (
    <div>
      <Link
        to={item.path}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 px-4 py-2 rounded-md transition-colors text-sm font-medium",
          active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        )}
        >
        <item.icon size={18} />
        <span className="flex-1">{label}</span>
        {item.children && <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />}
      </Link>
      {isExpanded && item.children && (
        <div className="ml-7 mt-1 flex flex-col gap-1 border-l pl-3">
          {item.children.map((child) => {
            const childActive = currentPath === child.path
            return (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  childActive ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {t(child.labelKey)}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function isSidebarItemActive(pathname: string, item: MenuItem) {
  if (item.children?.length) {
    return pathname === item.path || item.children.some((child) => pathname === child.path) || pathname.startsWith("/dashboard/admin/")
  }
  return pathname === item.path
}

interface PluginFrontendItem {
  id: string
  name: string
  frontend?: unknown
}

function pluginSidebarItems(data: unknown): MenuItem[] {
  const plugins = normalizePluginFrontendItems(data)
  const items: MenuItem[] = []
  for (const plugin of plugins) {
    const frontend = isRecord(plugin.frontend) ? plugin.frontend : {}
    const sidebar = Array.isArray(frontend.sidebar) ? frontend.sidebar : []
    for (const raw of sidebar) {
      if (!isRecord(raw)) continue
      const label = stringValue(raw.label) || plugin.name || plugin.id
      const declaredPath = stringValue(raw.path)
      const path = normalizePluginSidebarPath(plugin.id, declaredPath)
      if (!path) continue
      items.push({ icon: Puzzle, label, path })
    }
  }
  return items
}

function normalizePluginFrontendItems(value: unknown): PluginFrontendItem[] {
  const source = Array.isArray(value) ? value : Array.isArray(recordValue(value, "plugins")) ? recordValue(value, "plugins") : []
  return Array.isArray(source) ? source.map(normalizePluginFrontendItem).filter((item): item is PluginFrontendItem => Boolean(item)) : []
}

function normalizePluginFrontendItem(value: unknown): PluginFrontendItem | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    name: stringValue(value.name),
    frontend: value.frontend,
  }
}

function normalizePluginSidebarPath(pluginID: string, declaredPath: string) {
  if (!pluginID) return ""
  if (!declaredPath) return `/dashboard/plugins/${encodeURIComponent(pluginID)}`
  if (declaredPath.startsWith("/dashboard/plugins/")) return declaredPath
  if (declaredPath.startsWith("/plugins/")) return `/dashboard${declaredPath}`
  return `/dashboard/plugins/${encodeURIComponent(pluginID)}/${declaredPath.replace(/^\/+/, "")}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function recordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}
