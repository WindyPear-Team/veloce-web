import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PackageOpen, Power, Settings, Trash2, Upload } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface PluginHook {
  point: string
  mode: string
  action?: string
  priority?: number
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
  const [settingsSchema, setSettingsSchema] = useState<unknown>({})
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({})
  const [settingsText, setSettingsText] = useState("{}")
  const [settingsRawMode, setSettingsRawMode] = useState(false)
  const settingsFields = useMemo(() => normalizeSettingsFields(settingsSchema), [settingsSchema])

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
      const schema = data.schema || plugin.settings || {}
      const config = isRecord(data.config) ? data.config : {}
      const values = buildSettingsValues(schema, config)
      setSettingsPlugin({ ...plugin, settings: schema })
      setSettingsSchema(schema)
      setSettingsValues(values)
      setSettingsText(JSON.stringify(values, null, 2))
      setSettingsRawMode(normalizeSettingsFields(schema).length === 0)
    },
    onError: (err) => error(apiErrorMessage(err, "插件设置加载失败")),
  })

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!settingsPlugin) return
      const parsed = settingsRawMode ? JSON.parse(settingsText || "{}") : settingsValues
      await api.put(`/user/plugins/${encodeURIComponent(settingsPlugin.id)}/settings`, parsed)
    },
    onSuccess: async () => {
      success("插件设置已保存")
      setSettingsPlugin(null)
      setSettingsSchema({})
      setSettingsValues({})
      setSettingsText("{}")
      setSettingsRawMode(false)
      await queryClient.invalidateQueries({ queryKey: pluginsQueryKey })
    },
    onError: (err) => error(apiErrorMessage(err, "插件设置保存失败")),
  })

  const handleUpload = (file: File | undefined) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".wasm")) {
      error("请上传 wasm 格式的插件")
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
            accept=".wasm,application/wasm"
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
                  <PluginMetaBlock title="Hook" items={plugin.hooks.map(formatPluginHook)} empty="未声明 Hook" />
                  <PluginMetaBlock title="前端声明" items={plugin.frontend ? ["已声明"] : []} empty="未声明前端扩展" />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(settingsPlugin)} onOpenChange={(open) => {
        if (!open) {
          setSettingsPlugin(null)
          setSettingsSchema({})
          setSettingsValues({})
          setSettingsText("{}")
          setSettingsRawMode(false)
        }
      }}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{settingsPlugin?.name || "插件设置"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
              <div>
                <div className="text-sm font-medium">配置方式</div>
                <div className="text-xs text-muted-foreground">{settingsFields.length ? "已识别配置 Schema，可使用可视化表单。" : "未识别可视化 Schema，使用 JSON 配置。"}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!settingsRawMode) {
                    setSettingsText(JSON.stringify(settingsValues, null, 2))
                    setSettingsRawMode(true)
                  } else {
                    try {
                      const parsed = JSON.parse(settingsText || "{}")
                      setSettingsValues(isRecord(parsed) ? parsed : {})
                      setSettingsRawMode(false)
                    } catch (err) {
                      error(apiErrorMessage(err, "JSON 格式不正确"))
                    }
                  }
                }}
                disabled={!settingsFields.length && !settingsRawMode}
              >
                {settingsRawMode && settingsFields.length ? "可视化配置" : "JSON 配置"}
              </Button>
            </div>
            {settingsRawMode ? (
              <textarea
                className="min-h-80 w-full rounded-md border bg-background p-3 font-mono text-sm"
                value={settingsText}
                onChange={(event) => setSettingsText(event.target.value)}
              />
            ) : (
              <PluginSettingsForm
                fields={settingsFields}
                values={settingsValues}
                onChange={(name, value) => setSettingsValues((current) => ({ ...current, [name]: value }))}
              />
            )}
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

interface PluginSettingsField {
  name: string
  label: string
  type: string
  description: string
  placeholder: string
  required: boolean
  defaultValue: unknown
  options: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
}

function PluginSettingsForm({
  fields,
  values,
  onChange,
}: {
  fields: PluginSettingsField[]
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
}) {
  if (!fields.length) {
    return <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">这个插件没有声明可视化配置项</div>
  }
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <PluginSettingsFieldControl key={field.name} field={field} value={values[field.name]} onChange={(value) => onChange(field.name, value)} />
      ))}
    </div>
  )
}

