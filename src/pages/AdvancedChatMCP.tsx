import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { useToast } from "@/components/ui/toast"

interface MCPServer {
  id: string
  name: string
  url: string
  headers?: string
  enabled: boolean
  request_mode: "backend" | "frontend" | string
}

interface MCPDraft {
  id?: string
  name: string
  url: string
  headers: string
  enabled: boolean
}

interface AdvancedChatSettings {
  attachment_max_mb: number
  attachment_allowed_types: string[]
  mcp_servers: MCPServer[]
  builtin_mcp_servers: MCPServer[]
  custom_mcp_servers: MCPServer[]
}

const defaultAttachmentSettings = {
  attachment_max_mb: 10,
  attachment_allowed_types: [
    "text/plain",
    "text/markdown",
    "application/json",
    "text/csv",
    "image/png",
    "image/jpeg",
    "application/pdf",
  ],
}

const emptyDraft: MCPDraft = {
  name: "",
  url: "",
  headers: "",
  enabled: true,
}

export default function AdvancedChatMCP() {
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [customServers, setCustomServers] = useState<MCPServer[]>([])
  const [draft, setDraft] = useState<MCPDraft>(emptyDraft)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const { data: settings } = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-user-settings"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeAdvancedChatSettings(res.data)
    },
  })

  useEffect(() => {
    if (settings) {
      setCustomServers(settings.custom_mcp_servers)
    }
  }, [settings])

  const builtinServerIDs = useMemo(() => new Set((settings?.builtin_mcp_servers || []).map((server) => server.id)), [settings?.builtin_mcp_servers])
  const allServers = useMemo(() => {
    const merged = settings?.mcp_servers?.length
      ? settings.mcp_servers
      : mergeMCPServers(settings?.builtin_mcp_servers || [], customServers)
    const customByID = new Map(customServers.map((server) => [server.id, server]))
    return merged.map((server) => ({
      ...(customByID.get(server.id) || server),
      readonly: builtinServerIDs.has(server.id),
    }))
  }, [builtinServerIDs, customServers, settings?.builtin_mcp_servers, settings?.mcp_servers])

  const saveServers = useMutation({
    mutationFn: async () => {
      const res = await api.put("/user/advanced-chat/mcp-servers", {
        custom_mcp_servers: customServers.map((server) => ({ ...server, request_mode: "backend" })),
      })
      return normalizeAdvancedChatSettings(res.data)
    },
    onSuccess: (saved) => {
      setCustomServers(saved.custom_mcp_servers)
      success("MCP 服务器已保存")
      queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
    },
    onError: (err) => error(apiErrorMessage(err, "保存 MCP 服务器失败")),
  })

  const openCreateDialog = () => {
    setDraft(emptyDraft)
    setIsDialogOpen(true)
  }

  const openEditDialog = (server: MCPServer) => {
    setDraft({
      id: server.id,
      name: server.name,
      url: server.url,
      headers: server.headers || "",
      enabled: server.enabled,
    })
    setIsDialogOpen(true)
  }

  const applyDraft = () => {
    const next: MCPServer = {
      id: draft.id || createID(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      headers: draft.headers.trim(),
      enabled: draft.enabled,
      request_mode: "backend",
    }
    if (!next.name || !next.url) {
      error("请输入 MCP 名称和服务器地址")
      return
    }
    setCustomServers((current) => (draft.id ? current.map((server) => (server.id === draft.id ? next : server)) : [...current, next]))
    setIsDialogOpen(false)
  }

  const removeServer = (id: string) => {
    setCustomServers((current) => current.filter((server) => server.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">MCP 服务器</h1>
          <div className="mt-2 text-sm text-muted-foreground">管理员内置 MCP 和你的自定义 MCP 会在同一列表中展示；所有 MCP 均由后端统一请求调用。</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={openCreateDialog}>
            <Plus size={16} />
            添加
          </Button>
          <Button className="gap-2" disabled={saveServers.isPending} onClick={() => saveServers.mutate()}>
            <Save size={16} />
            {saveServers.isPending ? "保存中" : "保存"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>MCP 列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {allServers.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">暂无 MCP 服务器</div>
          ) : (
            allServers.map((server) => (
              <div key={`${server.request_mode}-${server.id}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{server.name}</span>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {server.readonly ? "管理员内置" : "我的"}
                    </span>
                    {!server.enabled && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">停用</span>}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{server.url}</div>
                </div>
                {server.readonly ? (
                  <div className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">只读</div>
                ) : (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="icon" onClick={() => openEditDialog(server)} aria-label="编辑 MCP 服务器" title="编辑 MCP 服务器">
                      <Pencil size={16} />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => removeServer(server.id)} aria-label="删除 MCP 服务器" title="删除 MCP 服务器">
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? "编辑 MCP" : "添加 MCP"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium">名称</span>
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">服务器地址</span>
              <Input value={draft.url} placeholder="https://mcp.example.com" onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">请求头（可选）</span>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={draft.headers}
                placeholder={'{"Authorization":"Bearer ..."} 或每行 Header: value'}
                onChange={(event) => setDraft((current) => ({ ...current, headers: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
              启用
            </label>
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">用户自定义 MCP 会保存到后端，并由后端在聊天时统一调用。请求头仅用于后端访问该 MCP 服务器。</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={applyDraft}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function normalizeAdvancedChatSettings(value: unknown): AdvancedChatSettings {
  const item = isRecord(value) ? value : {}
  const builtin = Array.isArray(item.builtin_mcp_servers) ? item.builtin_mcp_servers.map(normalizeMCPServer) : []
  const custom = Array.isArray(item.custom_mcp_servers) ? item.custom_mcp_servers.map(normalizeMCPServer) : []
  return {
    attachment_max_mb: Number(item.attachment_max_mb || defaultAttachmentSettings.attachment_max_mb),
    attachment_allowed_types: Array.isArray(item.attachment_allowed_types)
      ? item.attachment_allowed_types.filter((value): value is string => typeof value === "string")
      : defaultAttachmentSettings.attachment_allowed_types,
    mcp_servers: Array.isArray(item.mcp_servers) ? item.mcp_servers.map(normalizeMCPServer) : mergeMCPServers(builtin, custom),
    builtin_mcp_servers: builtin,
    custom_mcp_servers: custom,
  }
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  return {
    id: typeof item.id === "string" && item.id ? item.id : createID(),
    name: typeof item.name === "string" ? item.name : "",
    url: typeof item.url === "string" ? item.url : "",
    headers: typeof item.headers === "string" ? item.headers : "",
    enabled: item.enabled !== false,
    request_mode: typeof item.request_mode === "string" ? item.request_mode : "backend",
  }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err)) {
    const response = err.response
    if (isRecord(response)) {
      const data = response.data
      if (isRecord(data) && typeof data.error === "string" && data.error) {
        return data.error
      }
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function createID() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function mergeMCPServers(...groups: MCPServer[][]) {
  const servers: MCPServer[] = []
  const seen = new Set<string>()
  for (const server of groups.flat()) {
    if (!server.id || seen.has(server.id)) {
      continue
    }
    seen.add(server.id)
    servers.push(server)
  }
  return servers
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
