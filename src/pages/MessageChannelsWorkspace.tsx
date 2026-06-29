import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Copy, MessageSquare, Plus, Save, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface IDName {
  id: number
  name: string
}

interface Device {
  id: string
  name: string
  online: boolean
}

interface GroupConfig {
  external_id: string
  name: string
  enabled: boolean
  device_id: string
  user_channel_id?: number | null
  model: string
  agent_id?: number | null
  skill_ids: number[]
  context_message_count: number
  reply_mode: string
  trigger_mode: string
  system_prompt_override: string
}

interface AdvancedOptions {
  temperature?: number | null
  max_tokens: number
  reply_prefix: string
  reply_suffix: string
  language: string
  timezone: string
  mention_policy: string
  attachment_mode: string
  thread_mode: string
  deduplication_window_seconds: number
  response_timeout_seconds: number
  error_fallback: string
  custom_provider_config_json: string
}

interface MessageChannel {
  id: number
  name: string
  provider: ChannelProvider | string
  enabled: boolean
  bot_token_configured: boolean
  bot_token_preview?: string
  webhook_path: string
  default_device_id: string
  default_user_channel_id?: number | null
  default_model: string
  default_agent_id?: number | null
  default_skill_ids: number[]
  default_context_message_count: number
  reply_mode: string
  trigger_mode: string
  system_prompt: string
  group_configs: GroupConfig[]
  advanced_options: AdvancedOptions
  last_event_at?: string
  created_at?: string
  updated_at?: string
}

interface MessageRecord {
  id: number
  direction: string
  status: string
  external_chat_id: string
  content: string
  error?: string
  created_at?: string
}

interface Draft {
  id?: number
  name: string
  provider: ChannelProvider
  bot_token: string
  enabled: boolean
  default_device_id: string
  default_user_channel_id: string
  default_model: string
  default_agent_id: string
  default_skill_ids: number[]
  default_context_message_count: string
  reply_mode: string
  trigger_mode: string
  system_prompt: string
  group_configs: GroupConfig[]
  advanced_options: AdvancedOptions
}

const channelQueryKey = ["message-channels"] as const
type ChannelProvider = "telegram" | "discord" | "qq" | "onebot"
const providerOptions: Array<{ value: ChannelProvider; label: string }> = [
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "qq", label: "QQ 官方机器人" },
  { value: "onebot", label: "OneBot" },
]
const emptyAdvancedOptions: AdvancedOptions = {
  temperature: null,
  max_tokens: 0,
  reply_prefix: "",
  reply_suffix: "",
  language: "",
  timezone: "",
  mention_policy: "default",
  attachment_mode: "ignore",
  thread_mode: "channel",
  deduplication_window_seconds: 60,
  response_timeout_seconds: 120,
  error_fallback: "",
  custom_provider_config_json: "",
}

const emptyDraft: Draft = {
  name: "",
  provider: "telegram",
  bot_token: "",
  enabled: true,
  default_device_id: "",
  default_user_channel_id: "",
  default_model: "",
  default_agent_id: "",
  default_skill_ids: [],
  default_context_message_count: "12",
  reply_mode: "mention",
  trigger_mode: "mention",
  system_prompt: "",
  group_configs: [],
  advanced_options: emptyAdvancedOptions,
}

export default function MessageChannelsWorkspace() {
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const { data: settings } = useQuery<{ enabled: boolean }>({
    queryKey: ["message-channel-settings"],
    queryFn: async () => {
      const res = await api.get("/user/message-channels/settings")
      return { enabled: res.data?.enabled === true }
    },
  })

  if (settings && !settings.enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.disabled}</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Routes>
      <Route index element={<ChannelList copy={copy} />} />
      <Route path="new" element={<ChannelDetail copy={copy} mode="create" />} />
      <Route path=":id" element={<ChannelDetail copy={copy} mode="edit" />} />
      <Route path="*" element={<Navigate to="/chat/channels" replace />} />
    </Routes>
  )
}

