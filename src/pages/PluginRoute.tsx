import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

interface PluginFrontendResponse {
  plugins?: PluginFrontendItem[]
}

interface PluginFrontendItem {
  id: string
  name: string
  frontend?: unknown
}

export default function PluginRoute() {
  const { pluginId = "", "*": rest = "" } = useParams()
  const routePath = rest || ""

  const { data: plugins = [], isFetching } = useQuery<PluginFrontendItem[]>({
    queryKey: ["plugins-frontend"],
    queryFn: async () => {
      const res = await api.get<PluginFrontendResponse>("/user/plugins/frontend")
      return Array.isArray(res.data.plugins) ? res.data.plugins : []
    },
  })

  const plugin = plugins.find((item) => item.id === pluginId)
  const route = useMemo(() => findPluginRoute(plugin, routePath), [plugin, routePath])

  if (!plugin && !isFetching) {
    return <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">插件不存在或未启用</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{stringValue(recordValue(route, "title")) || plugin?.name || "Plugin"}</h1>
        {stringValue(recordValue(route, "description")) && <p className="mt-1 text-sm text-muted-foreground">{stringValue(recordValue(route, "description"))}</p>}
      </div>
      <DeclarativePluginView pluginId={pluginId} schema={recordValue(route, "page") || route || recordValue(plugin?.frontend, "page")} />
    </div>
  )
}

export function DeclarativePluginView({ pluginId, schema }: { pluginId: string; schema: unknown }) {
  if (!schema) {
    return <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">插件没有声明页面</div>
  }
  return <DeclarativeNode pluginId={pluginId} node={schema} />
}

function DeclarativeNode({ pluginId, node }: { pluginId: string; node: unknown }) {
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return <div className="text-sm">{String(node)}</div>
  }
  if (Array.isArray(node)) {
    return <div className="space-y-3">{node.map((child, index) => <DeclarativeNode key={index} pluginId={pluginId} node={child} />)}</div>
  }
  if (!isRecord(node)) {
    return null
  }
  const type = stringValue(node.type || "page")
  if (type === "page" || type === "section") {
    return (
      <div className="space-y-4">
        {stringValue(node.title) && <h2 className="text-xl font-semibold">{stringValue(node.title)}</h2>}
        <DeclarativeNode pluginId={pluginId} node={node.children || node.body || node.content} />
      </div>
    )
  }
  if (type === "card") {
    return (
      <Card>
        {stringValue(node.title) && <CardHeader><CardTitle className="text-base">{stringValue(node.title)}</CardTitle></CardHeader>}
        <CardContent className="space-y-3">
          <DeclarativeNode pluginId={pluginId} node={node.children || node.body || node.content} />
        </CardContent>
      </Card>
    )
  }
  if (type === "text") {
    return <p className="text-sm text-muted-foreground">{stringValue(node.text || node.content)}</p>
  }
  if (type === "alert") {
    return <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{stringValue(node.text || node.content)}</div>
  }
  if (type === "form") {
    return <DeclarativeForm pluginId={pluginId} node={node} />
  }
  if (type === "button") {
    return <DeclarativeActionButton pluginId={pluginId} node={node} values={{}} />
  }
  if (type === "json") {
    return <pre className="overflow-auto rounded-md border bg-muted/20 p-3 text-xs">{JSON.stringify(node.value || node, null, 2)}</pre>
  }
  return <pre className="overflow-auto rounded-md border bg-muted/20 p-3 text-xs">{JSON.stringify(node, null, 2)}</pre>
}

function DeclarativeForm({ pluginId, node }: { pluginId: string; node: Record<string, unknown> }) {
  const fields = Array.isArray(node.fields) ? node.fields.filter(isRecord) : []
  const defaults = isRecord(node.values) ? node.values : {}
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const next: Record<string, unknown> = {}
    for (const field of fields) {
      const name = stringValue(field.name)
      if (name) next[name] = defaults[name] ?? field.default ?? ""
    }
    return next
  })
  return (
    <div className="space-y-4 rounded-md border p-4">
      {fields.map((field) => {
        const name = stringValue(field.name)
        if (!name) return null
        const type = stringValue(field.type || "input")
        const label = stringValue(field.label || name)
        if (type === "switch" || type === "checkbox") {
          return (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(values[name])} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.checked }))} />
              {label}
            </label>
          )
        }
        if (type === "textarea") {
          return (
            <label key={name} className="block space-y-1 text-sm">
              <span>{label}</span>
              <textarea className="min-h-24 w-full rounded-md border bg-background p-2" value={String(values[name] || "")} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />
            </label>
          )
        }
        return (
          <label key={name} className="block space-y-1 text-sm">
            <span>{label}</span>
            <Input value={String(values[name] || "")} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />
          </label>
        )
      })}
      <DeclarativeActionButton pluginId={pluginId} node={node} values={values} />
    </div>
  )
}

function DeclarativeActionButton({ pluginId, node, values }: { pluginId: string; node: Record<string, unknown>; values: Record<string, unknown> }) {
  const { success, error } = useToast()
  const action = stringValue(node.action || node.submit_action)
  const label = stringValue(node.submit_label || node.label || "运行")
  const runAction = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/user/plugins/${encodeURIComponent(pluginId)}/actions/${encodeURIComponent(action)}`, { values })
      return res.data
    },
    onSuccess: (data) => success(stringValue(recordValue(data, "message")) || "插件操作已完成"),
    onError: (err) => error(apiErrorMessage(err, "插件操作失败")),
  })
  if (!action) return null
  return <Button disabled={runAction.isPending} onClick={() => runAction.mutate()}>{runAction.isPending ? "运行中" : label}</Button>
}

function findPluginRoute(plugin: PluginFrontendItem | undefined, routePath: string) {
  const frontend = isRecord(plugin?.frontend) ? plugin?.frontend : {}
  const routes = Array.isArray(frontend.routes) ? frontend.routes.filter(isRecord) : []
  if (!routes.length) return frontend
  const normalizedCurrent = normalizePluginRoutePath(routePath)
  return routes.find((route) => normalizePluginRoutePath(stringValue(route.path)) === normalizedCurrent) || routes[0]
}

function normalizePluginRoutePath(value: string) {
  let text = value.trim()
  text = text.replace(/^\/dashboard\/plugins\/[^/]+\/?/, "")
  text = text.replace(/^\/plugins\/[^/]+\/?/, "")
  text = text.replace(/^\/+/, "")
  return text
}

function recordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined
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

function apiErrorMessage(err: unknown, fallback: string) {
  const anyErr = err as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown }
  return String(anyErr?.response?.data?.error || anyErr?.response?.data?.message || anyErr?.message || fallback)
}
