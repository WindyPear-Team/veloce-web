import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PackageOpen, Power, Settings, Trash2, Upload } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface PluginHook {
  point: string
  mode: string
}

interface PluginItem {
  id: string
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  permissions: string[]
  hooks: PluginHook[]
  frontend?: unknown
  settings?: unknown
  last_error?: string
  created_at: string
  updated_at: string
}

interface PluginSettingsResponse {
  schema: unknown
  config: unknown
}

interface PluginListResponse {
  plugins?: unknown[]
}

const pluginsQueryKey = ["plugins"] as const

export default function Plugins() {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const { success, error } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [settingsPlugin, setSettingsPlugin] = useState<PluginItem | null>(null)
  const [settingsText, setSettingsText] = useState("{}")

  const { data: plugins = [], isFetching } = useQuery<PluginItem[]>({
    queryKey: pluginsQueryKey,
    queryFn: async () => {
      const res = await api.get<PluginListResponse>("/user/plugins")
      return Array.isArray(res.data?.plugins) ? res.data.plugins.map(normalizePlugin).filter((item): item is PluginItem => Boolean(item)) : []
    },
  })

  const uploadPlugin = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      await api.post("/user/plugins", form, { headers: { "Content-Type": "multipart/form-data" } })
    },
    onSuccess: async () => {
      success("插件已上传")
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    onError: (err) => error(apiErrorMessage(err, "插件上传失败")),
  })

  const togglePlugin = useMutation({
    mutationFn: async (plugin: PluginItem) => {
      await api.post(`/user/plugins/${encodeURIComponent(plugin.id)}/${plugin.enabled ? "disable" : "enable"}`)
    },
    onSuccess: async () => {
      success("插件状态已更新")
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, "插件状态更新失败")),
  })

  const uninstallPlugin = useMutation({
    mutationFn: async (plugin: PluginItem) => {
      await api.delete(`/user/plugins/${encodeURIComponent(plugin.id)}`)
    },
    onSuccess: async () => {
      success("插件已卸载")
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, "插件卸载失败")),
  })

  const loadSettings = useMutation({
    mutationFn: async (plugin: PluginItem) => {
      const res = await api.get(`/user/plugins/${encodeURIComponent(plugin.id)}/settings`)
      return normalizePluginSettings(res.data)
    },
    onSuccess: (data, plugin) => {
      setSettingsPlugin(plugin)
      setSettingsText(JSON.stringify(data.config || {}, null, 2))
    },
    onError: (err) => error(apiErrorMessage(err, "插件设置加载失败")),
  })

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!settingsPlugin) return
      const parsed = JSON.parse(settingsText || "{}")
      await api.put(`/user/plugins/${encodeURIComponent(settingsPlugin.id)}/settings`, parsed)
    },
    onSuccess: async () => {
      success("插件设置已保存")
      setSettingsPlugin(null)
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, "插件设置保存失败")),
  })

  const handleUpload = (file: File | undefined) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".wasm") && !lower.endsWith(".zip") && !lower.endsWith(".tar.gz") && !lower.endsWith(".tgz")) {
      error("请上传 wasm、zip、tar.gz 或 tgz 格式的插件包")
      return
    }
    uploadPlugin.mutate(file)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.plugins")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">上传 WASM 插件，系统会从 plugin_manifest 导出读取权限、hook、前端声明和设置。</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wasm,.zip,.tgz,.tar.gz,application/wasm,application/zip,application/gzip"
            className="hidden"
            onChange={(event) => handleUpload(event.target.files?.[0])}
          />
          <Button className="gap-2" disabled={uploadPlugin.isPending} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            {uploadPlugin.isPending ? "上传中" : "上传插件"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">已安装插件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plugins.length === 0 && !isFetching ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">暂无插件</div>
          ) : (
            plugins.map((plugin) => (
              <div key={plugin.id} className="rounded-md border p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <PackageOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plugin.name || plugin.id}</span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{plugin.version}</span>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{plugin.enabled ? "已启用" : "已禁用"}</span>
                    </div>
                    {plugin.description && <p className="text-sm text-muted-foreground">{plugin.description}</p>}
                    <div className="text-xs text-muted-foreground">{plugin.id}{plugin.author ? ` · ${plugin.author}` : ""}</div>
                    {plugin.last_error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{plugin.last_error}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-2" disabled={togglePlugin.isPending} onClick={() => togglePlugin.mutate(plugin)}>
                      <Power size={14} />
                      {plugin.enabled ? "禁用" : "启用"}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" disabled={loadSettings.isPending} onClick={() => loadSettings.mutate(plugin)}>
                      <Settings size={14} />
                      设置
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" disabled={uninstallPlugin.isPending} onClick={() => uninstallPlugin.mutate(plugin)}>
                      <Trash2 size={14} />
                      卸载
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <PluginMetaBlock title="权限" items={plugin.permissions} empty="未声明权限" />
                  <PluginMetaBlock title="Hook" items={plugin.hooks.map((hook) => hook.mode ? `${hook.point} · ${hook.mode}` : hook.point)} empty="未声明 Hook" />
                  <PluginMetaBlock title="前端声明" items={plugin.frontend ? ["已声明"] : []} empty="未声明前端扩展" />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(settingsPlugin)} onOpenChange={(open) => !open && setSettingsPlugin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{settingsPlugin?.name || "插件设置"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">设置 Schema</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(settingsPlugin?.settings || {}, null, 2)}</pre>
            </div>
            <textarea
              className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm"
              value={settingsText}
              onChange={(event) => setSettingsText(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsPlugin(null)}>取消</Button>
            <Button disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>{saveSettings.isPending ? "保存中" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PluginMetaBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => <span key={item} className="rounded bg-background px-1.5 py-0.5 text-xs">{item}</span>)}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">{empty}</div>
      )}
    </div>
  )
}

function normalizePlugin(value: unknown): PluginItem | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  return {
    id: String(item.id || ""),
    name: String(item.name || ""),
    version: String(item.version || ""),
    description: String(item.description || ""),
    author: String(item.author || ""),
    enabled: Boolean(item.enabled),
    permissions: Array.isArray(item.permissions) ? item.permissions.map(String) : [],
    hooks: Array.isArray(item.hooks) ? item.hooks.map(normalizeHook).filter((hook): hook is PluginHook => Boolean(hook)) : [],
    frontend: item.frontend,
    settings: item.settings,
    last_error: String(item.last_error || ""),
    created_at: String(item.created_at || ""),
    updated_at: String(item.updated_at || ""),
  }
}

function normalizeHook(value: unknown): PluginHook | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  return { point: String(item.point || ""), mode: String(item.mode || "") }
}

function normalizePluginSettings(value: unknown): PluginSettingsResponse {
  if (!value || typeof value !== "object") return { schema: {}, config: {} }
  const item = value as Record<string, unknown>
  return { schema: item.schema || {}, config: item.config || {} }
}

function apiErrorMessage(err: unknown, fallback: string) {
  const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }
  return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback)
}