function ChannelList({ copy }: { copy: CopyText }) {
  const { data: channels = [] } = useChannels()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <Button asChild className="gap-2">
          <Link to="/chat/channels/new">
            <Plus size={16} />
            {copy.newChannel}
          </Link>
        </Button>
      </div>

      <div className="grid gap-3">
        {channels.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">{copy.empty}</CardContent>
          </Card>
        ) : (
          channels.map((channel) => (
            <Link key={channel.id} to={`/chat/channels/${channel.id}`} className="block rounded-md border p-4 transition-colors hover:bg-muted/50">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquare size={16} className="shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-semibold">{channel.name}</span>
                    <Badge>{channel.provider}</Badge>
                    <Badge muted>{channel.enabled ? copy.enabled : copy.disabledState}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{copy.model}: {channel.default_model || "-"}</span>
                    <span>{copy.contextCount}: {channel.default_context_message_count || 0}</span>
                    <span>{copy.groups}: {channel.group_configs.length}</span>
                    <span>{copy.lastEvent}: {formatDateTime(channel.last_event_at) || "-"}</span>
                  </div>
                </div>
                <div className="text-sm font-medium text-primary">{copy.details}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function ChannelDetail({ copy, mode }: { copy: CopyText; mode: "create" | "edit" }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error } = useToast()
  const { id = "" } = useParams()
  const numericID = Number(id)
  const [activeTab, setActiveTab] = useState("basic")
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft, name: copy.defaultName, advanced_options: { ...emptyAdvancedOptions } }))

  const { data: channels = [] } = useChannels()
  const current = mode === "edit" ? channels.find((channel) => channel.id === numericID) : undefined
  const lookups = useLookups()
  const modelOptions = useMemo(() => uniqueModels(lookups.catalog), [lookups.catalog])
  const selectedUserChannel = lookups.catalog.find((item) => String(item.id) === draft.default_user_channel_id)
  const defaultModelOptions = selectedUserChannel?.models.length ? selectedUserChannel.models : modelOptions

  useEffect(() => {
    if (mode === "create") {
      setDraft({ ...emptyDraft, name: copy.defaultName, advanced_options: { ...emptyAdvancedOptions } })
      return
    }
    if (current) {
      setDraft(channelToDraft(current))
    }
  }, [copy.defaultName, current, mode])

  const saveChannel = useMutation({
    mutationFn: async () => {
      const payload = draftToPayload(draft)
      const res = draft.id
        ? await api.put(`/user/message-channels/${draft.id}`, payload)
        : await api.post("/user/message-channels", payload)
      return normalizeChannel(res.data)
    },
    onSuccess: (saved) => {
      success(copy.saved)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
      if (saved) {
        navigate(`/chat/channels/${saved.id}`, { replace: mode === "create" })
      }
    },
    onError: (err) => error(apiErrorMessage(err, copy.saveFailed)),
  })

  const deleteChannel = useMutation({
    mutationFn: async (channelID: number) => api.delete(`/user/message-channels/${channelID}`),
    onSuccess: () => {
      success(copy.deleted)
      queryClient.invalidateQueries({ queryKey: channelQueryKey })
      navigate("/chat/channels", { replace: true })
    },
    onError: (err) => error(apiErrorMessage(err, copy.deleteFailed)),
  })

  const updateDraft = (patch: Partial<Draft>) => setDraft((currentDraft) => ({ ...currentDraft, ...patch }))
  const updateAdvanced = (patch: Partial<AdvancedOptions>) => setDraft((currentDraft) => ({ ...currentDraft, advanced_options: { ...currentDraft.advanced_options, ...patch } }))

  if (mode === "edit" && channels.length > 0 && !current) {
    return <Navigate to="/chat/channels" replace />
  }

  const tabs = [
    { id: "basic", label: copy.tabBasic },
    { id: "routing", label: copy.tabRouting },
    { id: "groups", label: copy.tabGroups },
    { id: "advanced", label: copy.tabAdvanced },
    ...(draft.id ? [{ id: "messages", label: copy.tabMessages }] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" className="-ml-3 gap-2">
            <Link to="/chat/channels">
              <ArrowLeft size={16} />
              {copy.back}
            </Link>
          </Button>
          <h1 className="mt-2 text-3xl font-bold">{draft.id ? draft.name : copy.newChannel}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft.id && (
            <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" disabled={deleteChannel.isPending} onClick={() => deleteChannel.mutate(draft.id!)}>
              <Trash2 size={16} />
              {copy.delete}
            </Button>
          )}
          <Button className="gap-2" disabled={saveChannel.isPending} onClick={() => saveChannel.mutate()}>
            <Save size={16} />
            {saveChannel.isPending ? copy.saving : copy.save}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn("border-b-2 px-3 py-2 text-sm font-medium transition-colors", activeTab === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "basic" && (
        <BasicTab copy={copy} draft={draft} current={current} onDraftChange={updateDraft} onAdvancedChange={updateAdvanced} />
      )}
      {activeTab === "routing" && (
        <RoutingTab copy={copy} draft={draft} lookups={lookups} modelOptions={modelOptions} defaultModelOptions={defaultModelOptions} onDraftChange={updateDraft} />
      )}
      {activeTab === "groups" && (
        <GroupsTab copy={copy} draft={draft} lookups={lookups} modelOptions={modelOptions} onDraftChange={updateDraft} />
      )}
      {activeTab === "advanced" && (
        <AdvancedTab copy={copy} draft={draft} onAdvancedChange={updateAdvanced} />
      )}
      {activeTab === "messages" && draft.id && (
        <MessagesTab copy={copy} channelID={draft.id} />
      )}
    </div>
  )
}

