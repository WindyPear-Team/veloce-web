import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { ChevronLeft, Save, SlidersHorizontal } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

interface PluginDetail {
  id: string
  name: string
  version: string
  description: string
  settings?: unknown
}

interface PluginSettingsResponse {
  schema: unknown
  config: unknown
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
  tab: string
}

interface PluginSettingsTab {
  id: string
  label: string
  description: string
  fields: PluginSettingsField[]
}

export default function PluginSettingsPage() {
  const { pluginId = "" } = useParams()
  const { success, error } = useToast()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [rawText, setRawText] = useState("{}")
  const [rawMode, setRawMode] = useState(false)
  const [activeTab, setActiveTab] = useState("")

  const pluginQuery = useQuery<PluginDetail>({
    queryKey: ["plugin", pluginId],
    enabled: Boolean(pluginId),
    queryFn: async () => normalizePluginDetail((await api.get(`/user/plugins/${encodeURIComponent(pluginId)}`)).data),
  })
  const settingsQuery = useQuery<PluginSettingsResponse>({
    queryKey: ["plugin-settings", pluginId],
    enabled: Boolean(pluginId),
    queryFn: async () => normalizePluginSettings((await api.get(`/user/plugins/${encodeURIComponent(pluginId)}/settings`)).data),
  })

  const schema = settingsQuery.data?.schema || pluginQuery.data?.settings || {}
  const fields = useMemo(() => normalizeSettingsFields(schema), [schema])
  const tabs = useMemo(() => normalizeSettingsTabs(schema, fields), [fields, schema])
  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0]

  useEffect(() => {
    if (!settingsQuery.data) return
    const config = isRecord(settingsQuery.data.config) ? settingsQuery.data.config : {}
    const nextValues = buildSettingsValues(fields, config)
    setValues(nextValues)
    setRawText(JSON.stringify(nextValues, null, 2))
    setRawMode(fields.length === 0)
    setActiveTab((current) => tabs.some((tab) => tab.id === current) ? current : tabs[0]?.id || "")
  }, [fields, settingsQuery.data, tabs])

  const saveSettings = useMutation({
    mutationFn: async () => {
      const payload = rawMode ? parseSettingsJSON(rawText) : values
      await api.put(`/user/plugins/${encodeURIComponent(pluginId)}/settings`, payload)
    },
    onSuccess: async () => {
      success("插件设置已保存")
      await queryClient.invalidateQueries({ queryKey: ["plugin-settings", pluginId] })
    },
    onError: (err) => error(apiErrorMessage(err, "插件设置保存失败")),
  })

  if (pluginQuery.isError || settingsQuery.isError) {
    return <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-10 text-center text-sm text-destructive">无法加载插件配置。请确认插件已启用且你有访问权限。</div>
  }

  const plugin = pluginQuery.data
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5"><Link to="/dashboard/plugins"><ChevronLeft size={16} />返回插件</Link></Button>
          <div className="flex min-w-0 items-center gap-2"><SlidersHorizontal size={20} className="shrink-0 text-muted-foreground" /><h1 className="truncate text-2xl font-semibold">{plugin?.name || "插件配置"}</h1></div>
          {plugin?.description && <p className="mt-1 text-sm text-muted-foreground">{plugin.description}</p>}
        </div>
        <Button className="gap-2" disabled={saveSettings.isPending || settingsQuery.isLoading} onClick={() => saveSettings.mutate()}><Save size={16} />{saveSettings.isPending ? "保存中" : "保存配置"}</Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div><CardTitle className="text-base">{plugin?.name || "插件"} 配置</CardTitle><div className="mt-1 text-xs text-muted-foreground">{plugin?.version ? `版本 ${plugin.version}` : "按当前账号保存"}</div></div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!fields.length && rawMode}
            onClick={() => {
              if (!rawMode) {
                setRawText(JSON.stringify(values, null, 2))
                setRawMode(true)
                return
              }
              try {
                const parsed = parseSettingsJSON(rawText)
                setValues(parsed)
                setRawMode(false)
              } catch (err) {
                error(apiErrorMessage(err, "JSON 格式不正确"))
              }
            }}
          >{rawMode && fields.length ? "表单配置" : "JSON 配置"}</Button>
        </CardHeader>
        <CardContent>
          {settingsQuery.isLoading || pluginQuery.isLoading ? <div className="py-12 text-center text-sm text-muted-foreground">加载配置中...</div> : rawMode ? (
            <textarea className="min-h-[28rem] w-full rounded-md border bg-background p-3 font-mono text-sm" value={rawText} onChange={(event) => setRawText(event.target.value)} />
          ) : tabs.length ? (
            <div className="space-y-5">
              <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="插件配置分类">
                {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={currentTab?.id === tab.id} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${currentTab?.id === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
              </div>
              {currentTab && <div className="space-y-5"><div>{currentTab.description && <p className="text-sm text-muted-foreground">{currentTab.description}</p>}</div><PluginSettingsForm fields={currentTab.fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} /></div>}
            </div>
          ) : <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">这个插件没有声明可视化配置项</div>}
        </CardContent>
      </Card>
    </div>
  )
}

function PluginSettingsForm({ fields, values, onChange }: { fields: PluginSettingsField[]; values: Record<string, unknown>; onChange: (name: string, value: unknown) => void }) {
  return <div className="space-y-4">{fields.map((field) => <PluginSettingsFieldControl key={field.name} field={field} value={values[field.name]} onChange={(value) => onChange(field.name, value)} />)}</div>
}

function PluginSettingsFieldControl({ field, value, onChange }: { field: PluginSettingsField; value: unknown; onChange: (value: unknown) => void }) {
  const label = <div className="space-y-1"><div className="text-sm font-medium">{field.label}{field.required && <span className="ml-1 text-destructive">*</span>}</div>{field.description && <div className="text-xs text-muted-foreground">{field.description}</div>}</div>
  if (["switch", "checkbox", "boolean"].includes(field.type)) return <label className="flex items-start justify-between gap-4 rounded-md border p-3">{label}<input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /></label>
  if (["textarea", "text"].includes(field.type)) return <div className="space-y-2">{label}<textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></div>
  if (["number", "integer"].includes(field.type)) return <div className="space-y-2">{label}<Input type="number" value={value === undefined || value === null ? "" : String(value)} placeholder={field.placeholder} min={field.min} max={field.max} step={field.step ?? (field.type === "integer" ? 1 : undefined)} onChange={(event) => { const raw = event.target.value; onChange(raw === "" ? "" : field.type === "integer" ? Math.trunc(Number(raw)) : Number(raw)) }} /></div>
  if (["select", "enum"].includes(field.type)) return <div className="space-y-2">{label}<select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>{!field.required && <option value="">不设置</option>}{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
  if (["multiselect", "multi_select", "tags"].includes(field.type)) { const selected = Array.isArray(value) ? value.map(String) : []; return <div className="space-y-2">{label}<select multiple className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={selected} onChange={(event) => onChange(Array.from(event.target.selectedOptions).map((option) => option.value))}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div> }
  if (["json", "object", "array"].includes(field.type)) return <div className="space-y-2">{label}<textarea key={JSON.stringify(value ?? null)} className="min-h-28 w-full rounded-md border bg-background p-3 font-mono text-sm" defaultValue={JSON.stringify(value ?? (field.type === "array" ? [] : {}), null, 2)} onBlur={(event) => { try { onChange(JSON.parse(event.target.value || (field.type === "array" ? "[]" : "{}"))) } catch { onChange(event.target.value) } }} /></div>
  return <div className="space-y-2">{label}<Input type={field.type === "password" || field.type === "secret" ? "password" : "text"} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} /></div>
}

function normalizePluginDetail(value: unknown): PluginDetail {
  const item = isRecord(value) ? value : {}
  return { id: stringValue(item.id), name: stringValue(item.name), version: stringValue(item.version), description: stringValue(item.description), settings: item.settings }
}

function normalizePluginSettings(value: unknown): PluginSettingsResponse {
  const item = isRecord(value) ? value : {}
  return { schema: item.schema || {}, config: item.config || {} }
}

function normalizeSettingsTabs(schema: unknown, fields: PluginSettingsField[]): PluginSettingsTab[] {
  const root = schemaRoot(schema)
  if (!isRecord(root)) return fields.length ? [{ id: "general", label: "通用", description: "", fields }] : []
  const declared = Array.isArray(root.tabs) ? root.tabs.filter(isRecord) : []
  const tabs: PluginSettingsTab[] = declared.map((raw, index) => {
    const id = stringValue(raw.id || raw.key || raw.name || raw.label) || `tab-${index + 1}`
    const label = stringValue(raw.label || raw.title || raw.name) || id
    const tabFields = normalizeSettingsFields(raw)
    return { id, label, description: stringValue(raw.description || raw.help), fields: tabFields.length ? tabFields : fields.filter((field) => field.tab === id || field.tab === label) }
  })
  if (tabs.length) {
    const assigned = new Set(tabs.flatMap((tab) => tab.fields.map((field) => field.name)))
    const remaining = fields.filter((field) => !assigned.has(field.name))
    if (remaining.length) tabs.unshift({ id: "general", label: "通用", description: "", fields: remaining })
    return tabs.filter((tab) => tab.fields.length)
  }
  const grouped = new Map<string, PluginSettingsTab>()
  for (const field of fields) {
    const id = field.tab || "general"
    const existing = grouped.get(id) || { id, label: id === "general" ? "通用" : id, description: "", fields: [] }
    existing.fields.push(field)
    grouped.set(id, existing)
  }
  return [...grouped.values()]
}

function normalizeSettingsFields(schema: unknown): PluginSettingsField[] {
  const root = schemaRoot(schema)
  if (!isRecord(root)) return []
  const fields = Array.isArray(root.fields) ? root.fields : Array.isArray(root.children) ? root.children : []
  if (fields.length) return fields.map((field) => normalizeSettingsField(field)).filter((field): field is PluginSettingsField => Boolean(field))
  const properties = isRecord(root.properties) ? root.properties : {}
  const required = Array.isArray(root.required) ? root.required.map(String) : []
  return Object.entries(properties).map(([name, field]) => normalizeSettingsField(field, name, required.includes(name))).filter((field): field is PluginSettingsField => Boolean(field))
}

function normalizeSettingsField(value: unknown, fallbackName = "", required = false): PluginSettingsField | null {
  if (!isRecord(value)) return null
  const name = stringValue(value.name) || fallbackName
  if (!name) return null
  const options = normalizeSettingsOptions(value.options || value.enum || value.values)
  return { name, label: stringValue(value.label || value.title) || name, type: normalizeSettingsFieldType(stringValue(value.type || value.widget || value.component || "input").toLowerCase(), options), description: stringValue(value.description || value.help || value.hint), placeholder: stringValue(value.placeholder), required: Boolean(value.required) || required, defaultValue: value.default, options, min: numberOrUndefined(value.minimum ?? value.min), max: numberOrUndefined(value.maximum ?? value.max), step: numberOrUndefined(value.step), tab: stringValue(value.tab || value.group || value.category) }
}

function normalizeSettingsOptions(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return []
  return value.map((option) => { if (isRecord(option)) { const optionValue = stringValue(option.value ?? option.id ?? option.name ?? option.label); return { label: stringValue(option.label ?? option.name ?? optionValue) || optionValue, value: optionValue } }; const text = stringValue(option); return { label: text, value: text } }).filter((option) => option.value !== "")
}

function normalizeSettingsFieldType(type: string, options: Array<{ label: string; value: string }>) {
  if (type === "string") return options.length ? "select" : "input"
  if (type === "bool" || type === "boolean") return "switch"
  if (type === "int") return "integer"
  if (type === "float") return "number"
  return ["select", "enum", "multiselect", "multi_select", "tags", "textarea", "text", "number", "integer", "json", "object", "array", "password", "secret", "switch", "checkbox"].includes(type) ? type : "input"
}

function buildSettingsValues(fields: PluginSettingsField[], config: Record<string, unknown>) {
  const values: Record<string, unknown> = {}
  for (const field of fields) values[field.name] = config[field.name] ?? field.defaultValue ?? defaultSettingsFieldValue(field)
  for (const [key, value] of Object.entries(config)) if (!(key in values)) values[key] = value
  return values
}

function defaultSettingsFieldValue(field: PluginSettingsField) {
  if (["switch", "checkbox", "boolean"].includes(field.type)) return false
  if (["number", "integer"].includes(field.type)) return ""
  if (["multiselect", "multi_select", "tags", "array"].includes(field.type)) return []
  if (["json", "object"].includes(field.type)) return {}
  return ""
}

function parseSettingsJSON(raw: string) {
  const value = JSON.parse(raw || "{}")
  if (!isRecord(value)) throw new Error("设置必须是 JSON 对象")
  return value
}

function schemaRoot(schema: unknown) { return isRecord(schema) && isRecord(schema.schema) ? schema.schema : schema }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)) }
function stringValue(value: unknown) { if (typeof value === "string") return value.trim(); if (typeof value === "number" && Number.isFinite(value)) return String(value); if (typeof value === "boolean") return value ? "true" : "false"; return "" }
function numberOrUndefined(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : undefined }
function apiErrorMessage(err: unknown, fallback: string) { const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }; return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback) }
