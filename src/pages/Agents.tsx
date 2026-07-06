import { type ReactNode, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, MessageSquare, Plus, Save, Server, Sparkles, Trash2 } from "lucide-react"
import { Link } from "react-router-dom"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface ChatAgent {
  id: string
  name: string
  prompt: string
  default_model: string
  skill_ids: string[]
  mcp_server_ids: string[]
  created_at: string
  updated_at: string
}

interface ChatSkill {
  id: string
  name: string
  description: string
}

interface MCPServer {
  id: string
  name: string
  url: string
  enabled: boolean
}

const agentsQueryKey = ["advanced-chat-agents", "full"] as const
const sharedAgentsQueryKey = ["advanced-chat-agents"] as const
const skillsQueryKey = ["advanced-chat-skills"] as const
const agentMCPServersQueryKey = ["advanced-chat-agent-mcp-servers"] as const
const defaultAgentID = "default"

export default function Agents() {
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const { t } = useI18n()
  const [activeAgentID, setActiveAgentID] = useState("")
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [defaultModel, setDefaultModel] = useState("")
  const [skillIDs, setSkillIDs] = useState<string[]>([])
  const [mcpServerIDs, setMCPServerIDs] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createPrompt, setCreatePrompt] = useState("")
  const [createDefaultModel, setCreateDefaultModel] = useState("")
  const [createSkillIDs, setCreateSkillIDs] = useState<string[]>([])
  const [createMCPServerIDs, setCreateMCPServerIDs] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [deletingAgentID, setDeletingAgentID] = useState("")

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const { data: agents = [] } = useQuery<ChatAgent[]>({
    queryKey: agentsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data)
        ? res.data.map(normalizeAgent).filter((agent): agent is ChatAgent => Boolean(agent))
        : []
    },
  })

  const { data: skills = [] } = useQuery<ChatSkill[]>({
    queryKey: skillsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data)
        ? res.data.map(normalizeSkill).filter((skill): skill is ChatSkill => Boolean(skill))
        : []
    },
  })

  const { data: mcpServers = [] } = useQuery<MCPServer[]>({
    queryKey: agentMCPServersQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeMCPServersFromSettings(res.data)
    },
  })

  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentID), [activeAgentID, agents])
  const skillName = useMemo(() => new Map(skills.map((skill) => [skill.id, skill.name])), [skills])
  const normalizedMCPServers = Array.isArray(mcpServers) ? mcpServers : []
  const mcpServerName = useMemo(() => new Map(normalizedMCPServers.map((server) => [server.id, server.name])), [normalizedMCPServers])

  const openCreateDialog = () => {
    setCreateName(t("chat.defaultAgentName"))
    setCreatePrompt("")
    setCreateDefaultModel("")
    setCreateSkillIDs([])
    setCreateMCPServerIDs([])
    setIsCreateOpen(true)
  }

  const setEditForm = (agent: ChatAgent) => {
    setActiveAgentID(agent.id)
    setName(agent.name)
    setPrompt(agent.prompt)
    setDefaultModel(agent.default_model)
    setSkillIDs(Array.isArray(agent.skill_ids) ? agent.skill_ids : [])
    setMCPServerIDs(Array.isArray(agent.mcp_server_ids) ? agent.mcp_server_ids : [])
  }

  const openEditDialog = (agent: ChatAgent) => {
    setEditForm(agent)
    setIsEditOpen(true)
  }

  const clearEdit = () => {
    setActiveAgentID("")
    setName("")
    setPrompt("")
    setDefaultModel("")
    setSkillIDs([])
    setMCPServerIDs([])
    setIsEditOpen(false)
  }

  const createAgent = async () => {
    const trimmedName = createName.trim()
    const trimmedModel = createDefaultModel.trim()
    if (!trimmedName) {
      error(t("chat.agentNameRequired"))
      return
    }

    setIsCreating(true)
    try {
      const res = await api.post("/user/advanced-chat/agents", {
        name: trimmedName,
        prompt: createPrompt.trim(),
        default_model: trimmedModel,
        skill_ids: uniqueStrings(createSkillIDs),
        mcp_server_ids: uniqueStrings(createMCPServerIDs),
      })
      const savedAgent = normalizeAgent(res.data)
      await queryClient.invalidateQueries({ queryKey: agentsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sharedAgentsQueryKey })
      if (savedAgent) {
        setEditForm(savedAgent)
      }
      setIsCreateOpen(false)
      success(t("chat.agentCreated"))
    } catch (err) {
      error(apiErrorMessage(err, t("chat.agentCreateFailed")))
    } finally {
      setIsCreating(false)
    }
  }

  const saveAgent = async () => {
    const trimmedName = name.trim()
    const trimmedModel = defaultModel.trim()
    if (!activeAgentID) {
      error(t("chat.agentSelectRequired"))
      return
    }
    if (!trimmedName) {
      error(t("chat.agentNameRequired"))
      return
    }

    setIsSaving(true)
    try {
      const res = await api.put(`/user/advanced-chat/agents/${encodeURIComponent(activeAgentID)}`, {
        name: trimmedName,
        prompt: prompt.trim(),
        default_model: trimmedModel,
        skill_ids: uniqueStrings(skillIDs),
        mcp_server_ids: uniqueStrings(mcpServerIDs),
      })
      const savedAgent = normalizeAgent(res.data)
      await queryClient.invalidateQueries({ queryKey: agentsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sharedAgentsQueryKey })
      if (savedAgent) {
        setEditForm(savedAgent)
      }
      setIsEditOpen(false)
      success(t("chat.agentSaved"))
    } catch (err) {
      error(apiErrorMessage(err, t("chat.agentSaveFailed")))
    } finally {
      setIsSaving(false)
    }
  }

  const deleteAgent = async (agent: ChatAgent) => {
    if (agent.id === defaultAgentID) {
      error(t("chat.agentDeleteFailed"))
      return
    }
    setDeletingAgentID(agent.id)
    try {
      await api.delete(`/user/advanced-chat/agents/${encodeURIComponent(agent.id)}`)
      await queryClient.invalidateQueries({ queryKey: agentsQueryKey })
      await queryClient.invalidateQueries({ queryKey: sharedAgentsQueryKey })
      if (activeAgentID === agent.id) {
        clearEdit()
      }
      success(t("chat.agentDeleted"))
    } catch (err) {
      error(apiErrorMessage(err, t("chat.agentDeleteFailed")))
    } finally {
      setDeletingAgentID("")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.agents")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("advancedChat.agents.subtitle")}</p>
        </div>
        <Button className="gap-2" onClick={openCreateDialog}>
          <Plus size={16} />
          {t("chat.newAgent")}
        </Button>
      </div>

      <PageTitleSlot />
      <Card>
        <CardHeader>
          <CardTitle>{t("advancedChat.agents.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t("chat.noAgents")}</div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-start gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50",
                  agent.id === activeAgent?.id && "border-primary bg-primary/5 hover:bg-primary/5"
                )}
              >
                <button type="button" className="min-w-0 w-full text-left" onClick={() => openEditDialog(agent)}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{agent.name}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{agent.default_model || t("chat.noDefaultModel")}</div>
                  {((Array.isArray(agent.skill_ids) && agent.skill_ids.length > 0) || (Array.isArray(agent.mcp_server_ids) && agent.mcp_server_ids.length > 0)) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(Array.isArray(agent.skill_ids) ? agent.skill_ids : []).map((id) => (
                        <span key={`skill-${id}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Sparkles size={11} />
                          {skillName.get(id) || id}
                        </span>
                      ))}
                      {(Array.isArray(agent.mcp_server_ids) ? agent.mcp_server_ids : []).map((id) => (
                        <span key={`mcp-${id}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Server size={11} />
                          {mcpServerName.get(id) || id}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <Button asChild variant="ghost" size="sm" title={t("chat.chatWithAgent")}>
                    <Link to={`/chat?agent_id=${encodeURIComponent(agent.id)}`}>
                      <MessageSquare size={15} />
                    </Link>
                  </Button>
                  {agent.id !== defaultAgentID && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingAgentID === agent.id}
                      onClick={() => deleteAgent(agent)}
                      title={t("chat.deleteAgent")}
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("chat.editAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("common.name")}</span>
                <input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={name}
                  disabled={activeAgentID === defaultAgentID}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("chat.agentDefaultModel")}</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                >
                  <option value="">{t("chat.noDefaultModel")}</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t("chat.agentPrompt")}</span>
              <textarea
                className="min-h-72 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={prompt}
                placeholder={t("chat.agentPromptPlaceholder")}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <CapabilityPicker
                label={t("chat.skills")}
                icon={<Sparkles size={14} />}
                empty={t("chat.noSkills")}
                selected={skillIDs}
                items={skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description }))}
                onToggle={(id) => setSkillIDs((current) => toggleString(current, id))}
              />
              <CapabilityPicker
                label={t("chat.mcpServers")}
                icon={<Server size={14} />}
                empty={t("chat.noMCPServers")}
                selected={mcpServerIDs}
                items={normalizedMCPServers.map((server) => ({ id: server.id, name: server.name, description: server.url }))}
                onToggle={(id) => setMCPServerIDs((current) => toggleString(current, id))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" disabled={isSaving} onClick={saveAgent}>
              <Save size={16} />
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("chat.newAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("common.name")}</span>
                <input
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t("chat.agentDefaultModel")}</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={createDefaultModel}
                  onChange={(event) => setCreateDefaultModel(event.target.value)}
                >
                  <option value="">{t("chat.noDefaultModel")}</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t("chat.agentPrompt")}</span>
              <textarea
                className="min-h-48 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={createPrompt}
                placeholder={t("chat.agentPromptPlaceholder")}
                onChange={(event) => setCreatePrompt(event.target.value)}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <CapabilityPicker
                label={t("chat.skills")}
                icon={<Sparkles size={14} />}
                empty={t("chat.noSkills")}
                selected={createSkillIDs}
                items={skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description }))}
                onToggle={(id) => setCreateSkillIDs((current) => toggleString(current, id))}
              />
              <CapabilityPicker
                label={t("chat.mcpServers")}
                icon={<Server size={14} />}
                empty={t("chat.noMCPServers")}
                selected={createMCPServerIDs}
                items={normalizedMCPServers.map((server) => ({ id: server.id, name: server.name, description: server.url }))}
                onToggle={(id) => setCreateMCPServerIDs((current) => toggleString(current, id))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="gap-2" disabled={isCreating} onClick={createAgent}>
              <Save size={16} />
              {isCreating ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CapabilityPicker({
  label,
  icon,
  empty,
  selected,
  items,
  onToggle,
}: {
  label: string
  icon: ReactNode
  empty: string
  selected: string[]
  items: Array<{ id: string; name: string; description?: string }>
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-2 text-sm">
      <span className="flex items-center gap-1 font-medium">
        {icon}
        {label}
      </span>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const checked = selected.includes(item.id)
            return (
              <label
                key={item.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md border p-2 transition-colors hover:bg-muted/50",
                  checked && "border-primary bg-primary/5"
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

function uniqueModels(catalog: UserChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function normalizeAgent(value: unknown): ChatAgent | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: typeof value.name === "string" ? value.name : "",
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    default_model: typeof value.default_model === "string" ? value.default_model : "",
    skill_ids: stringArray(value.skill_ids),
    mcp_server_ids: stringArray(value.mcp_server_ids),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizeSkill(value: unknown): ChatSkill | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  return id ? { id, name: typeof value.name === "string" ? value.name : id, description: typeof value.description === "string" ? value.description : "" } : null
}

function normalizeMCPServersFromSettings(value: unknown): MCPServer[] {
  if (!isRecord(value)) {
    return []
  }
  const builtin = Array.isArray(value.builtin_mcp_servers) ? value.builtin_mcp_servers.map(normalizeMCPServer) : []
  const custom = Array.isArray(value.custom_mcp_servers) ? value.custom_mcp_servers.map(normalizeMCPServer) : []
  const merged = Array.isArray(value.mcp_servers) ? value.mcp_servers.map(normalizeMCPServer) : mergeMCPServers(builtin, custom)
  return merged.filter((server) => server.id && server.enabled)
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  const id = stringFromUnknown(item.id) || ""
  return {
    id,
    name: typeof item.name === "string" && item.name ? item.name : id,
    url: typeof item.url === "string" ? item.url : "",
    enabled: item.enabled !== false,
  }
}

function toggleString(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value.map((item) => stringFromUnknown(item) || "")) : []
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function mergeMCPServers(...groups: MCPServer[][]) {
  const merged = new Map<string, MCPServer>()
  for (const server of groups.flat()) {
    if (server.id && !merged.has(server.id)) {
      merged.set(server.id, server)
    }
  }
  return Array.from(merged.values())
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err)) {
    const response = err.response
    if (isRecord(response)) {
      const data = response.data
      if (isRecord(data)) {
        if (typeof data.error === "string" && data.error) {
          return data.error
        }
        if (typeof data.message === "string" && data.message) {
          return data.message
        }
      }
      if (typeof data === "string" && data) {
        return data
      }
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