function BasicTab({
  copy,
  draft,
  current,
  onDraftChange,
  onAdvancedChange,
}: {
  copy: CopyText
  draft: Draft
  current?: MessageChannel
  onDraftChange: (patch: Partial<Draft>) => void
  onAdvancedChange: (patch: Partial<AdvancedOptions>) => void
}) {
  const { success } = useToast()
  const copyWebhook = async () => {
    if (!current?.webhook_path) {
      return
    }
    await navigator.clipboard.writeText(`${window.location.origin}${current.webhook_path}`)
    success(copy.copied)
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabBasic}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={copy.name}>
            <Input value={draft.name} onChange={(event) => onDraftChange({ name: event.target.value })} />
          </Field>
          <SelectField
            label={copy.provider}
            value={draft.provider}
            onChange={(provider) => onDraftChange({ provider: provider as Draft["provider"], bot_token: providerUsesBotToken(provider) ? draft.bot_token : "" })}
          >
            {providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </SelectField>
          <Field label={copy.status}>
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => onDraftChange({ enabled: event.target.checked })} />
              {draft.enabled ? copy.enabled : copy.disabledState}
            </label>
          </Field>
        </div>
        {current?.webhook_path && (
          <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm md:grid-cols-[120px_minmax(0,1fr)_auto] md:items-center">
            <div className="font-medium">{copy.webhook}</div>
            <div className="min-w-0 break-all rounded bg-background p-2 font-mono text-xs">{`${window.location.origin}${current.webhook_path}`}</div>
            <Button variant="outline" size="sm" className="gap-2" onClick={copyWebhook}>
              <Copy size={15} />
              {copy.copy}
            </Button>
          </div>
        )}
        <ConnectionSettings copy={copy} draft={draft} current={current} onDraftChange={onDraftChange} onAdvancedChange={onAdvancedChange} />
      </CardContent>
    </Card>
  )
}

function ConnectionSettings({
  copy,
  draft,
  current,
  onDraftChange,
  onAdvancedChange,
}: {
  copy: CopyText
  draft: Draft
  current?: MessageChannel
  onDraftChange: (patch: Partial<Draft>) => void
  onAdvancedChange: (patch: Partial<AdvancedOptions>) => void
}) {
  const config = parseProviderConfig(draft.advanced_options.custom_provider_config_json)
  const updateConfig = (key: string, value: string) => {
    const next = { ...config }
    if (value.trim() === "") {
      delete next[key]
    } else {
      next[key] = value
    }
    onAdvancedChange({ custom_provider_config_json: stringifyProviderConfig(next) })
  }

  return (
    <div className="space-y-5 border-t pt-5">
      <div>
        <h2 className="text-sm font-semibold">{copy.tabConnection}</h2>
      </div>
        {draft.provider === "telegram" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.telegramBotToken}>
              <Input type="password" value={draft.bot_token} placeholder={current?.bot_token_preview || copy.botTokenPlaceholder} onChange={(event) => onDraftChange({ bot_token: event.target.value })} />
            </Field>
            <Field label={copy.telegramBaseURL}>
              <Input value={config.base_url || ""} placeholder="https://api.telegram.org" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
            <SelectField label={copy.telegramParseMode} value={config.parse_mode || ""} onChange={(value) => updateConfig("parse_mode", value)}>
              <option value="">{copy.inheritNone}</option>
              <option value="MarkdownV2">MarkdownV2</option>
              <option value="HTML">HTML</option>
              <option value="Markdown">Markdown</option>
            </SelectField>
          </div>
        )}

        {draft.provider === "discord" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.discordBotToken}>
              <Input type="password" value={draft.bot_token} placeholder={current?.bot_token_preview || copy.botTokenPlaceholder} onChange={(event) => onDraftChange({ bot_token: event.target.value })} />
            </Field>
            <Field label={copy.discordBaseURL}>
              <Input value={config.base_url || ""} placeholder="https://discord.com/api/v10" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
          </div>
        )}

        {draft.provider === "qq" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.qqBotID}>
              <Input value={config.bot_id || ""} placeholder="1020..." onChange={(event) => updateConfig("bot_id", event.target.value)} />
            </Field>
            <Field label={copy.qqBotSecret}>
              <Input type="password" value={config.bot_secret || ""} placeholder={copy.qqBotSecretPlaceholder} onChange={(event) => updateConfig("bot_secret", event.target.value)} />
            </Field>
            <Field label={copy.qqBaseURL}>
              <Input value={config.base_url || ""} placeholder="https://api.sgroup.qq.com" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
            <Field label={copy.qqMsgType}>
              <Input value={config.msg_type || ""} placeholder="0" onChange={(event) => updateConfig("msg_type", event.target.value)} />
            </Field>
          </div>
        )}

        {draft.provider === "onebot" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={copy.oneBotBaseURL}>
              <Input value={config.base_url || ""} placeholder="http://127.0.0.1:3000" onChange={(event) => updateConfig("base_url", event.target.value)} />
            </Field>
            <Field label={copy.oneBotAccessToken}>
              <Input type="password" value={config.access_token || ""} onChange={(event) => updateConfig("access_token", event.target.value)} />
            </Field>
            <Field label={copy.oneBotAction}>
              <Input value={config.send_action || ""} placeholder="send_group_msg / send_private_msg" onChange={(event) => updateConfig("send_action", event.target.value)} />
            </Field>
          </div>
        )}

        <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
          {copy.connectionHint}
        </div>
    </div>
  )
}