function PluginSettingsFieldControl({ field, value, onChange }: { field: PluginSettingsField; value: unknown; onChange: (value: unknown) => void }) {
  const label = (
    <div className="space-y-1">
      <div className="text-sm font-medium">
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </div>
      {field.description && <div className="text-xs text-muted-foreground">{field.description}</div>}
    </div>
  )
  const type = field.type
  if (type === "switch" || type === "checkbox" || type === "boolean") {
    return (
      <label className="flex items-start justify-between gap-4 rounded-md border p-3">
        {label}
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    )
  }
  if (type === "textarea" || type === "text") {
    return (
      <div className="space-y-2">
        {label}
        <textarea
          className="min-h-28 w-full rounded-md border bg-background p-3 text-sm"
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    )
  }
  if (type === "number" || type === "integer") {
    return (
      <div className="space-y-2">
        {label}
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step ?? (type === "integer" ? 1 : undefined)}
          onChange={(event) => {
            const raw = event.target.value
            onChange(raw === "" ? "" : type === "integer" ? Math.trunc(Number(raw)) : Number(raw))
          }}
        />
      </div>
    )
  }
  if (type === "select" || type === "enum") {
    return (
      <div className="space-y-2">
        {label}
        <select
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          {!field.required && <option value="">不设置</option>}
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    )
  }
  if (type === "multiselect" || type === "multi_select" || type === "tags") {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="space-y-2">
        {label}
        <select
          multiple
          className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={selected}
          onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}
        >
          {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    )
  }
  if (type === "json" || type === "object" || type === "array") {
    return (
      <div className="space-y-2">
        {label}
        <textarea
          key={JSON.stringify(value ?? null)}
          className="min-h-28 w-full rounded-md border bg-background p-3 font-mono text-sm"
          defaultValue={JSON.stringify(value ?? (type === "array" ? [] : {}), null, 2)}
          onBlur={(event) => {
            try {
              onChange(JSON.parse(event.target.value || (type === "array" ? "[]" : "{}")))
            } catch {
              onChange(event.target.value)
            }
          }}
        />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {label}
      <Input
        type={type === "password" || type === "secret" ? "password" : "text"}
        value={String(value ?? "")}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
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
  return {
    point: String(item.point || ""),
    mode: String(item.mode || ""),
    action: String(item.action || ""),
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
  }
}

function formatPluginHook(hook: PluginHook) {
  const parts = [hook.point]
  if (hook.action) parts.push(hook.action)
  if (hook.mode) parts.push(hook.mode)
  if (hook.priority) parts.push(`P${hook.priority}`)
  return parts.filter(Boolean).join(" · ")
}

function normalizePluginSettings(value: unknown): PluginSettingsResponse {
  if (!value || typeof value !== "object") return { schema: {}, config: {} }
  const item = value as Record<string, unknown>
  return { schema: item.schema || {}, config: item.config || {} }
}

function normalizeSettingsFields(schema: unknown): PluginSettingsField[] {
  const root = schemaRoot(schema)
  if (!isRecord(root)) return []
  const fields = Array.isArray(root.fields) ? root.fields : Array.isArray(root.children) ? root.children : []
  if (fields.length) {
    return fields.map((field) => normalizeSettingsField(field)).filter((field): field is PluginSettingsField => Boolean(field))
  }
  const properties = isRecord(root.properties) ? root.properties : {}
  const required = Array.isArray(root.required) ? root.required.map(String) : []
  return Object.entries(properties)
    .map(([name, field]) => normalizeSettingsField(field, name, required.includes(name)))
    .filter((field): field is PluginSettingsField => Boolean(field))
}

function normalizeSettingsField(value: unknown, fallbackName = "", required = false): PluginSettingsField | null {
  if (!isRecord(value)) return null
  const name = stringValue(value.name) || fallbackName
  if (!name) return null
  const rawType = stringValue(value.type || value.widget || value.component || "input").toLowerCase()
  const options = normalizeSettingsOptions(value.options || value.enum || value.values)
  const normalizedType = normalizeSettingsFieldType(rawType, options)
  return {
    name,
    label: stringValue(value.label || value.title) || name,
    type: normalizedType,
    description: stringValue(value.description || value.help || value.hint),
    placeholder: stringValue(value.placeholder),
    required: Boolean(value.required) || required,
    defaultValue: value.default,
    options,
    min: numberOrUndefined(value.minimum ?? value.min),
    max: numberOrUndefined(value.maximum ?? value.max),
    step: numberOrUndefined(value.step),
  }
}

function normalizeSettingsOptions(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return []
  return value.map((option) => {
    if (isRecord(option)) {
      const optionValue = stringValue(option.value ?? option.id ?? option.name ?? option.label)
      return { label: stringValue(option.label ?? option.name ?? optionValue) || optionValue, value: optionValue }
    }
    const text = stringValue(option)
    return { label: text, value: text }
  }).filter((option) => option.value !== "")
}

function normalizeSettingsFieldType(type: string, options: Array<{ label: string; value: string }>) {
  if (type === "string") return options.length ? "select" : "input"
  if (type === "bool") return "switch"
  if (type === "boolean") return "switch"
  if (type === "int") return "integer"
  if (type === "float") return "number"
  if (type === "select" || type === "enum") return "select"
  if (type === "multiselect" || type === "multi_select" || type === "tags") return type
  if (type === "textarea" || type === "text" || type === "number" || type === "integer" || type === "json" || type === "object" || type === "array" || type === "password" || type === "secret" || type === "switch" || type === "checkbox") return type
  return "input"
}

function buildSettingsValues(schema: unknown, config: Record<string, unknown>) {
  const fields = normalizeSettingsFields(schema)
  if (!fields.length) return { ...config }
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    values[field.name] = config[field.name] ?? field.defaultValue ?? defaultSettingsFieldValue(field)
  }
  for (const [key, value] of Object.entries(config)) {
    if (!(key in values)) values[key] = value
  }
  return values
}

function defaultSettingsFieldValue(field: PluginSettingsField) {
  if (field.type === "switch" || field.type === "checkbox" || field.type === "boolean") return false
  if (field.type === "number" || field.type === "integer") return ""
  if (field.type === "multiselect" || field.type === "multi_select" || field.type === "tags" || field.type === "array") return []
  if (field.type === "json" || field.type === "object") return {}
  return ""
}

function schemaRoot(schema: unknown) {
  if (!isRecord(schema)) return schema
  if (isRecord(schema.schema)) return schema.schema
  return schema
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return ""
}

function numberOrUndefined(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function apiErrorMessage(err: unknown, fallback: string) {
  const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }
  return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback)
}
