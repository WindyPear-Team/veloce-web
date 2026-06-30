import { type ReactNode, useEffect, useMemo, useState } from "react"
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Pencil, Plus, RefreshCcw, Save, Trash2, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface ConnectorDevice {
  id: string
  name: string
  online: boolean
  os?: string
}

interface CatalogItem {
  id: number
  name: string
  models: string[]
}

interface ChatAgent {
  id: string
  name: string
  prompt: string
  default_model: string
}

interface ChatSkill {
  id: string
  name: string
  description: string
  prompt: string
  mcp_server_ids: string[]
}

interface MCPServer {
  id: string
  name: string
  url: string
  enabled: boolean
  request_mode: string
}

interface AdvancedChatSettings {
  mcp_servers: MCPServer[]
  builtin_mcp_servers: MCPServer[]
  custom_mcp_servers: MCPServer[]
}

interface AgentGroup {
  id: string
  name: string
  description?: string
  agents: AgentGroupAgent[]
  updated_at?: string
}

interface AgentGroupAgent {
  id: string
  name: string
  type: "chief" | "worker" | "critic" | "reviewer"
  prompt: string
  chat_agent_id?: string
  default_model?: string
  user_channel_id?: number
  skill_ids: string[]
  mcp_server_ids: string[]
}

interface DraftGroup {
  id: string
  name: string
  description: string
  agents: AgentGroupAgent[]
}

interface AgentGroupsData {
  copy: typeof enCopy
  devices: ConnectorDevice[]
  groups: AgentGroup[]
  selectedDeviceID: string
  selectedDevice?: ConnectorDevice
  catalog: CatalogItem[]
  chatAgents: ChatAgent[]
  skills: ChatSkill[]
  mcpServers: MCPServer[]
  modelOptions: string[]
  isFetchingGroups: boolean
  setSelectedDeviceID: (deviceID: string) => void
  refetchGroups: () => void
}

const devicesQueryKey = ["advanced-chat-connector-devices"] as const
const catalogQueryKey = ["catalog"] as const
const chatAgentsQueryKey = ["advanced-chat-agents"] as const
const skillsQueryKey = ["advanced-chat-skills"] as const
const settingsQueryKey = ["advanced-chat-user-settings"] as const
const agentGroupsQueryKey = (deviceID: string) => ["advanced-chat-agent-groups", deviceID] as const
const emptyAgent = (): AgentGroupAgent => ({ id: "", name: "", type: "worker", prompt: "", chat_agent_id: "", default_model: "", user_channel_id: 0, skill_ids: [], mcp_server_ids: [] })
const emptyDraft = (): DraftGroup => ({ id: "", name: "", description: "", agents: [] })

export default function AgentGroupsPage() {
  const data = useAgentGroupsData()

  return (
    <Routes>
      <Route index element={<AgentGroupList data={data} />} />
      <Route path="new" element={<AgentGroupEditor data={data} mode="new" />} />
      <Route path=":groupID" element={<AgentGroupEditor data={data} mode="edit" />} />
    </Routes>
  )
}