function RoutingTab({
  copy,
  draft,
  lookups,
  modelOptions,
  defaultModelOptions,
  onDraftChange,
}: {
  copy: CopyText
  draft: Draft
  lookups: LookupData
  modelOptions: string[]
  defaultModelOptions: string[]
  onDraftChange: (patch: Partial<Draft>) => void
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabRouting}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label={copy.device} value={draft.default_device_id} onChange={(value) => onDraftChange({ default_device_id: value })}>
            <option value="">{copy.inheritNone}</option>
            {lookups.devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.online ? "" : ` (${copy.offline})`}</option>)}
          </SelectField>
          <SelectField label={copy.userChannel} value={draft.default_user_channel_id} onChange={(value) => onDraftChange({ default_user_channel_id: value, default_model: "" })}>
            <option value="">{copy.inheritNone}</option>
            {lookups.catalog.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </SelectField>
          <SelectField label={copy.model} value={draft.default_model} onChange={(value) => onDraftChange({ default_model: value })}>
            <option value="">{copy.inheritNone}</option>
            {(defaultModelOptions.length ? defaultModelOptions : modelOptions).map((model) => <option key={model} value={model}>{model}</option>)}
          </SelectField>
          <SelectField label={copy.agent} value={draft.default_agent_id} onChange={(value) => onDraftChange({ default_agent_id: value })}>
            <option value="">{copy.inheritNone}</option>
            {lookups.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </SelectField>
          <SelectField label={copy.replyMode} value={draft.reply_mode} onChange={(value) => onDraftChange({ reply_mode: value })}>
            <option value="mention">{copy.modeMention}</option>
            <option value="always">{copy.modeAlways}</option>
            <option value="manual">{copy.modeManual}</option>
          </SelectField>
          <SelectField label={copy.triggerMode} value={draft.trigger_mode} onChange={(value) => onDraftChange({ trigger_mode: value })}>
            <option value="mention">{copy.modeMention}</option>
            <option value="direct">{copy.modeDirect}</option>
            <option value="command">{copy.modeCommand}</option>
            <option value="manual">{copy.modeManual}</option>
          </SelectField>
          <Field label={copy.contextCount}>
            <Input type="number" min={0} max={100} value={draft.default_context_message_count} onChange={(event) => onDraftChange({ default_context_message_count: event.target.value })} />
          </Field>
          <SkillPicker label={copy.skills} skills={lookups.skills} selected={draft.default_skill_ids} onChange={(ids) => onDraftChange({ default_skill_ids: ids })} />
        </div>
        <Field label={copy.systemPrompt}>
          <textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={draft.system_prompt} onChange={(event) => onDraftChange({ system_prompt: event.target.value })} />
        </Field>
      </CardContent>
    </Card>
  )
}

