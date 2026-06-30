import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCcw, Save, Trash2, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface ConnectorDevice {
  id: string
  name: string
  online: boolean
  os?: string
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
  default_model?: string
}

interface DraftGroup {
  id: string
  name: string
  description: string
  agents: AgentGroupAgent[]
}

const devicesQueryKey = ["advanced-chat-connector-devices"] as const
const agentGroupsQueryKey = (deviceID: string) => ["advanced-chat-agent-groups", deviceID] as const
const emptyAgent = (): AgentGroupAgent => ({ id: "", name: "", type: "worker", prompt: "", default_model: "" })
const emptyDraft = (): DraftGroup => ({ id: "", name: "", description: "", agents: [{ id: "chief", name: "Chief", type: "chief", prompt: "" }] })

export default function AgentGroups() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [selectedDeviceID, setSelectedDeviceID] = useState("")
  const [activeGroupID, setActiveGroupID] = useState("")
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [draft, setDraft] = useState<DraftGroup>(() => emptyDraft())
  const [isSaving, setIsSaving] = useState(false)
  const [deletingID, setDeletingID] = useState("")

  const { data: devices = [] } = useQuery<ConnectorDevice[]>({
    queryKey: devicesQueryKey,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      const rawDevices: unknown[] = Array.isArray(res.data) ? res.data : []
      return rawDevices.map(normalizeDevice).filter((item): item is ConnectorDevice => Boolean(item))
    },
  })

  useEffect(() => {
    if (selectedDeviceID && devices.some((device) => device.id === selectedDeviceID)) {
      return
    }
    const firstOnline = devices.find((device) => device.online)
    setSelectedDeviceID(firstOnline?.id || devices[0]?.id || "")
  }, [devices, selectedDeviceID])

  const { data: groups = [], isFetching, refetch } = useQuery<AgentGroup[]>({
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

  const openCreate = () => {
    if (!selectedDeviceID) {
      error(copy.deviceRequired)
      return
    }
    setActiveGroupID("")
    setDraft(emptyDraft())
    setIsEditorOpen(true)
  }

  const openEdit = (group: AgentGroup) => {
    setActiveGroupID(group.id)
    setDraft({
      id: group.id,
      name: group.name,
      description: group.description || "",
      agents: group.agents.length ? group.agents.map((agent) => ({ ...agent })) : [emptyAgent()],
    })
    setIsEditorOpen(true)
  }

  const updateAgent = (index: number, patch: Partial<AgentGroupAgent>) => {
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent, itemIndex) => (itemIndex === index ? { ...agent, ...patch } : agent)),
    }))
  }

  const removeAgent = (index: number) => {
    setDraft((current) => ({ ...current, agents: current.agents.filter((_, itemIndex) => itemIndex !== index) }))
  }

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
        default_model: (agent.default_model || "").trim(),
      })),
    }
    if (!payload.name) {
      error(copy.nameRequired)
      return
    }
    if (!payload.agents.some((agent) => agent.prompt)) {
      error(copy.agentRequired)
      return
    }
    setIsSaving(true)
    try {
      const path = activeGroupID ? `/user/advanced-chat/agent-groups/${encodeURIComponent(activeGroupID)}` : "/user/advanced-chat/agent-groups"
      const res = activeGroupID ? await api.put(path, payload) : await api.post(path, payload)
      const saved = normalizeGroup(res.data)
      await queryClient.invalidateQueries({ queryKey: agentGroupsQueryKey(selectedDeviceID) })
      if (saved) {
        setActiveGroupID(saved.id)
      }
      setIsEditorOpen(false)
      success(copy.saved)
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

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
          <select className="h-10 min-w-60 rounded-md border bg-background px-3 text-sm" value={selectedDeviceID} onChange={(event) => setSelectedDeviceID(event.target.value)}>
            <option value="">{copy.selectDevice}</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}{device.online ? "" : ` (${copy.offline})`}
              </option>
            ))}
          </select>
          <Button variant="outline" className="gap-2" disabled={!selectedDeviceID || isFetching} onClick={() => refetch()}>
            <RefreshCcw size={16} />
            {copy.refresh}
          </Button>
          <Button className="gap-2" disabled={!selectedDeviceID} onClick={openCreate}>
            <Plus size={16} />
            {copy.newGroup}
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
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.deviceRequired}</div>
          ) : groups.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{isFetching ? copy.loading : copy.empty}</div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className={cn("grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-start", activeGroupID === group.id && "border-primary bg-primary/5")}>
                <button type="button" className="min-w-0 text-left" onClick={() => openEdit(group)}>
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
                <Button variant="ghost" size="sm" disabled={deletingID === group.id} onClick={() => deleteGroup(group)} title={copy.deleteGroup}>
                  <Trash2 size={15} />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeGroupID ? copy.editGroup : copy.newGroup}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={copy.groupID}>
                <Input value={draft.id} placeholder={copy.groupIDPlaceholder} disabled={Boolean(activeGroupID)} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
              </Field>
              <Field label={copy.groupName}>
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </Field>
              <Field label={copy.connector}>
                <Input value={selectedDevice?.name || selectedDeviceID} disabled />
              </Field>
            </div>
            <Field label={copy.description}>
              <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{copy.agents}</div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setDraft((current) => ({ ...current, agents: [...current.agents, emptyAgent()] }))}>
                  <Plus size={15} />
                  {copy.addAgent}
                </Button>
              </div>
              {draft.agents.map((agent, index) => (
                <div key={index} className="rounded-md border p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_1fr_auto]">
                    <Field label={copy.agentID}>
                      <Input value={agent.id} placeholder="worker-1" onChange={(event) => updateAgent(index, { id: event.target.value })} />
                    </Field>
                    <Field label={copy.agentName}>
                      <Input value={agent.name} onChange={(event) => updateAgent(index, { name: event.target.value })} />
                    </Field>
                    <Field label={copy.agentType}>
                      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={agent.type} onChange={(event) => updateAgent(index, { type: event.target.value as AgentGroupAgent["type"] })}>
                        <option value="chief">chief</option>
                        <option value="worker">worker</option>
                        <option value="critic">critic</option>
                        <option value="reviewer">reviewer</option>
                      </select>
                    </Field>
                    <Field label={copy.defaultModel}>
                      <Input value={agent.default_model || ""} onChange={(event) => updateAgent(index, { default_model: event.target.value })} />
                    </Field>
                    <div className="flex items-end">
                      <Button variant="ghost" size="icon" disabled={draft.agents.length <= 1} onClick={() => removeAgent(index)} title={copy.removeAgent}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                  <Field label={copy.prompt}>
                    <textarea className="mt-1 min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={agent.prompt} onChange={(event) => updateAgent(index, { prompt: event.target.value })} />
                  </Field>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditorOpen(false)}>{copy.cancel}</Button>
            <Button className="gap-2" disabled={isSaving} onClick={saveGroup}>
              <Save size={16} />
              {isSaving ? copy.saving : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function normalizeDevice(value: unknown): ConnectorDevice | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  return id ? { id, name: stringValue(value.name) || id, online: value.online === true, os: stringValue(value.os) } : null
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
    default_model: stringValue(value.default_model),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhCopy = {
  title: "代理组",
  subtitle: "代理组存储在连接器设备的 token-market/.agent-groups 目录中。进入页面后会从所选连接器自动拉取。",
  selectDevice: "选择连接器",
  offline: "离线",
  refresh: "刷新",
  newGroup: "新建代理组",
  editGroup: "编辑代理组",
  noDevice: "未选择连接器",
  deviceRequired: "请先选择一个在线连接器",
  loading: "正在加载代理组...",
  empty: "该连接器暂无代理组",
  deleteGroup: "删除代理组",
  deleteConfirm: "确定删除代理组 {name} 吗？",
  deleted: "代理组已删除",
  deleteFailed: "删除代理组失败",
  saved: "代理组已保存",
  saveFailed: "保存代理组失败",
  nameRequired: "请输入代理组名称",
  agentRequired: "至少需要一个带提示词的 agent",
  groupID: "代理组 ID",
  groupIDPlaceholder: "留空自动生成",
  groupName: "代理组名称",
  connector: "连接器",
  description: "描述",
  agents: "Agents",
  addAgent: "添加 agent",
  agentID: "Agent ID",
  agentName: "名称",
  agentType: "类型",
  defaultModel: "默认模型",
  removeAgent: "移除 agent",
  prompt: "提示词",
  cancel: "取消",
  save: "保存",
  saving: "保存中...",
}

const enCopy = {
  title: "Agent Groups",
  subtitle: "Agent groups are stored on the connector device under token-market/.agent-groups. This page loads them from the selected connector.",
  selectDevice: "Select connector",
  offline: "offline",
  refresh: "Refresh",
  newGroup: "New group",
  editGroup: "Edit group",
  noDevice: "No connector selected",
  deviceRequired: "Select an online connector first",
  loading: "Loading agent groups...",
  empty: "No agent groups on this connector",
  deleteGroup: "Delete group",
  deleteConfirm: "Delete agent group {name}?",
  deleted: "Agent group deleted",
  deleteFailed: "Failed to delete agent group",
  saved: "Agent group saved",
  saveFailed: "Failed to save agent group",
  nameRequired: "Agent group name is required",
  agentRequired: "At least one agent needs a prompt",
  groupID: "Group ID",
  groupIDPlaceholder: "Leave empty to generate",
  groupName: "Group name",
  connector: "Connector",
  description: "Description",
  agents: "Agents",
  addAgent: "Add agent",
  agentID: "Agent ID",
  agentName: "Name",
  agentType: "Type",
  defaultModel: "Default model",
  removeAgent: "Remove agent",
  prompt: "Prompt",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving...",
}

const jaCopy = enCopy