function useAgentGroupsData(): AgentGroupsData {
  const { language } = useI18n()
  const copy = language === "zh" ? { ...enCopy, ...zhCopy } : enCopy
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDeviceID, setSelectedDeviceIDState] = useState(() => searchParams.get("connector_device_id") || "")

  const { data: devices = [] } = useQuery<ConnectorDevice[]>({
    queryKey: devicesQueryKey,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      const rawDevices: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawDevices.map(normalizeDevice).filter((item): item is ConnectorDevice => Boolean(item))
    },
  })

  const { data: catalog = [] } = useQuery<CatalogItem[]>({
    queryKey: catalogQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      const rawCatalog: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawCatalog.map(normalizeCatalogItem)
    },
  })

  const { data: chatAgents = [] } = useQuery<ChatAgent[]>({
    queryKey: chatAgentsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      const rawAgents: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawAgents.map(normalizeChatAgent).filter((item): item is ChatAgent => Boolean(item))
    },
  })

  const { data: skills = [] } = useQuery<ChatSkill[]>({
    queryKey: skillsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      const rawSkills: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawSkills.map(normalizeSkill).filter((item): item is ChatSkill => Boolean(item))
    },
  })

  const { data: settings } = useQuery<AdvancedChatSettings>({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeAdvancedChatSettings(res.data)
    },
  })

  const setSelectedDeviceID = (deviceID: string) => {
    setSelectedDeviceIDState(deviceID)
    const next = new URLSearchParams(searchParams)
    if (deviceID) {
      next.set("connector_device_id", deviceID)
    } else {
      next.delete("connector_device_id")
    }
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    const queryDeviceID = searchParams.get("connector_device_id") || ""
    if (queryDeviceID && queryDeviceID !== selectedDeviceID) {
      setSelectedDeviceIDState(queryDeviceID)
    }
  }, [searchParams, selectedDeviceID])

  useEffect(() => {
    if (selectedDeviceID && devices.some((device) => device.id === selectedDeviceID)) {
      return
    }
    const firstOnline = devices.find((device) => device.online)
    const nextDeviceID = firstOnline?.id || devices[0]?.id || ""
    if (nextDeviceID && nextDeviceID !== selectedDeviceID) {
      setSelectedDeviceID(nextDeviceID)
    }
  }, [devices, selectedDeviceID])

  const { data: groups = [], isFetching: isFetchingGroups, refetch } = useQuery<AgentGroup[]>({
    queryKey: agentGroupsQueryKey(selectedDeviceID),
    enabled: Boolean(selectedDeviceID),
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agent-groups", { params: { connector_device_id: selectedDeviceID } })
      const data = isRecord(res.data) ? res.data : {}
      const rawGroups: unknown[] = Array.isArray(data.groups) ? data.groups : []
      return rawGroups.map(normalizeGroup).filter((item): item is AgentGroup => Boolean(item))
    },
  })

  const selectedDevice = useMemo(() => devices.find((device) => device.id === selectedDeviceID), [devices, selectedDeviceID])
  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])
  const mcpServers = useMemo(() => (settings?.mcp_servers || []).filter((server) => server.enabled), [settings?.mcp_servers])

  return {
    copy,
    devices,
    groups,
    selectedDeviceID,
    selectedDevice,
    catalog,
    chatAgents,
    skills,
    mcpServers,
    modelOptions,
    isFetchingGroups,
    setSelectedDeviceID,
    refetchGroups: () => {
      if (selectedDeviceID) {
        void refetch()
      }
    },
  }
}