function GroupsTab({ copy, draft, lookups, modelOptions, onDraftChange }: { copy: CopyText; draft: Draft; lookups: LookupData; modelOptions: string[]; onDraftChange: (patch: Partial<Draft>) => void }) {
  const updateGroup = (index: number, patch: Partial<GroupConfig>) => {
    onDraftChange({ group_configs: draft.group_configs.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) })
  }
  const addGroup = () => {
    onDraftChange({
      group_configs: [...draft.group_configs, {
        external_id: "",
        name: "",
        enabled: true,
        device_id: "",
        user_channel_id: null,
        model: "",
        agent_id: null,
        skill_ids: [],
        context_message_count: Number(draft.default_context_message_count) || 12,
        reply_mode: "",
        trigger_mode: "",
        system_prompt_override: "",
      }],
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{copy.tabGroups}</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={addGroup}>
            <Plus size={15} />
            {copy.addGroup}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {draft.group_configs.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.noGroups}</div>
        ) : (
          <div className="space-y-3">
            {draft.group_configs.map((group, index) => (
              <div key={index} className="space-y-4 rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{group.name || group.external_id || `${copy.group} #${index + 1}`}</div>
                  <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDraftChange({ group_configs: draft.group_configs.filter((_, groupIndex) => groupIndex !== index) })} aria-label={copy.delete}>
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={copy.externalGroupID}><Input value={group.external_id} onChange={(event) => updateGroup(index, { external_id: event.target.value })} /></Field>
                  <Field label={copy.groupName}><Input value={group.name} onChange={(event) => updateGroup(index, { name: event.target.value })} /></Field>
                  <SelectField label={copy.device} value={group.device_id} onChange={(value) => updateGroup(index, { device_id: value })}>
                    <option value="">{copy.inheritDefault}</option>
                    {lookups.devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                  </SelectField>
                  <SelectField label={copy.userChannel} value={group.user_channel_id ? String(group.user_channel_id) : ""} onChange={(value) => updateGroup(index, { user_channel_id: value ? Number(value) : null })}>
                    <option value="">{copy.inheritDefault}</option>
                    {lookups.catalog.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
                  </SelectField>
                  <SelectField label={copy.model} value={group.model} onChange={(value) => updateGroup(index, { model: value })}>
                    <option value="">{copy.inheritDefault}</option>
                    {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                  </SelectField>
                  <SelectField label={copy.agent} value={group.agent_id ? String(group.agent_id) : ""} onChange={(value) => updateGroup(index, { agent_id: value ? Number(value) : null })}>
                    <option value="">{copy.inheritDefault}</option>
                    {lookups.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </SelectField>
                  <Field label={copy.contextCount}><Input type="number" min={0} max={100} value={group.context_message_count} onChange={(event) => updateGroup(index, { context_message_count: Number(event.target.value) || 0 })} /></Field>
                  <label className="flex h-10 items-center gap-2 self-end rounded-md border px-3 text-sm">
                    <input type="checkbox" checked={group.enabled} onChange={(event) => updateGroup(index, { enabled: event.target.checked })} />
                    {group.enabled ? copy.enabled : copy.disabledState}
                  </label>
                  <SkillPicker label={copy.skills} skills={lookups.skills} selected={group.skill_ids} onChange={(ids) => updateGroup(index, { skill_ids: ids })} />
                </div>
                <Field label={copy.systemPromptOverride}>
                  <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={group.system_prompt_override} onChange={(event) => updateGroup(index, { system_prompt_override: event.target.value })} />
                </Field>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AdvancedTab({ copy, draft, onAdvancedChange }: { copy: CopyText; draft: Draft; onAdvancedChange: (patch: Partial<AdvancedOptions>) => void }) {
  const options = draft.advanced_options
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabAdvanced}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={copy.temperature}><Input type="number" min={0} max={2} step={0.1} value={options.temperature ?? ""} onChange={(event) => onAdvancedChange({ temperature: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
          <Field label={copy.maxTokens}><Input type="number" min={0} value={options.max_tokens || ""} onChange={(event) => onAdvancedChange({ max_tokens: Number(event.target.value) || 0 })} /></Field>
          <Field label={copy.replyPrefix}><Input value={options.reply_prefix} onChange={(event) => onAdvancedChange({ reply_prefix: event.target.value })} /></Field>
          <Field label={copy.replySuffix}><Input value={options.reply_suffix} onChange={(event) => onAdvancedChange({ reply_suffix: event.target.value })} /></Field>
          <Field label={copy.language}><Input value={options.language} onChange={(event) => onAdvancedChange({ language: event.target.value })} /></Field>
          <Field label={copy.timezone}><Input value={options.timezone} onChange={(event) => onAdvancedChange({ timezone: event.target.value })} /></Field>
          <SelectField label={copy.mentionPolicy} value={options.mention_policy} onChange={(value) => onAdvancedChange({ mention_policy: value })}>
            <option value="default">{copy.defaultOption}</option>
            <option value="strip">{copy.stripMentions}</option>
            <option value="preserve">{copy.preserveMentions}</option>
          </SelectField>
          <SelectField label={copy.attachmentMode} value={options.attachment_mode} onChange={(value) => onAdvancedChange({ attachment_mode: value })}>
            <option value="ignore">{copy.ignoreAttachments}</option>
            <option value="text">{copy.textAttachments}</option>
            <option value="vision">{copy.visionAttachments}</option>
          </SelectField>
          <SelectField label={copy.threadMode} value={options.thread_mode} onChange={(value) => onAdvancedChange({ thread_mode: value })}>
            <option value="channel">{copy.threadChannel}</option>
            <option value="thread">{copy.threadNative}</option>
          </SelectField>
          <Field label={copy.dedupWindow}><Input type="number" min={0} value={options.deduplication_window_seconds || ""} onChange={(event) => onAdvancedChange({ deduplication_window_seconds: Number(event.target.value) || 0 })} /></Field>
          <Field label={copy.responseTimeout}><Input type="number" min={0} value={options.response_timeout_seconds || ""} onChange={(event) => onAdvancedChange({ response_timeout_seconds: Number(event.target.value) || 0 })} /></Field>
        </div>
        <Field label={copy.errorFallback}><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={options.error_fallback} onChange={(event) => onAdvancedChange({ error_fallback: event.target.value })} /></Field>
        <Field label={copy.providerJSON}><textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" value={options.custom_provider_config_json} onChange={(event) => onAdvancedChange({ custom_provider_config_json: event.target.value })} /></Field>
      </CardContent>
    </Card>
  )
}

function MessagesTab({ copy, channelID }: { copy: CopyText; channelID: number }) {
  const { data: messages = [] } = useQuery<MessageRecord[]>({
    queryKey: ["message-channel-messages", channelID],
    queryFn: async () => {
      const res = await api.get(`/user/message-channels/${channelID}/messages`)
      return Array.isArray(res.data) ? res.data.map(normalizeMessage).filter(Boolean) as MessageRecord[] : []
    },
  })
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{copy.tabMessages}</CardTitle></CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{copy.noMessages}</div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge>{message.direction}</Badge>
                  <Badge muted>{message.status}</Badge>
                  <span>{message.external_chat_id || "-"}</span>
                  <span>{formatDateTime(message.created_at) || "-"}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap">{message.content || "-"}</div>
                {message.error && <div className="mt-2 text-xs text-destructive">{message.error}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  )
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <Field label={label}>
      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </Field>
  )
}

function SkillPicker({ label, skills, selected, onChange }: { label: string; skills: IDName[]; selected: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div className="space-y-2 text-sm md:col-span-2">
      <div className="font-medium">{label}</div>
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
        {skills.length === 0 ? (
          <div className="text-sm text-muted-foreground">-</div>
        ) : skills.map((skill) => (
          <label key={skill.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(skill.id)} onChange={(event) => onChange(event.target.checked ? [...selected, skill.id] : selected.filter((id) => id !== skill.id))} />
            <span className="truncate">{skill.name}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function Badge({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs", muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>{children}</span>
}

interface LookupData {
  catalog: UserChannelCatalog[]
  agents: IDName[]
  skills: IDName[]
  devices: Device[]
}

function useChannels() {
  return useQuery<MessageChannel[]>({
    queryKey: channelQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/message-channels")
      return Array.isArray(res.data) ? res.data.map(normalizeChannel).filter(Boolean) as MessageChannel[] : []
    },
  })
}

function useLookups(): LookupData {
  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })
  const { data: agents = [] } = useQuery<IDName[]>({
    queryKey: ["advanced-chat-agents"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data) ? res.data.map(normalizeIDName).filter(Boolean) as IDName[] : []
    },
  })
  const { data: skills = [] } = useQuery<IDName[]>({
    queryKey: ["advanced-chat-skills"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data) ? res.data.map(normalizeIDName).filter(Boolean) as IDName[] : []
    },
  })
  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["advanced-chat-connector-devices"],
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      return Array.isArray(res.data) ? res.data.map(normalizeDevice).filter(Boolean) as Device[] : []
    },
  })
  return { catalog, agents, skills, devices }
}

function draftToPayload(draft: Draft) {
  return {
    name: draft.name.trim(),
    provider: draft.provider,
    bot_token: providerUsesBotToken(draft.provider) ? draft.bot_token.trim() || undefined : undefined,
    enabled: draft.enabled,
    default_device_id: draft.default_device_id,
    default_user_channel_id: draft.default_user_channel_id ? Number(draft.default_user_channel_id) : null,
    default_model: draft.default_model,
    default_agent_id: draft.default_agent_id ? Number(draft.default_agent_id) : null,
    default_skill_ids: draft.default_skill_ids,
    default_context_message_count: Number(draft.default_context_message_count) || 0,
    reply_mode: draft.reply_mode,
    trigger_mode: draft.trigger_mode,
    system_prompt: draft.system_prompt,
    group_configs: draft.group_configs,
    advanced_options: draft.advanced_options,
  }
}

function providerUsesBotToken(provider: string) {
  return provider === "telegram" || provider === "discord"
}

function channelToDraft(channel: MessageChannel): Draft {
  return {
    id: channel.id,
    name: channel.name,
    provider: normalizeProviderValue(channel.provider),
    bot_token: "",
    enabled: channel.enabled,
    default_device_id: channel.default_device_id || "",
    default_user_channel_id: channel.default_user_channel_id ? String(channel.default_user_channel_id) : "",
    default_model: channel.default_model || "",
    default_agent_id: channel.default_agent_id ? String(channel.default_agent_id) : "",
    default_skill_ids: channel.default_skill_ids || [],
    default_context_message_count: String(channel.default_context_message_count || 12),
    reply_mode: channel.reply_mode || "mention",
    trigger_mode: channel.trigger_mode || "mention",
    system_prompt: channel.system_prompt || "",
    group_configs: channel.group_configs || [],
    advanced_options: { ...emptyAdvancedOptions, ...(channel.advanced_options || {}) },
  }
}

function normalizeChannel(value: unknown): MessageChannel | null {
  if (!isRecord(value) || !Number(value.id)) return null
  return {
    id: Number(value.id),
    name: stringValue(value.name),
    provider: stringValue(value.provider) || "telegram",
    enabled: value.enabled !== false,
    bot_token_configured: value.bot_token_configured === true,
    bot_token_preview: stringValue(value.bot_token_preview),
    webhook_path: stringValue(value.webhook_path),
    default_device_id: stringValue(value.default_device_id),
    default_user_channel_id: nullableNumber(value.default_user_channel_id),
    default_model: stringValue(value.default_model),
    default_agent_id: nullableNumber(value.default_agent_id),
    default_skill_ids: numberArray(value.default_skill_ids),
    default_context_message_count: Number(value.default_context_message_count || 12),
    reply_mode: stringValue(value.reply_mode) || "mention",
    trigger_mode: stringValue(value.trigger_mode) || "mention",
    system_prompt: stringValue(value.system_prompt),
    group_configs: Array.isArray(value.group_configs) ? value.group_configs.map(normalizeGroup).filter(Boolean) as GroupConfig[] : [],
    advanced_options: normalizeAdvancedOptions(value.advanced_options),
    last_event_at: stringValue(value.last_event_at),
    created_at: stringValue(value.created_at),
    updated_at: stringValue(value.updated_at),
  }
}

function normalizeProviderValue(value: unknown): ChannelProvider {
  switch (stringValue(value).toLowerCase()) {
    case "discord":
      return "discord"
    case "qq":
    case "qq-official":
    case "qq_official":
      return "qq"
    case "onebot":
    case "one-bot":
    case "one_bot":
      return "onebot"
    default:
      return "telegram"
  }
}

function normalizeAdvancedOptions(value: unknown): AdvancedOptions {
  const item = isRecord(value) ? value : {}
  return {
    ...emptyAdvancedOptions,
    temperature: item.temperature === null || item.temperature === undefined ? null : Number(item.temperature),
    max_tokens: Number(item.max_tokens || 0),
    reply_prefix: stringValue(item.reply_prefix),
    reply_suffix: stringValue(item.reply_suffix),
    language: stringValue(item.language),
    timezone: stringValue(item.timezone),
    mention_policy: stringValue(item.mention_policy) || "default",
    attachment_mode: stringValue(item.attachment_mode) || "ignore",
    thread_mode: stringValue(item.thread_mode) || "channel",
    deduplication_window_seconds: Number(item.deduplication_window_seconds || 0),
    response_timeout_seconds: Number(item.response_timeout_seconds || 0),
    error_fallback: stringValue(item.error_fallback),
    custom_provider_config_json: stringValue(item.custom_provider_config_json),
  }
}

function normalizeGroup(value: unknown): GroupConfig | null {
  if (!isRecord(value)) return null
  return {
    external_id: stringValue(value.external_id),
    name: stringValue(value.name),
    enabled: value.enabled !== false,
    device_id: stringValue(value.device_id),
    user_channel_id: nullableNumber(value.user_channel_id),
    model: stringValue(value.model),
    agent_id: nullableNumber(value.agent_id),
    skill_ids: numberArray(value.skill_ids),
    context_message_count: Number(value.context_message_count || 0),
    reply_mode: stringValue(value.reply_mode),
    trigger_mode: stringValue(value.trigger_mode),
    system_prompt_override: stringValue(value.system_prompt_override),
  }
}

function normalizeCatalogItem(value: unknown): UserChannelCatalog {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: stringValue(item.name),
    models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === "string") : [],
  }
}

function normalizeIDName(value: unknown): IDName | null {
  if (!isRecord(value) || !Number(value.id)) return null
  return { id: Number(value.id), name: stringValue(value.name) }
}

function normalizeDevice(value: unknown): Device | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  return id ? { id, name: stringValue(value.name) || id, online: value.online === true } : null
}

function normalizeMessage(value: unknown): MessageRecord | null {
  if (!isRecord(value) || !Number(value.id)) return null
  return {
    id: Number(value.id),
    direction: stringValue(value.direction),
    status: stringValue(value.status),
    external_chat_id: stringValue(value.external_chat_id),
    content: stringValue(value.content),
    error: stringValue(value.error),
    created_at: stringValue(value.created_at),
  }
}

function uniqueModels(catalog: UserChannelCatalog[]) {
  return Array.from(new Set(catalog.flatMap((channel) => channel.models))).sort()
}

function nullableNumber(value: unknown) {
  const next = Number(value || 0)
  return Number.isFinite(next) && next > 0 ? next : null
}

function numberArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0) : []
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function formatDateTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function parseProviderConfig(raw: string): Record<string, string> {
  if (!raw.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return {}
    }
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]))
  } catch {
    return {}
  }
}

