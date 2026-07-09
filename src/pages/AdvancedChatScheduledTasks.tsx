import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, Pencil, Play, Plus, Save, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

interface CatalogItem {
  id: number
  name: string
  models: string[]
}

interface Agent {
  id: string
  name: string
  default_model?: string
}

interface Session {
  id: string
  title: string
}

interface Delivery {
  id: string
  name: string
  method: string
  enabled: boolean
}

interface AdvancedChatSettings {
  scheduled_tasks_enabled: boolean
  message_delivery_enabled: boolean
}

interface ScheduledTask {
  id: string
  name: string
  description: string
  agent_id?: string
  schedule_type: "manual" | "once" | "interval"
  run_at?: string
  interval_seconds: number
  session_mode: "auto" | "existing"
  session_id?: string
  auto_delete_session: boolean
  message: string
  timeout_seconds: number
  delivery_id?: string
  model_name?: string
  user_channel_id?: number
  max_tokens?: number
  temperature?: number | null
  reasoning_effort?: string
  enabled: boolean
  last_run_id?: string
  last_status?: string
  last_error?: string
  next_run_at?: string
  last_run_at?: string
}

interface TaskForm {
  id: string
  name: string
  description: string
  agent_id: string
  schedule_type: "manual" | "once" | "interval"
  run_at: string
  interval_seconds: number
  session_mode: "auto" | "existing"
  session_id: string
  auto_delete_session: boolean
  message: string
  timeout_seconds: number
  delivery_id: string
  model_name: string
  user_channel_id: number
  max_tokens: number
  temperature: number | null
  reasoning_effort: string
  enabled: boolean
}

const tasksQueryKey = ["advanced-chat-scheduled-tasks"] as const
const deliveriesQueryKey = ["advanced-chat-deliveries"] as const

const defaultForm: TaskForm = {
  id: "",
  name: "",
  description: "",
  agent_id: "",
  schedule_type: "manual",
  run_at: "",
  interval_seconds: 3600,
  session_mode: "auto",
  session_id: "",
  auto_delete_session: false,
  message: "",
  timeout_seconds: 300,
  delivery_id: "",
  model_name: "",
  user_channel_id: 0,
  max_tokens: 0,
  temperature: null,
  reasoning_effort: "",
  enabled: true,
}