function AgentGroupList({ data }: { data: AgentGroupsData }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [deletingID, setDeletingID] = useState("")
  const { copy, devices, groups, selectedDeviceID, selectedDevice, isFetchingGroups, setSelectedDeviceID, refetchGroups } = data

  const newGroupHref = selectedDeviceID ? `/chat/agent-groups/new?connector_device_id=${encodeURIComponent(selectedDeviceID)}` : "/chat/agent-groups/new"

  const deleteGroup = async (group: AgentGroup) => {
    if (!selectedDeviceID || !window.confirm(copy.deleteConfirm.replace("{name}", group.name))) {
      return
    }
    setDeletingID(group.id)
    try {
      await api.delete(`/user/advanced-chat/agent-groups/${encodeURIComponent(group.id)}`, { params: { connector_device_id: selectedDeviceID } })
      await queryClient.invalidateQueries({ queryKey: agentGroupsQueryKey(selectedDeviceID) })
      success(copy.deleted)
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <DeviceSelect devices={devices} value={selectedDeviceID} copy={copy} onChange={setSelectedDeviceID} />
          <Button variant="outline" className="gap-2" disabled={!selectedDeviceID || isFetchingGroups} onClick={refetchGroups}>
            <RefreshCcw size={16} />
            {copy.refresh}
          </Button>
          <Button asChild className="gap-2" disabled={!selectedDeviceID}>
            <Link to={newGroupHref}>
              <Plus size={16} />
              {copy.newGroup}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={18} />
            {selectedDevice ? selectedDevice.name : copy.noDevice}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selectedDeviceID ? (
            <EmptyState>{copy.deviceRequired}</EmptyState>
          ) : groups.length === 0 ? (
            <EmptyState>{isFetchingGroups ? copy.loading : copy.empty}</EmptyState>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-start">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => navigate(`/chat/agent-groups/${encodeURIComponent(group.id)}?connector_device_id=${encodeURIComponent(selectedDeviceID)}`)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-semibold">{group.name}</span>
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{group.id}</span>
                  </div>
                  {group.description && <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{group.description}</div>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {group.agents.map((agent) => (
                      <span key={agent.id} className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                        {agent.type}: {agent.name || agent.id}
                      </span>
                    ))}
                  </div>
                </button>
                <div className="flex gap-1">
                  <Button asChild variant="ghost" size="icon" title={copy.editGroup}>
                    <Link to={`/chat/agent-groups/${encodeURIComponent(group.id)}?connector_device_id=${encodeURIComponent(selectedDeviceID)}`}>
                      <Pencil size={15} />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" disabled={deletingID === group.id} onClick={() => deleteGroup(group)} title={copy.deleteGroup}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AgentGroupEditor({ data, mode }: { data: AgentGroupsData; mode: "new" | "edit" }) {
  const { groupID = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [draft, setDraft] = useState<DraftGroup>(() => emptyDraft())
  const [loadedKey, setLoadedKey] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [editingAgentIndex, setEditingAgentIndex] = useState<number | null>(null)
  const [agentDraft, setAgentDraft] = useState<AgentGroupAgent>(() => emptyAgent())
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const { copy, devices, groups, selectedDeviceID, selectedDevice, catalog, chatAgents, skills, mcpServers, modelOptions, isFetchingGroups, setSelectedDeviceID } = data
  const activeGroup = useMemo(() => groups.find((group) => group.id === groupID), [groups, groupID])
  const editorKey = `${mode}:${selectedDeviceID}:${groupID}`

  useEffect(() => {
    if (loadedKey === editorKey) {
      return
    }
    if (mode === "new") {
      setDraft(emptyDraft())
      setLoadedKey(editorKey)
      return
    }
    if (activeGroup) {
      setDraft(groupToDraft(activeGroup))
      setLoadedKey(editorKey)
    }
  }, [activeGroup, editorKey, loadedKey, mode])

  const saveGroup = async () => {
    if (!selectedDeviceID) {
      error(copy.deviceRequired)
      return
    }
    const payload = {
      connector_device_id: selectedDeviceID,
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      agents: draft.agents.map((agent) => ({
        id: agent.id.trim(),
        name: agent.name.trim(),
        type: agent.type,
        prompt: agent.prompt.trim(),
        chat_agent_id: (agent.chat_agent_id || "").trim(),
        default_model: (agent.default_model || "").trim(),
        user_channel_id: Number(agent.user_channel_id || 0),
        skill_ids: uniqueStrings(agent.skill_ids || []),
        mcp_server_ids: uniqueStrings(agent.mcp_server_ids || []),
      })),
    }
    if (!payload.name) {
      error(copy.nameRequired)
      return
    }
    if (payload.agents.length === 0) {
      error(copy.agentRequired)
      return
    }
    setIsSaving(true)
    try {
      const path = mode === "edit" ? `/user/advanced-chat/agent-groups/${encodeURIComponent(groupID)}` : "/user/advanced-chat/agent-groups"
      const res = mode === "edit" ? await api.put(path, payload) : await api.post(path, payload)
      const saved = normalizeGroup(res.data)
      await queryClient.invalidateQueries({ queryKey: agentGroupsQueryKey(selectedDeviceID) })
      success(copy.saved)
      if (saved) {
        navigate(`/chat/agent-groups/${encodeURIComponent(saved.id)}?connector_device_id=${encodeURIComponent(selectedDeviceID)}`, { replace: mode === "new" })
      }
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const removeAgent = (index: number) => {
    setDraft((current) => ({ ...current, agents: current.agents.filter((_, itemIndex) => itemIndex !== index) }))
  }

  const openCreateAgent = () => {
    setEditingAgentIndex(null)
    setAgentDraft(emptyAgent())
    setIsAgentDialogOpen(true)
  }

  const openEditAgent = (agent: AgentGroupAgent, index: number) => {
    setEditingAgentIndex(index)
    setAgentDraft({ ...agent })
    setIsAgentDialogOpen(true)
  }

  const saveAgentDraft = () => {
    const normalizedAgent = {
      ...agentDraft,
      id: agentDraft.id.trim(),
      name: agentDraft.name.trim(),
      prompt: agentDraft.prompt.trim(),
      chat_agent_id: (agentDraft.chat_agent_id || "").trim(),
      default_model: (agentDraft.default_model || "").trim(),
      user_channel_id: Number(agentDraft.user_channel_id || 0),
      skill_ids: uniqueStrings(agentDraft.skill_ids || []),
      mcp_server_ids: uniqueStrings(agentDraft.mcp_server_ids || []),
    }
    setDraft((current) => {
      if (editingAgentIndex === null) {
        return { ...current, agents: [...current.agents, normalizedAgent] }
      }
      return {
        ...current,
        agents: current.agents.map((agent, index) => (index === editingAgentIndex ? normalizedAgent : agent)),
      }
    })
    setIsAgentDialogOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild variant="ghost" className="mb-2 gap-2 px-0">
            <Link to={selectedDeviceID ? `/chat/agent-groups?connector_device_id=${encodeURIComponent(selectedDeviceID)}` : "/chat/agent-groups"}>
              <ArrowLeft size={16} />
              {copy.backToList}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">{mode === "new" ? copy.newGroup : copy.editGroup}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.editSubtitle}</p>
        </div>
        <Button className="gap-2" disabled={isSaving || !selectedDeviceID} onClick={saveGroup}>
          <Save size={16} />
          {isSaving ? copy.saving : copy.save}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users size={18} />
            {copy.groupSettings}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.connector}>
              {mode === "new" ? <DeviceSelect devices={devices} value={selectedDeviceID} copy={copy} onChange={setSelectedDeviceID} /> : <Input value={selectedDevice?.name || selectedDeviceID} disabled />}
            </Field>
            <Field label={copy.groupID}>
              <Input value={draft.id} placeholder={copy.groupIDPlaceholder} disabled={mode === "edit"} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
            </Field>
          </div>

          {mode === "edit" && !activeGroup && !isFetchingGroups ? (
            <EmptyState>{copy.groupNotFound}</EmptyState>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={copy.groupName}>
                  <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </Field>
              </div>
              <Field label={copy.description}>
                <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span>{copy.agents}</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={openCreateAgent}>
              <Plus size={15} />
              {copy.addAgent}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.agents.length === 0 ? (
            <EmptyState>{copy.noAgentsConfigured}</EmptyState>
          ) : (
            draft.agents.map((agent, index) => {
              const channelName = catalog.find((channel) => channel.id === Number(agent.user_channel_id || 0))?.name || copy.noModelGroupSelected
              return (
                <div key={`${agent.id || "agent"}-${index}`} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <button type="button" className="min-w-0 text-left" onClick={() => openEditAgent(agent, index)}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{agent.name || agent.id || copy.unnamedAgent}</span>
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{agent.type}</span>
                      {agent.id && <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">{agent.id}</span>}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {agent.default_model || copy.noDefaultModel} · {channelName}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {agent.chat_agent_id ? `${copy.chatAgent}: ${chatAgents.find((item) => item.id === agent.chat_agent_id)?.name || agent.chat_agent_id}` : copy.noChatAgentSelected} · {copy.skills}: {(agent.skill_ids || []).length} · MCP: {(agent.mcp_server_ids || []).length}
                    </div>
                  </button>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditAgent(agent, index)} title={copy.editAgent}>
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeAgent(index)} title={copy.removeAgent}>
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <AgentDialog
        open={isAgentDialogOpen}
        copy={copy}
        agent={agentDraft}
        catalog={catalog}
        chatAgents={chatAgents}
        skills={skills}
        mcpServers={mcpServers}
        modelOptions={modelOptions}
        isEditing={editingAgentIndex !== null}
        onOpenChange={setIsAgentDialogOpen}
        onAgentChange={setAgentDraft}
        onSave={saveAgentDraft}
      />
    </div>
  )
}

function AgentDialog({
  open,
  copy,
  agent,
  catalog,
  chatAgents,
  skills,
  mcpServers,
  modelOptions,
  isEditing,
  onOpenChange,
  onAgentChange,
  onSave,
}: {
  open: boolean
  copy: typeof enCopy
  agent: AgentGroupAgent
  catalog: CatalogItem[]
  chatAgents: ChatAgent[]
  skills: ChatSkill[]
  mcpServers: MCPServer[]
  modelOptions: string[]
  isEditing: boolean
  onOpenChange: (open: boolean) => void
  onAgentChange: (agent: AgentGroupAgent) => void
  onSave: () => void
}) {
  const channels = channelOptionsForModel(catalog, agent.default_model || "")
  const updateAgent = (patch: Partial<AgentGroupAgent>) => onAgentChange({ ...agent, ...patch })
  const selectedSkillIDs = new Set(agent.skill_ids || [])
  const selectedMCPServerIDs = new Set(agent.mcp_server_ids || [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? copy.editAgent : copy.newAgent}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={copy.chatAgent}>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={agent.chat_agent_id || ""}
              onChange={(event) => {
                const chatAgent = chatAgents.find((item) => item.id === event.target.value)
                updateAgent({
                  chat_agent_id: event.target.value,
                  name: agent.name || chatAgent?.name || "",
                  default_model: agent.default_model || chatAgent?.default_model || "",
                })
              }}
            >
              <option value="">{copy.noChatAgentSelected}</option>
              {chatAgents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px]">
            <Field label={copy.agentID}>
              <Input value={agent.id} placeholder="worker-1" onChange={(event) => updateAgent({ id: event.target.value })} />
            </Field>
            <Field label={copy.agentName}>
              <Input value={agent.name} onChange={(event) => updateAgent({ name: event.target.value })} />
            </Field>
            <Field label={copy.agentType}>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={agent.type} onChange={(event) => updateAgent({ type: event.target.value as AgentGroupAgent["type"] })}>
                <option value="chief">chief</option>
                <option value="worker">worker</option>
                <option value="critic">critic</option>
                <option value="reviewer">reviewer</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={copy.defaultModel}>
              <ModelSelect
                value={agent.default_model || ""}
                modelOptions={modelOptions}
                copy={copy}
                onChange={(value) => {
                  const channelOptions = channelOptionsForModel(catalog, value)
                  const currentChannelID = Number(agent.user_channel_id || 0)
                  updateAgent({
                    default_model: value,
                    user_channel_id: currentChannelID && channelOptions.some((channel) => channel.id === currentChannelID) ? currentChannelID : 0,
                  })
                }}
              />
            </Field>
            <Field label={copy.modelGroup}>
              <ChannelSelect value={Number(agent.user_channel_id || 0)} channels={channels} copy={copy} onChange={(value) => updateAgent({ user_channel_id: value })} />
            </Field>
          </div>
          <Field label={copy.prompt}>
            <textarea className="min-h-48 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={agent.prompt} onChange={(event) => updateAgent({ prompt: event.target.value })} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <MultiCheckList
              title={copy.skills}
              empty={copy.noSkills}
              items={skills.map((skill) => ({ id: skill.id, label: skill.name, description: skill.description }))}
              selected={selectedSkillIDs}
              onToggle={(id) => updateAgent({ skill_ids: toggleString(agent.skill_ids || [], id) })}
            />
            <MultiCheckList
              title="MCP"
              empty={copy.noMCPServers}
              items={mcpServers.map((server) => ({ id: server.id, label: server.name, description: server.url }))}
              selected={selectedMCPServerIDs}
              onToggle={(id) => updateAgent({ mcp_server_ids: toggleString(agent.mcp_server_ids || [], id) })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
          <Button className="gap-2" onClick={onSave}>
            <Save size={16} />
            {copy.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeviceSelect({ devices, value, copy, onChange }: { devices: ConnectorDevice[]; value: string; copy: typeof enCopy; onChange: (value: string) => void }) {
  return (
    <select className="h-10 min-w-60 rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{copy.selectDevice}</option>
      {devices.map((device) => (
        <option key={device.id} value={device.id}>
          {device.name}{device.online ? "" : ` (${copy.offline})`}
        </option>
      ))}
    </select>
  )
}

function ModelSelect({ value, modelOptions, copy, onChange }: { value: string; modelOptions: string[]; copy: typeof enCopy; onChange: (value: string) => void }) {
  const options = value && !modelOptions.includes(value) ? [value, ...modelOptions] : modelOptions
  return (
    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{copy.noDefaultModel}</option>
      {options.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  )
}

function ChannelSelect({ value, channels, copy, onChange }: { value: number; channels: CatalogItem[]; copy: typeof enCopy; onChange: (value: number) => void }) {
  return (
    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value || ""} onChange={(event) => onChange(Number(event.target.value) || 0)}>
      <option value="">{channels.length ? copy.selectModelGroup : copy.noModelGroups}</option>
      {channels.map((channel) => (
        <option key={channel.id} value={channel.id}>
          {channel.name}
        </option>
      ))}
    </select>
  )
}

function MultiCheckList({
  title,
  empty,
  items,
  selected,
  onToggle,
}: {
  title: string
  empty: string
  items: Array<{ id: string; label: string; description?: string }>
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {items.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <input type="checkbox" className="mt-1" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
              <span className="min-w-0">
                <span className="block truncate text-sm">{item.label}</span>
                {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{children}</div>
}

function groupToDraft(group: AgentGroup): DraftGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description || "",
    agents: group.agents.length ? group.agents.map((agent) => ({ ...agent })) : [emptyAgent()],
  }
}

function uniqueModels(catalog: CatalogItem[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function channelOptionsForModel(catalog: CatalogItem[], modelName: string) {
  const model = modelName.trim()
  return catalog.filter((channel) => !model || channel.models.includes(model))
}

function toggleString(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function normalizeDevice(value: unknown): ConnectorDevice | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  return id ? { id, name: stringValue(value.name) || id, online: value.online === true, os: stringValue(value.os) } : null
}

function normalizeCatalogItem(value: unknown): CatalogItem {
  const item = isRecord(value) ? value : {}
  return {
    id: numberValue(item.id),
    name: stringValue(item.name),
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function normalizeChatAgent(value: unknown): ChatAgent | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    name: stringValue(value.name) || id,
    prompt: stringValue(value.prompt),
    default_model: stringValue(value.default_model),
  }
}

function normalizeSkill(value: unknown): ChatSkill | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    name: stringValue(value.name) || id,
    description: stringValue(value.description),
    prompt: stringValue(value.prompt),
    mcp_server_ids: stringArray(value.mcp_server_ids),
  }
}

function normalizeAdvancedChatSettings(value: unknown): AdvancedChatSettings {
  const item = isRecord(value) ? value : {}
  const builtin = Array.isArray(item.builtin_mcp_servers) ? item.builtin_mcp_servers.map(normalizeMCPServer) : []
  const custom = Array.isArray(item.custom_mcp_servers) ? item.custom_mcp_servers.map(normalizeMCPServer) : []
  const mcpServers = Array.isArray(item.mcp_servers) ? item.mcp_servers.map(normalizeMCPServer) : mergeMCPServers(builtin, custom)
  return {
    mcp_servers: mcpServers,
    builtin_mcp_servers: builtin,
    custom_mcp_servers: custom,
  }
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  return {
    id: stringValue(item.id) || createLocalID(),
    name: stringValue(item.name),
    url: stringValue(item.url),
    enabled: item.enabled !== false,
    request_mode: stringValue(item.request_mode) || "frontend",
  }
}

function normalizeGroup(value: unknown): AgentGroup | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  const agents = Array.isArray(value.agents) ? value.agents.map(normalizeAgent).filter((agent): agent is AgentGroupAgent => Boolean(agent)) : []
  return { id, name: stringValue(value.name) || id, description: stringValue(value.description), agents, updated_at: stringValue(value.updated_at) }
}

function normalizeAgent(value: unknown): AgentGroupAgent | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null
  const type = stringValue(value.type)
  return {
    id,
    name: stringValue(value.name) || id,
    type: type === "chief" || type === "critic" || type === "reviewer" ? type : "worker",
    prompt: stringValue(value.prompt),
    chat_agent_id: stringValue(value.chat_agent_id),
    default_model: stringValue(value.default_model),
    user_channel_id: numberValue(value.user_channel_id),
    skill_ids: stringArray(value.skill_ids),
    mcp_server_ids: stringArray(value.mcp_server_ids),
  }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? uniqueStrings(value.filter((item): item is string => typeof item === "string")) : []
}

function mergeMCPServers(...groups: MCPServer[][]) {
  const seen = new Set<string>()
  const result: MCPServer[] = []
  for (const group of groups) {
    for (const server of group) {
      if (!server.id || seen.has(server.id)) continue
      seen.add(server.id)
      result.push(server)
    }
  }
  return result
}

function createLocalID() {
  return Math.random().toString(36).slice(2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhCopy = {
  title: "代理组",
  subtitle: "代理组存储在连接器设备的 token-market/.agent-groups 目录中。选择连接器后会自动拉取。",
  editSubtitle: "编辑当前代理组的基础信息和成员 agent。模型和分组来自当前可用模型列表。",
  selectDevice: "选择连接器",
  offline: "离线",
  refresh: "刷新",
  newGroup: "新建代理组",
  editGroup: "编辑代理组",
  noDevice: "未选择连接器",
  deviceRequired: "请先选择一个在线连接器",
  loading: "正在加载代理组...",
  empty: "该连接器暂无代理组",
  groupNotFound: "未找到该代理组，请确认连接器或代理组选择是否正确。",
  deleteGroup: "删除代理组",
  deleteConfirm: "确定删除代理组 {name} 吗？",
  deleted: "代理组已删除",
  deleteFailed: "删除代理组失败",
  saved: "代理组已保存",
  saveFailed: "保存代理组失败",
  nameRequired: "请输入代理组名称",
  agentRequired: "至少需要一个带提示词的 agent",
  backToList: "返回代理组",
  groupSettings: "代理组设置",
  groupID: "代理组 ID",
  groupIDPlaceholder: "留空自动生成",
  groupName: "代理组名称",
  connector: "连接器",
  description: "描述",
  agents: "Agents",
  addAgent: "添加 agent",
  newAgent: "新建 agent",
  editAgent: "编辑 agent",
  noAgentsConfigured: "还没有 agent，点击添加 agent 创建一个成员。",
  unnamedAgent: "未命名 agent",
  agentID: "Agent ID",
  agentName: "名称",
  agentType: "类型",
  defaultModel: "默认模型",
  modelGroup: "分组",
  selectModelGroup: "选择分组",
  noModelGroups: "无可用分组",
  noModelGroupSelected: "未选择分组",
  noDefaultModel: "不指定默认模型",
  removeAgent: "移除 agent",
  prompt: "提示词",
  cancel: "取消",
  done: "完成",
  save: "保存",
  saving: "保存中...",
}

const enCopy = {
  title: "Agent Groups",
  subtitle: "Agent groups are stored on the connector device under token-market/.agent-groups. Select a connector to load them.",
  editSubtitle: "Edit the current agent group's details and member agents. Models and groups come from the available model list.",
  selectDevice: "Select connector",
  offline: "offline",
  refresh: "Refresh",
  newGroup: "New group",
  editGroup: "Edit group",
  noDevice: "No connector selected",
  deviceRequired: "Select an online connector first",
  loading: "Loading agent groups...",
  empty: "No agent groups on this connector",
  groupNotFound: "Agent group not found. Check the selected connector or group.",
  deleteGroup: "Delete group",
  deleteConfirm: "Delete agent group {name}?",
  deleted: "Agent group deleted",
  deleteFailed: "Failed to delete agent group",
  saved: "Agent group saved",
  saveFailed: "Failed to save agent group",
  nameRequired: "Agent group name is required",
  agentRequired: "At least one agent needs a prompt",
  backToList: "Back to groups",
  groupSettings: "Group settings",
  groupID: "Group ID",
  groupIDPlaceholder: "Leave empty to generate",
  groupName: "Group name",
  connector: "Connector",
  description: "Description",
  agents: "Agents",
  addAgent: "Add agent",
  newAgent: "New agent",
  editAgent: "Edit agent",
  noAgentsConfigured: "No agents yet. Click Add agent to create a member.",
  unnamedAgent: "Unnamed agent",
  chatAgent: "Chat Agent",
  noChatAgentSelected: "No chat agent selected",
  skills: "Skills",
  noSkills: "No skills",
  noMCPServers: "No MCP servers",
  agentID: "Agent ID",
  agentName: "Name",
  agentType: "Type",
  defaultModel: "Default model",
  modelGroup: "Group",
  selectModelGroup: "Select group",
  noModelGroups: "No groups",
  noModelGroupSelected: "No group selected",
  noDefaultModel: "No default model",
  removeAgent: "Remove agent",
  prompt: "Prompt",
  cancel: "Cancel",
  done: "Done",
  save: "Save",
  saving: "Saving...",
}