function stringifyProviderConfig(config: Record<string, string>) {
  const cleaned = Object.fromEntries(Object.entries(config).filter(([, value]) => value.trim() !== ""))
  return Object.keys(cleaned).length ? JSON.stringify(cleaned, null, 2) : ""
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data) && typeof err.response.data.error === "string") {
    return err.response.data.error
  }
  return err instanceof Error ? err.message : fallback
}

const zhCopy = {
  title: "消息通道",
  subtitle: "管理接入 AI 平台的 Telegram 和 Discord 机器人。",
  disabled: "管理员尚未启用消息通道。",
  empty: "暂无消息通道。",
  newChannel: "新建通道",
  details: "详情",
  back: "返回列表",
  defaultName: "Telegram 机器人",
  enabled: "启用",
  disabledState: "停用",
  groups: "群配置",
  lastEvent: "最近事件",
  tabBasic: "基础",
  tabConnection: "连接设置",
  tabRouting: "默认路由",
  tabGroups: "群配置",
  tabAdvanced: "高级",
  tabMessages: "消息",
  name: "名称",
  provider: "渠道",
  botToken: "Bot Token",
  telegramBotToken: "Telegram bot token",
  discordBotToken: "Discord bot token",
  botTokenPlaceholder: "输入机器人 token",
  status: "状态",
  webhook: "Webhook",
  copy: "复制",
  copied: "已复制",
  device: "设备开发环境",
  userChannel: "用户渠道",
  model: "模型",
  agent: "智能体",
  skills: "Skills",
  contextCount: "上下文消息数量",
  replyMode: "回复模式",
  triggerMode: "触发模式",
  modeMention: "被提及时",
  modeAlways: "总是回复",
  modeManual: "手动",
  modeDirect: "私聊/直接消息",
  modeCommand: "命令触发",
  systemPrompt: "系统提示词",
  addGroup: "添加群配置",
  noGroups: "暂无群级覆盖配置。",
  group: "群",
  groupName: "群名称",
  externalGroupID: "外部群/频道 ID",
  inheritNone: "不指定",
  inheritDefault: "继承默认",
  offline: "离线",
  systemPromptOverride: "群级提示词覆盖",
  temperature: "Temperature",
  maxTokens: "最大输出 tokens",
  replyPrefix: "回复前缀",
  replySuffix: "回复后缀",
  language: "语言",
  timezone: "时区",
  mentionPolicy: "提及处理",
  defaultOption: "默认",
  stripMentions: "移除提及",
  preserveMentions: "保留提及",
  attachmentMode: "附件处理",
  ignoreAttachments: "忽略",
  textAttachments: "按文本",
  visionAttachments: "视觉输入",
  threadMode: "会话模式",
  threadChannel: "按群/频道",
  threadNative: "按原生线程",
  dedupWindow: "去重窗口（秒）",
  responseTimeout: "回复超时（秒）",
  errorFallback: "错误兜底回复",
  providerJSON: "渠道扩展 JSON",
  telegramBaseURL: "Telegram Bot API 地址",
  telegramParseMode: "Telegram 解析模式",
  discordBaseURL: "Discord API 地址",
  qqBotID: "QQ 机器人 ID",
  qqBotSecret: "QQ 机器人 Secret",
  qqBotSecretPlaceholder: "输入 QQ 机器人 Secret",
  qqBaseURL: "QQ 官方 API 地址",
  qqMsgType: "QQ 消息类型",
  oneBotBaseURL: "OneBot HTTP 地址",
  oneBotAccessToken: "OneBot Access Token",
  oneBotAction: "OneBot 发送 action",
  connectionHint: "这些连接设置会自动保存到渠道扩展配置中，并由对应渠道发送消息时读取。",
  noMessages: "暂无消息记录。",
  save: "保存",
  saving: "保存中...",
  saved: "消息通道已保存",
  saveFailed: "保存消息通道失败",
  delete: "删除",
  deleted: "消息通道已删除",
  deleteFailed: "删除消息通道失败",
}