export default function AdvancedChatScheduledTasks() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : language === "ja" ? jaCopy : enCopy
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const [form, setForm] = useState<TaskForm>(defaultForm)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [runningID, setRunningID] = useState("")
  const [deletingID, setDeletingID] = useState("")

  const { data: settings = { scheduled_tasks_enabled: true, message_delivery_enabled: true } } = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-user-settings"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return {
        scheduled_tasks_enabled: res.data?.scheduled_tasks_enabled !== false,
        message_delivery_enabled: res.data?.message_delivery_enabled !== false,
      }
    },
  })

  const { data: tasks = [] } = useQuery<ScheduledTask[]>({
    queryKey: tasksQueryKey,
    enabled: settings.scheduled_tasks_enabled,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/scheduled-tasks")
      return Array.isArray(res.data) ? res.data.map(normalizeTask).filter((item): item is ScheduledTask => Boolean(item)) : []
    },
  })
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["advanced-chat-agents"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data) ? res.data.map(normalizeAgent).filter((item): item is Agent => Boolean(item)) : []
    },
  })
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["advanced-chat-sessions"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/sessions")
      return Array.isArray(res.data) ? res.data.map(normalizeSession).filter((item): item is Session => Boolean(item)) : []
    },
  })
  const { data: deliveries = [] } = useQuery<Delivery[]>({
    queryKey: deliveriesQueryKey,
    enabled: settings.message_delivery_enabled,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/deliveries")
      return Array.isArray(res.data) ? res.data.map(normalizeDelivery).filter((item): item is Delivery => Boolean(item)) : []
    },
  })
  const { data: catalog = [] } = useQuery<CatalogItem[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const modelOptions = useMemo(() => Array.from(new Set(catalog.flatMap((item) => item.models))).sort(), [catalog])
  const selectedModel = form.model_name
  const channelOptions = useMemo(
    () => catalog.filter((item) => !selectedModel || item.models.includes(selectedModel)),
    [catalog, selectedModel]
  )

  const openCreate = () => {
    setForm({ ...defaultForm, name: copy.defaultName, model_name: modelOptions[0] || "" })
    setIsDialogOpen(true)
  }

  const openEdit = (task: ScheduledTask) => {
    setForm({
      id: task.id,
      name: task.name,
      description: task.description,
      agent_id: task.agent_id || "",
      schedule_type: task.schedule_type,
      run_at: dateTimeLocalValue(task.run_at),
      interval_seconds: task.interval_seconds || 3600,
      session_mode: task.session_mode,
      session_id: task.session_id || "",
      auto_delete_session: task.auto_delete_session,
      message: task.message,
      timeout_seconds: task.timeout_seconds || 300,
      delivery_id: task.delivery_id || "",
      model_name: task.model_name || "",
      user_channel_id: task.user_channel_id || 0,
      max_tokens: task.max_tokens || 0,
      temperature: task.temperature ?? null,
      reasoning_effort: task.reasoning_effort || "",
      enabled: task.enabled,
    })
    setIsDialogOpen(true)
  }

  const payloadFromForm = () => ({
    name: form.name.trim(),
    description: form.description.trim(),
    agent_id: form.agent_id,
    schedule_type: form.schedule_type,
    run_at: form.schedule_type === "once" && form.run_at ? new Date(form.run_at).toISOString() : null,
    interval_seconds: Number(form.interval_seconds) || 0,
    session_mode: form.session_mode,
    session_id: form.session_mode === "existing" ? form.session_id : "",
    auto_delete_session: form.session_mode === "auto" && form.auto_delete_session,
    message: form.message.trim(),
    timeout_seconds: Number(form.timeout_seconds) || 300,
    delivery_id: form.delivery_id,
    model_name: form.model_name.trim(),
    user_channel_id: Number(form.user_channel_id) || 0,
    max_tokens: Number(form.max_tokens) || 0,
    temperature: form.temperature,
    reasoning_effort: form.reasoning_effort,
    enabled: form.enabled,
  })

  const saveTask = async () => {
    const payload = payloadFromForm()
    if (!payload.name) {
      error(copy.nameRequired)
      return
    }
    if (!payload.message) {
      error(copy.messageRequired)
      return
    }
    if (!payload.model_name) {
      error(copy.modelRequired)
      return
    }
    setIsSaving(true)
    try {
      if (form.id) {
        await api.put(`/user/advanced-chat/scheduled-tasks/${encodeURIComponent(form.id)}`, payload)
      } else {
        await api.post("/user/advanced-chat/scheduled-tasks", payload)
      }
      success(copy.saved)
      setIsDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.saveFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const runTask = async (task: ScheduledTask) => {
    setRunningID(task.id)
    try {
      await api.post(`/user/advanced-chat/scheduled-tasks/${encodeURIComponent(task.id)}/run`)
      success(copy.runStarted)
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey })
      await queryClient.invalidateQueries({ queryKey: ["advanced-chat-sessions"] })
    } catch (err) {
      error(apiErrorMessage(err, copy.runFailed))
    } finally {
      setRunningID("")
    }
  }

  const deleteTask = async (task: ScheduledTask) => {
    if (!window.confirm(copy.deleteConfirm.replace("{name}", task.name))) {
      return
    }
    setDeletingID(task.id)
    try {
      await api.delete(`/user/advanced-chat/scheduled-tasks/${encodeURIComponent(task.id)}`)
      success(copy.deleted)
      await queryClient.invalidateQueries({ queryKey: tasksQueryKey })
    } catch (err) {
      error(apiErrorMessage(err, copy.deleteFailed))
    } finally {
      setDeletingID("")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button className="gap-2" onClick={openCreate} disabled={!settings.scheduled_tasks_enabled}>
          <Plus size={16} />
          {copy.create}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock size={18} />
            {copy.list}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!settings.scheduled_tasks_enabled ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{copy.disabledByAdmin}</div>
          ) : tasks.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{copy.empty}</div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-md border p-4">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{task.name}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{scheduleLabel(task, copy)}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{task.enabled ? copy.enabled : copy.disabled}</span>
                        {task.last_status && <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{statusLabel(task.last_status, copy)}</span>}
                      </div>
                      {task.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</div>}
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {copy.model}: {task.model_name || "-"} · {copy.nextRun}: {formatDateTime(task.next_run_at) || "-"}
                      </div>
                      {task.last_error && <div className="mt-1 line-clamp-2 text-xs text-destructive">{task.last_error}</div>}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button variant="outline" size="sm" className="h-8 gap-2" disabled={Boolean(runningID)} onClick={() => runTask(task)}>
                        <Play size={15} />
                        {runningID === task.id ? copy.running : copy.run}
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(task)} title={copy.edit}>
                        <Pencil size={15} />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" disabled={deletingID === task.id} onClick={() => deleteTask(task)} title={copy.delete}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? copy.edit : copy.create}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={copy.name}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label={copy.agent}>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.agent_id} onChange={(event) => setForm({ ...form, agent_id: event.target.value })}>
                  <option value="">{copy.noAgent}</option>
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label={copy.description}><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={copy.scheduleType}>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.schedule_type} onChange={(event) => setForm({ ...form, schedule_type: event.target.value as TaskForm["schedule_type"] })}>
                  <option value="manual">{copy.manual}</option>
                  <option value="once">{copy.once}</option>
                  <option value="interval">{copy.interval}</option>
                </select>
              </Field>
              {form.schedule_type === "once" && <Field label={copy.runAt}><Input type="datetime-local" value={form.run_at} onChange={(event) => setForm({ ...form, run_at: event.target.value })} /></Field>}
              {form.schedule_type === "interval" && <Field label={copy.intervalSeconds}><Input type="number" min={60} value={form.interval_seconds} onChange={(event) => setForm({ ...form, interval_seconds: Number(event.target.value) || 60 })} /></Field>}
              <Field label={copy.timeout}><Input type="number" min={30} value={form.timeout_seconds} onChange={(event) => setForm({ ...form, timeout_seconds: Number(event.target.value) || 300 })} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={copy.sessionMode}>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.session_mode} onChange={(event) => setForm({ ...form, session_mode: event.target.value as TaskForm["session_mode"] })}>
                  <option value="auto">{copy.autoSession}</option>
                  <option value="existing">{copy.existingSession}</option>
                </select>
              </Field>
              {form.session_mode === "existing" ? (
                <Field label={copy.session}>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.session_id} onChange={(event) => setForm({ ...form, session_id: event.target.value })}>
                    <option value="">{copy.selectSession}</option>
                    {sessions.map((session) => <option key={session.id} value={session.id}>{session.title || session.id}</option>)}
                  </select>
                </Field>
              ) : (
                <label className="mt-7 flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <input type="checkbox" checked={form.auto_delete_session} onChange={(event) => setForm({ ...form, auto_delete_session: event.target.checked })} />
                  <span className="font-medium">{copy.autoDeleteSession}</span>
                </label>
              )}
            </div>
            <Field label={copy.message}><textarea className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={copy.delivery}>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.delivery_id} disabled={!settings.message_delivery_enabled} onChange={(event) => setForm({ ...form, delivery_id: event.target.value })}>
                  <option value="">{copy.noDelivery}</option>
                  {deliveries.filter((item) => item.enabled).map((delivery) => <option key={delivery.id} value={delivery.id}>{delivery.name}</option>)}
                </select>
              </Field>
              <Field label={copy.channel}>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.user_channel_id || ""} onChange={(event) => setForm({ ...form, user_channel_id: Number(event.target.value) || 0 })}>
                  <option value="">{copy.selectChannel}</option>
                  {channelOptions.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label={copy.model}>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.model_name} onChange={(event) => setForm({ ...form, model_name: event.target.value, user_channel_id: 0 })}>
                  <option value="">{copy.selectModel}</option>
                  {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </Field>
              <Field label={copy.temperature}><Input type="number" min={0} max={2} step={0.1} value={form.temperature ?? ""} onChange={(event) => setForm({ ...form, temperature: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
              <Field label={copy.reasoningEffort}>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.reasoning_effort} onChange={(event) => setForm({ ...form, reasoning_effort: event.target.value })}>
                  <option value="">{copy.reasoningDefault}</option>
                  <option value="minimal">{copy.reasoningMinimal}</option>
                  <option value="low">{copy.reasoningLow}</option>
                  <option value="medium">{copy.reasoningMedium}</option>
                  <option value="high">{copy.reasoningHigh}</option>
                </select>
              </Field>
              <Field label={copy.maxTokens}><Input type="number" min={0} max={200000} value={form.max_tokens || ""} onChange={(event) => setForm({ ...form, max_tokens: Number(event.target.value) || 0 })} /></Field>
            </div>
            <label className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
              <span className="font-medium">{copy.enabled}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{copy.cancel}</Button>
            <Button className="gap-2" disabled={isSaving} onClick={saveTask}>
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
  return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span>{children}</label>
}

function normalizeTask(value: unknown): ScheduledTask | null {
  if (!isRecord(value)) return null
  const id = stringFromUnknown(value.id)
  if (!id) return null
  return {
    id,
    name: stringFromUnknown(value.name),
    description: stringFromUnknown(value.description),
    agent_id: stringFromUnknown(value.agent_id) || undefined,
    schedule_type: value.schedule_type === "once" || value.schedule_type === "interval" ? value.schedule_type : "manual",
    run_at: stringFromUnknown(value.run_at) || undefined,
    interval_seconds: Number(value.interval_seconds || 0),
    session_mode: value.session_mode === "existing" ? "existing" : "auto",
    session_id: stringFromUnknown(value.session_id) || undefined,
    auto_delete_session: value.auto_delete_session === true,
    message: stringFromUnknown(value.message),
    timeout_seconds: Number(value.timeout_seconds || 300),
    delivery_id: stringFromUnknown(value.delivery_id) || undefined,
    model_name: stringFromUnknown(value.model_name) || undefined,
    user_channel_id: Number(value.user_channel_id || 0) || undefined,
    max_tokens: Number(value.max_tokens || 0) || 0,
    temperature: value.temperature === null || value.temperature === undefined ? null : Number(value.temperature),
    reasoning_effort: stringFromUnknown(value.reasoning_effort) || "",
    enabled: value.enabled !== false,
    last_run_id: stringFromUnknown(value.last_run_id) || undefined,
    last_status: stringFromUnknown(value.last_status) || undefined,
    last_error: stringFromUnknown(value.last_error) || undefined,
    next_run_at: stringFromUnknown(value.next_run_at) || undefined,
    last_run_at: stringFromUnknown(value.last_run_at) || undefined,
  }
}

function normalizeAgent(value: unknown): Agent | null {
  if (!isRecord(value)) return null
  const id = stringFromUnknown(value.id)
  return id ? { id, name: stringFromUnknown(value.name), default_model: stringFromUnknown(value.default_model) } : null
}

function normalizeSession(value: unknown): Session | null {
  if (!isRecord(value)) return null
  const id = stringFromUnknown(value.id)
  return id ? { id, title: stringFromUnknown(value.title) } : null
}

function normalizeDelivery(value: unknown): Delivery | null {
  if (!isRecord(value)) return null
  const id = stringFromUnknown(value.id)
  return id ? { id, name: stringFromUnknown(value.name), method: stringFromUnknown(value.method), enabled: value.enabled !== false } : null
}

function normalizeCatalogItem(value: unknown): CatalogItem {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function scheduleLabel(task: ScheduledTask, copy: typeof zhCopy) {
  if (task.schedule_type === "once") return `${copy.once} ${formatDateTime(task.run_at) || ""}`.trim()
  if (task.schedule_type === "interval") return `${copy.interval} ${task.interval_seconds}s`
  return copy.manual
}

function statusLabel(status: string, copy: typeof zhCopy) {
  return copy[`status_${status}` as keyof typeof copy] || status
}

function dateTimeLocalValue(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const zhCopy = {
  title: "计划任务",
  subtitle: "按手动、一次性或间隔运行助理聊天任务，并通过结果投递配置发送输出。",
  list: "任务列表",
  empty: "暂无计划任务",
  create: "新建任务",
  edit: "编辑任务",
  delete: "删除任务",
  defaultName: "新任务",
  name: "名称",
  description: "描述",
  agent: "代理",
  noAgent: "不指定代理",
  scheduleType: "运行时机",
  manual: "手动",
  once: "一次性",
  interval: "间隔",
  runAt: "运行时间",
  intervalSeconds: "间隔秒数",
  timeout: "超时时间（秒）",
  sessionMode: "会话",
  autoSession: "自动新建会话",
  existingSession: "选择已有会话",
  session: "已有会话",
  selectSession: "选择会话",
  autoDeleteSession: "运行后自动删除会话",
  message: "发送的消息",
  delivery: "结果投递",
  noDelivery: "不投递",
  channel: "用户渠道",
  selectChannel: "选择渠道",
  model: "模型",
  selectModel: "选择模型",
  temperature: "温度",
  reasoningEffort: "思考强度",
  reasoningDefault: "默认",
  reasoningMinimal: "最小",
  reasoningLow: "低",
  reasoningMedium: "中",
  reasoningHigh: "高",
  maxTokens: "最大 Token",
  enabled: "启用",
  disabled: "停用",
  nextRun: "下次运行",
  run: "运行",
  running: "运行中",
  runStarted: "任务已开始运行",
  runFailed: "运行任务失败",
  save: "保存",
  saving: "保存中...",
  saved: "计划任务已保存",
  saveFailed: "保存计划任务失败",
  deleted: "计划任务已删除",
  deleteFailed: "删除计划任务失败",
  deleteConfirm: "确定删除计划任务“{name}”吗？",
  nameRequired: "请输入任务名称",
  messageRequired: "请输入发送的消息",
  modelRequired: "请选择模型",
  disabledByAdmin: "管理员已关闭计划任务",
  cancel: "取消",
  status_idle: "空闲",
  status_queued: "排队中",
  status_running: "运行中",
  status_completed: "已完成",
  status_failed: "失败",
}

const enCopy: typeof zhCopy = {
  title: "Scheduled Tasks",
  subtitle: "Run agent chat tasks manually, once, or on an interval, then deliver results through a configured destination.",
  list: "Task list",
  empty: "No scheduled tasks",
  create: "New task",
  edit: "Edit task",
  delete: "Delete task",
  defaultName: "New task",
  name: "Name",
  description: "Description",
  agent: "Agent",
  noAgent: "No agent",
  scheduleType: "Run timing",
  manual: "Manual",
  once: "Once",
  interval: "Interval",
  runAt: "Run at",
  intervalSeconds: "Interval seconds",
  timeout: "Timeout seconds",
  sessionMode: "Session",
  autoSession: "Create automatically",
  existingSession: "Use existing session",
  session: "Existing session",
  selectSession: "Select session",
  autoDeleteSession: "Delete auto-created session after run",
  message: "Message",
  delivery: "Result delivery",
  noDelivery: "No delivery",
  channel: "User channel",
  selectChannel: "Select channel",
  model: "Model",
  selectModel: "Select model",
  temperature: "Temperature",
  reasoningEffort: "Reasoning effort",
  reasoningDefault: "Default",
  reasoningMinimal: "Minimal",
  reasoningLow: "Low",
  reasoningMedium: "Medium",
  reasoningHigh: "High",
  maxTokens: "Max tokens",
  enabled: "Enabled",
  disabled: "Disabled",
  nextRun: "Next run",
  run: "Run",
  running: "Running",
  runStarted: "Task started",
  runFailed: "Failed to run task",
  save: "Save",
  saving: "Saving...",
  saved: "Scheduled task saved",
  saveFailed: "Failed to save scheduled task",
  deleted: "Scheduled task deleted",
  deleteFailed: "Failed to delete scheduled task",
  deleteConfirm: 'Delete scheduled task "{name}"?',
  nameRequired: "Task name is required",
  messageRequired: "Message is required",
  modelRequired: "Model is required",
  disabledByAdmin: "Scheduled tasks are disabled by the administrator",
  cancel: "Cancel",
  status_idle: "Idle",
  status_queued: "Queued",
  status_running: "Running",
  status_completed: "Completed",
  status_failed: "Failed",
}

const jaCopy: typeof zhCopy = {
  ...enCopy,
  title: "スケジュールタスク",
  subtitle: "高度なチャットタスクを手動、単発、間隔で実行し、結果を配信できます。",
  list: "タスク一覧",
  empty: "スケジュールタスクはありません",
  create: "タスクを作成",
  edit: "タスクを編集",
  delete: "タスクを削除",
  defaultName: "新しいタスク",
  cancel: "キャンセル",
}