type CopyText = typeof zhCopy

const enCopy: CopyText = {
  title: "Message Channels",
  subtitle: "Manage Telegram and Discord bots connected to the AI platform.",
  disabled: "Message Channels have not been enabled by an administrator.",
  empty: "No message channels yet.",
  newChannel: "New Channel",
  details: "Details",
  back: "Back to list",
  defaultName: "Telegram bot",
  enabled: "Enabled",
  disabledState: "Disabled",
  groups: "Group configs",
  lastEvent: "Last event",
  tabBasic: "Basic",
  tabConnection: "Connection",
  tabRouting: "Default Routing",
  tabGroups: "Groups",
  tabAdvanced: "Advanced",
  tabMessages: "Messages",
  name: "Name",
  provider: "Provider",
  botToken: "Bot Token",
  telegramBotToken: "Telegram bot token",
  discordBotToken: "Discord bot token",
  botTokenPlaceholder: "Enter bot token",
  status: "Status",
  webhook: "Webhook",
  copy: "Copy",
  copied: "Copied",
  device: "Device environment",
  userChannel: "User channel",
  model: "Model",
  agent: "Agent",
  skills: "Skills",
  contextCount: "Context messages",
  replyMode: "Reply mode",
  triggerMode: "Trigger mode",
  modeMention: "On mention",
  modeAlways: "Always reply",
  modeManual: "Manual",
  modeDirect: "Direct messages",
  modeCommand: "Command",
  systemPrompt: "System prompt",
  addGroup: "Add group",
  noGroups: "No per-group overrides.",
  group: "Group",
  groupName: "Group name",
  externalGroupID: "External group/channel ID",
  inheritNone: "Not set",
  inheritDefault: "Use default",
  offline: "offline",
  systemPromptOverride: "Group prompt override",
  temperature: "Temperature",
  maxTokens: "Max output tokens",
  replyPrefix: "Reply prefix",
  replySuffix: "Reply suffix",
  language: "Language",
  timezone: "Timezone",
  mentionPolicy: "Mention policy",
  defaultOption: "Default",
  stripMentions: "Strip mentions",
  preserveMentions: "Preserve mentions",
  attachmentMode: "Attachment mode",
  ignoreAttachments: "Ignore",
  textAttachments: "Text",
  visionAttachments: "Vision",
  threadMode: "Thread mode",
  threadChannel: "By channel",
  threadNative: "Native thread",
  dedupWindow: "Dedup window (seconds)",
  responseTimeout: "Response timeout (seconds)",
  errorFallback: "Error fallback reply",
  providerJSON: "Provider extension JSON",
  telegramBaseURL: "Telegram Bot API URL",
  telegramParseMode: "Telegram parse mode",
  discordBaseURL: "Discord API URL",
  qqBotID: "QQ bot ID",
  qqBotSecret: "QQ bot secret",
  qqBotSecretPlaceholder: "Enter QQ bot secret",
  qqBaseURL: "QQ Official API URL",
  qqMsgType: "QQ message type",
  oneBotBaseURL: "OneBot HTTP URL",
  oneBotAccessToken: "OneBot access token",
  oneBotAction: "OneBot send action",
  connectionHint: "These connection settings are saved into the provider extension config and used by the selected provider when sending messages.",
  noMessages: "No messages yet.",
  save: "Save",
  saving: "Saving...",
  saved: "Message channel saved",
  saveFailed: "Failed to save message channel",
  delete: "Delete",
  deleted: "Message channel deleted",
  deleteFailed: "Failed to delete message channel",
}
