import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createPortal } from "react-dom"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Activity, ArrowDown, Bot, Check, FileText, Menu, MessageSquarePlus, Paperclip, Pencil, Plus, Send, Server, Settings, Sparkles, Trash2, User, X } from "lucide-react"
import api, { apiURL, getAuthToken, isDesktopTarget } from "@/lib/api"
import { useI18n, type TranslationKey } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

interface UserChannelCatalog {
  id: number
  name: string
  models: string[]
}

interface APIKey {
  id: number
  name: string
  api_key: string
  key_prefix: string
  allowed_models: string[]
  enabled: boolean
}

interface ChatToolCall {
  id: string
  round?: number
  name: string
  server?: string
  tool?: string
  status: string
  arguments?: Record<string, unknown>
  result?: string
}

interface ChatContentPart {
  round?: number
  content: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  content_parts?: ChatContentPart[]
  created_at: string
  updated_at?: string
  tool_calls?: ChatToolCall[]
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  run_mode: ChatRunMode
  latest_run?: ChatRun
  agent_id?: string
  agent_group_id?: string
  skill_ids: string[]
  mcp_server_ids: string[]
  connector_device_id?: string
  connector_workspace_path?: string
  connector_auto_approve: boolean
  connector_command_prefixes: string[]
  model_name?: string
  user_channel_id?: number
  max_tokens?: number
  temperature?: number | null
  reasoning_effort?: string
  created_at: string
  updated_at: string
}

interface ChatRun {
  id: string
  session_id: string
  assistant_message_id: string
  mode: ChatRunMode
  status: string
  status_message?: string
  current_round?: number
  error_message?: string
  tool_calls?: number
  tool_call_details?: ChatToolCall[]
  created_at?: string
  updated_at?: string
  started_at?: string
  finished_at?: string
}

interface AgentWorkMessage {
  role: "user" | "assistant" | "tool" | "system" | string
  content: string
  status?: string
  tool?: string
  created_at?: string
}

interface AgentWorkStatus {
  agent_id: string
  agent_name: string
  agent_type: string
  group_id: string
  group_name: string
  status: string
  working: boolean
  updated_at?: string
  messages: AgentWorkMessage[]
}

interface AgentWorkConnectorTask {
  id: string
  device_id: string
  device_name: string
  action: string
  status: string
  workspace_path: string
  workspace_unrestricted?: boolean
  payload: Record<string, unknown>
  result?: string
  error_message?: string
  created_at: string
  updated_at?: string
  started_at?: string
  finished_at?: string
}

interface AgentWorkResponse {
  run_id: string
  session_id: string
  group_id: string
  group_name: string
  agents: AgentWorkStatus[]
  connector_tasks: AgentWorkConnectorTask[]
}

interface ChatAgent {
  id: string
  name: string
  prompt: string
  default_model: string
  user_channel_id?: number
  stream: boolean
  created_at: string
  updated_at: string
}

interface ChatSkill {
  id: string
  name: string
  description: string
  prompt: string
  mcp_server_ids: string[]
  created_at: string
  updated_at: string
}

interface ChatAgentGroupAgent {
  id: string
  name: string
  type: "chief" | "worker" | "critic" | "reviewer" | string
}

interface ChatAgentGroup {
  id: string
  name: string
  agents: ChatAgentGroupAgent[]
}

interface AgentMentionState {
  open: boolean
  start: number
  query: string
  selected: number
}

interface MCPServer {
  id: string
  name: string
  url: string
  enabled: boolean
  request_mode: "backend" | "frontend" | string
}

interface ConnectorDevice {
  id: string
  name: string
  remark?: string
  hostname?: string
  os?: string
  arch?: string
  version?: string
  status: string
  online: boolean
  last_seen_at?: string
}

interface ConnectorApprovalTask {
  id: string
  device_id: string
  device_name: string
  run_id: string
  action: string
  workspace_path: string
  payload: Record<string, unknown>
  created_at: string
}

interface WorkspaceSkill {
  id: string
  name: string
  path: string
  content: string
  size: number
  truncated: boolean
}

interface AdvancedChatSettings {
  attachment_max_mb: number
  attachment_allowed_types: string[]
  file_storage_enabled: boolean
  file_storage_total_mb: number
  file_storage_used_bytes: number
  file_storage_auto_save_images_enabled: boolean
  file_storage_auto_save_videos_enabled: boolean
  mcp_servers: MCPServer[]
  builtin_mcp_servers: MCPServer[]
  custom_mcp_servers: MCPServer[]
  assistant_mode_enabled: boolean
  assistant_mcp_tools_enabled: boolean
  assistant_connector_list_files_enabled: boolean
  assistant_connector_read_file_enabled: boolean
  assistant_connector_write_file_enabled: boolean
  assistant_connector_replace_text_enabled: boolean
  assistant_connector_run_command_enabled: boolean
  assistant_connector_web_search_enabled: boolean
  assistant_connector_static_site_enabled: boolean
}

interface ChatAttachment {
  id: string
  storage_id?: string
  name: string
  type: string
  size: number
  text?: string
  binary?: boolean
  truncated?: boolean
}

interface ParsedMessageAttachment {
  name: string
  type: string
  sizeLabel: string
  storageID?: string
  body: string
  truncated: boolean
  binary: boolean
}

interface StoredFile {
  id: string
  name: string
  type: string
  size: number
  source: string
  text_available: boolean
  created_at: string
  updated_at: string
}

interface StoredFileListResponse {
  files: StoredFile[]
  used_bytes: number
  total_bytes: number
  remaining_bytes: number
}

interface StoredFileContent {
  id: string
  text: string
  binary: boolean
  truncated: boolean
}

type ChatEndpoint = "chat" | "responses" | "claude" | "gemini"
type ChatMode = "basic" | "advanced"
type ChatRunMode = "chat" | "assistant" | "agent_group"
type SessionConfigTab = "basic" | "advanced" | "agent" | "agent_group" | "skills" | "mcp" | "device"
type AttachmentTarget = "composer" | "editor"
type ComposerControlMenu = "" | "mode" | "device" | "workspace" | "agent_group"

interface ChatProps {
  variant?: ChatMode
}

interface ChatStoreKeys {
  sessions: string
  selectedSession: string
  model: string
  endpoint: string
  apiKey: string
  userChannel: string
}

interface ParsedSSEEvent {
  type: string
  payload: any
}

const sessionsStoreKey = "windypear.chat.sessions.v1"
const legacyMessagesStoreKey = "windypear.chat.messages.v1"
const selectedSessionStoreKey = "windypear.chat.selected_session.v1"
const modelStoreKey = "windypear.chat.model.v1"
const endpointStoreKey = "windypear.chat.endpoint.v1"
const apiKeyStoreKey = "windypear.chat.api_key_id.v1"
const selectedAgentStoreKey = "windypear.advanced_chat.selected_agent.v1"
const defaultAgentID = "default"
const agentsQueryKey = ["advanced-chat-agents"] as const
const skillsQueryKey = ["advanced-chat-skills"] as const
const advancedSessionsQueryKey = ["advanced-chat-sessions"] as const
const advancedFilesQueryKey = ["advanced-chat-files"] as const
const connectorDevicesQueryKey = ["advanced-chat-connector-devices"] as const
const connectorApprovalsQueryKey = (runID: string) => ["advanced-chat-connector-approvals", runID] as const
const agentWorkQueryKey = (runID: string) => ["advanced-chat-agent-work", runID] as const
const agentGroupsQueryKey = ["advanced-chat-agent-groups"] as const
const defaultAdvancedChatSettings: AdvancedChatSettings = {
  attachment_max_mb: 10,
  attachment_allowed_types: ["text/plain", "text/markdown", "application/json", "text/csv", "image/png", "image/jpeg", "application/pdf"],
  file_storage_enabled: true,
  file_storage_total_mb: 100,
  file_storage_used_bytes: 0,
  file_storage_auto_save_images_enabled: false,
  file_storage_auto_save_videos_enabled: false,
  mcp_servers: [],
  builtin_mcp_servers: [],
  custom_mcp_servers: [],
  assistant_mode_enabled: true,
  assistant_mcp_tools_enabled: true,
  assistant_connector_list_files_enabled: true,
  assistant_connector_read_file_enabled: true,
  assistant_connector_write_file_enabled: true,
  assistant_connector_replace_text_enabled: true,
  assistant_connector_run_command_enabled: true,
  assistant_connector_web_search_enabled: true,
  assistant_connector_static_site_enabled: true,
}

const chatStoreKeys: Record<ChatMode, ChatStoreKeys> = {
  basic: {
    sessions: sessionsStoreKey,
    selectedSession: selectedSessionStoreKey,
    model: modelStoreKey,
    endpoint: endpointStoreKey,
    apiKey: apiKeyStoreKey,
    userChannel: "windypear.chat.user_channel_id.v1",
  },
  advanced: {
    sessions: "windypear.advanced_chat.sessions.v1",
    selectedSession: "windypear.advanced_chat.selected_session.v1",
    model: "windypear.advanced_chat.model.v1",
    endpoint: "windypear.advanced_chat.endpoint.v1",
    apiKey: "windypear.advanced_chat.api_key_id.v1",
    userChannel: "windypear.advanced_chat.user_channel_id.v1",
  },
}

export default function Chat({ variant = "basic" }: ChatProps) {
  const isAdvanced = variant === "advanced"
  const isDesktop = isDesktopTarget()
  const storeKeys = chatStoreKeys[variant]
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const routeSessionID = isAdvanced ? sessionIDFromAdvancedChatPath(location.pathname) : ""
  const requestedAgentID = isAdvanced ? new URLSearchParams(location.search).get("agent_id") || "" : ""
  const { language, t } = useI18n()
  const copy = useMemo(() => buildChatCopy(t), [t])
  const fileCopy = useMemo(() => (language === "zh" ? zhFileAttachmentCopy : enFileAttachmentCopy), [language])
  const agentGroupCopy = useMemo(() => (language === "zh" ? zhAgentGroupCopy : enAgentGroupCopy), [language])
  const { error } = useToast()
  const [sessions, setSessions] = useState<ChatSession[]>(() => (variant === "advanced" ? [] : readStoredSessions(storeKeys.sessions, true)))
  const [draftSession, setDraftSession] = useState<ChatSession>(() => createSession())
  const [storedActiveSessionID, setStoredActiveSessionID] = useState(() => localStorage.getItem(storeKeys.selectedSession) || "")
  const activeSessionID = isAdvanced ? routeSessionID : storedActiveSessionID
  const setActiveSessionID = (sessionID: string) => {
    if (!isAdvanced) {
      setStoredActiveSessionID(sessionID)
    }
  }
  const [modelName, setModelName] = useState(() => localStorage.getItem(storeKeys.model) || "")
  const [endpointMode, setEndpointMode] = useState<ChatEndpoint>(() => readStoredEndpoint(storeKeys.endpoint))
  const [selectedAPIKeyID, setSelectedAPIKeyID] = useState(() => Number(localStorage.getItem(storeKeys.apiKey) || 0))
  const [selectedUserChannelID, setSelectedUserChannelID] = useState(() => Number(localStorage.getItem(storeKeys.userChannel) || 0))
  const [selectedAgentID, setSelectedAgentID] = useState(() => (isAdvanced ? localStorage.getItem(selectedAgentStoreKey) || "" : ""))
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isAgentWorkOpen, setIsAgentWorkOpen] = useState(false)
  const [selectedWorkAgentID, setSelectedWorkAgentID] = useState("")
  const [isSessionsSidebarOpen, setIsSessionsSidebarOpen] = useState(false)
  const [configTab, setConfigTab] = useState<SessionConfigTab>("basic")
  const [pendingAgentID, setPendingAgentID] = useState("")
  const [pendingSkillID, setPendingSkillID] = useState("")
  const [pendingMCPServerID, setPendingMCPServerID] = useState("")
  const [pendingConnectorDeviceID, setPendingConnectorDeviceID] = useState("")
  const [pendingConnectorWorkspace, setPendingConnectorWorkspace] = useState("")
  const [pendingConnectorAutoApprove, setPendingConnectorAutoApprove] = useState(false)
  const [pendingConnectorCommandPrefixes, setPendingConnectorCommandPrefixes] = useState("")
  const [workspaceSkills, setWorkspaceSkills] = useState<WorkspaceSkill[]>([])
  const [isRefreshingWorkspaceSkills, setIsRefreshingWorkspaceSkills] = useState(false)
  const [decidingConnectorTaskID, setDecidingConnectorTaskID] = useState("")
  const [prompt, setPrompt] = useState("")
  const [agentMention, setAgentMention] = useState<AgentMentionState>({ open: false, start: 0, query: "", selected: 0 })
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const [selectingFileID, setSelectingFileID] = useState("")
  const [attachmentMenuTarget, setAttachmentMenuTarget] = useState<AttachmentTarget | "">("")
  const [composerControlMenu, setComposerControlMenu] = useState<ComposerControlMenu>("")
  const [sessionMenu, setSessionMenu] = useState<{ sessionID: string; x: number; y: number } | null>(null)
  const [regeneratingTitleSessionID, setRegeneratingTitleSessionID] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isStreamActive, setIsStreamActive] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [editingMessageID, setEditingMessageID] = useState("")
  const [editingText, setEditingText] = useState("")
  const [editingAttachments, setEditingAttachments] = useState<ChatAttachment[]>([])
  const [filePickerTarget, setFilePickerTarget] = useState<AttachmentTarget>("composer")

  const { data: catalog = [] } = useQuery<UserChannelCatalog[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await api.get("/user/catalog")
      return Array.isArray(res.data) ? res.data.map(normalizeCatalogItem) : []
    },
  })

  const { data: apiKeys = [] } = useQuery<APIKey[]>({
    queryKey: ["api-keys", "chat"],
    enabled: !isAdvanced,
    queryFn: async () => {
      const res = await api.get("/user/api-keys")
      return Array.isArray(res.data) ? res.data.map(normalizeAPIKey) : []
    },
  })

  const { data: agents = [], isFetched: agentsFetched } = useQuery<ChatAgent[]>({
    queryKey: agentsQueryKey,
    enabled: isAdvanced,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agents")
      return Array.isArray(res.data)
        ? res.data.map(normalizeAgent).filter((agent): agent is ChatAgent => Boolean(agent))
        : []
    },
  })

  const { data: skills = [] } = useQuery<ChatSkill[]>({
    queryKey: skillsQueryKey,
    enabled: isAdvanced,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skills")
      return Array.isArray(res.data)
        ? res.data.map(normalizeSkill).filter((skill): skill is ChatSkill => Boolean(skill))
        : []
    },
  })

  const { data: advancedSettings } = useQuery<AdvancedChatSettings>({
    queryKey: ["advanced-chat-user-settings"],
    enabled: isAdvanced,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/settings")
      return normalizeAdvancedChatSettings(res.data)
    },
  })

  const {
    data: serverSessions = [],
    isFetched: serverSessionsFetched,
    refetch: refetchAdvancedSessions,
  } = useQuery<ChatSession[]>({
    queryKey: advancedSessionsQueryKey,
    enabled: isAdvanced,
    refetchInterval: 2500,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/sessions")
      return Array.isArray(res.data) ? res.data.map(normalizeSession).filter((session): session is ChatSession => Boolean(session)) : []
    },
  })

  const { data: connectorDevices = [] } = useQuery<ConnectorDevice[]>({
    queryKey: connectorDevicesQueryKey,
    enabled: isAdvanced,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/devices")
      return Array.isArray(res.data) ? res.data.map(normalizeConnectorDevice).filter((device): device is ConnectorDevice => Boolean(device)) : []
    },
  })

  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])
  const selectableAPIKeys = useMemo(() => apiKeys.filter((key) => key.enabled && key.api_key), [apiKeys])
  const selectedAPIKey = useMemo(
    () => selectableAPIKeys.find((key) => key.id === selectedAPIKeyID) || selectableAPIKeys[0],
    [selectableAPIKeys, selectedAPIKeyID]
  )
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionID),
    [sessions, activeSessionID]
  )
  const currentSession = activeSession || (isAdvanced && routeSessionID ? undefined : draftSession)
  const latestMessage = currentSession?.messages[currentSession.messages.length - 1]
  const latestMessageSignal = useMemo(
    () => [
      currentSession?.id || "",
      currentSession?.messages.length || 0,
      latestMessage?.id || "",
      latestMessage?.content || "",
      JSON.stringify(latestMessage?.tool_calls || []),
    ].join("|"),
    [currentSession?.id, currentSession?.messages.length, latestMessage?.id, latestMessage?.content, latestMessage?.tool_calls]
  )
  const currentAdvancedSettings = useMemo<AdvancedChatSettings>(
    () => ({ ...defaultAdvancedChatSettings, ...(advancedSettings ?? {}) }),
    [advancedSettings]
  )
  const { data: storedFilesResponse } = useQuery<StoredFileListResponse | StoredFile[]>({
    queryKey: advancedFilesQueryKey,
    enabled: isAdvanced && currentAdvancedSettings.file_storage_enabled,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/files")
      return normalizeStoredFilesResponse(res.data)
    },
  })
  const storedFiles = Array.isArray(storedFilesResponse) ? storedFilesResponse : storedFilesResponse?.files || []
  const assistantModeEnabled = !isAdvanced || currentAdvancedSettings.assistant_mode_enabled
  const assistantConnectorToolsEnabled =
    currentAdvancedSettings.assistant_connector_list_files_enabled ||
    currentAdvancedSettings.assistant_connector_read_file_enabled ||
    currentAdvancedSettings.assistant_connector_write_file_enabled ||
    currentAdvancedSettings.assistant_connector_replace_text_enabled ||
    currentAdvancedSettings.assistant_connector_run_command_enabled ||
    currentAdvancedSettings.assistant_connector_web_search_enabled ||
    currentAdvancedSettings.assistant_connector_static_site_enabled
  const selectedAgent = useMemo(() => {
    if (!isAdvanced) {
      return undefined
    }
    const agentID = currentSession?.agent_id || defaultAgentID
    return agents.find((agent) => agent.id === agentID)
  }, [currentSession?.agent_id, agents, isAdvanced])
  const activeRunMode: ChatRunMode = isAdvanced && assistantModeEnabled ? currentSession?.run_mode || "chat" : "chat"
  const activeRun = isAdvanced ? currentSession?.latest_run : undefined
  const isActiveRunRunning = isRunActive(activeRun)
  const activeRunID = activeRun?.id || ""
  const showAgentWorkStatus = isAdvanced && activeRunMode === "agent_group"
  const { data: agentWork } = useQuery<AgentWorkResponse | undefined>({
    queryKey: agentWorkQueryKey(activeRunID),
    enabled: showAgentWorkStatus && Boolean(activeRunID) && (isAgentWorkOpen || isActiveRunRunning),
    refetchInterval: isActiveRunRunning ? 1000 : false,
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/runs/${encodeURIComponent(activeRunID)}/agent-work`)
      return normalizeAgentWorkResponse(res.data)
    },
  })
  const hasApprovalRequiredToolCall = useMemo(
    () => Boolean(currentSession?.messages.some((message) => message.tool_calls?.some((toolCall) => toolCall.status === "approval_required"))),
    [currentSession?.messages]
  )
  const {
    data: pendingConnectorApprovals = [],
    refetch: refetchConnectorApprovals,
  } = useQuery<ConnectorApprovalTask[]>({
    queryKey: connectorApprovalsQueryKey(activeRunID),
    enabled: isAdvanced && Boolean(activeRunID) && (isActiveRunRunning || hasApprovalRequiredToolCall),
    refetchInterval: 1000,
    queryFn: async () => {
      const res = await api.get(`/user/advanced-chat/runs/${encodeURIComponent(activeRunID)}/connector-tasks/pending`)
      return Array.isArray(res.data)
        ? res.data.map(normalizeConnectorApprovalTask).filter((task): task is ConnectorApprovalTask => Boolean(task))
        : []
    },
  })
  const activeModelName = isAdvanced ? currentSession?.model_name || selectedAgent?.default_model || modelName : modelName
  const channelModelOptions = useMemo(() => {
    const channelID = currentSession?.user_channel_id || selectedAgent?.user_channel_id || 0
    const channel = channelID ? catalog.find((item) => item.id === channelID) : undefined
    return channel ? channel.models : modelOptions
  }, [catalog, currentSession?.user_channel_id, modelOptions, selectedAgent?.user_channel_id])
  const modelSelectOptions = useMemo(
    () => activeModelName && !channelModelOptions.includes(activeModelName) ? [activeModelName, ...channelModelOptions] : channelModelOptions,
    [activeModelName, channelModelOptions]
  )
  const selectableUserChannels = useMemo(
    () => catalog.filter((channel) => !activeModelName || channel.models.includes(activeModelName)),
    [activeModelName, catalog]
  )
  const selectedUserChannel = useMemo(
    () => selectableUserChannels.find((channel) => channel.id === selectedUserChannelID) || selectableUserChannels[0],
    [selectableUserChannels, selectedUserChannelID]
  )
  const mcpServers = useMemo(() => {
    if (currentAdvancedSettings.mcp_servers.length > 0) {
      return currentAdvancedSettings.mcp_servers
    }
    return mergeMCPServers(currentAdvancedSettings.builtin_mcp_servers, currentAdvancedSettings.custom_mcp_servers)
  }, [currentAdvancedSettings])
  const enabledMCPServers = useMemo(
    () => currentAdvancedSettings.assistant_mcp_tools_enabled ? mcpServers.filter((server) => server.enabled) : [],
    [currentAdvancedSettings.assistant_mcp_tools_enabled, mcpServers]
  )
  const selectedSkills = useMemo(() => {
    const selectedIDs = currentSession?.skill_ids || []
    return skills.filter((skill) => selectedIDs.includes(skill.id))
  }, [currentSession?.skill_ids, skills])
  const availableSkillsToAdd = useMemo(() => {
    const selectedIDs = new Set(currentSession?.skill_ids || [])
    return skills.filter((skill) => !selectedIDs.has(skill.id))
  }, [currentSession?.skill_ids, skills])
  const skillMCPServerIDs = useMemo(() => uniqueStrings(selectedSkills.flatMap((skill) => skill.mcp_server_ids)), [selectedSkills])
  const sessionMCPServers = useMemo(() => {
    const selectedIDs = new Set(currentSession?.mcp_server_ids || [])
    return enabledMCPServers.filter((server) => selectedIDs.has(server.id))
  }, [currentSession?.mcp_server_ids, enabledMCPServers])
  const availableMCPServersToAdd = useMemo(() => {
    const selectedIDs = new Set(currentSession?.mcp_server_ids || [])
    const skillSelectedIDs = new Set(skillMCPServerIDs)
    return enabledMCPServers.filter((server) => !selectedIDs.has(server.id) && !skillSelectedIDs.has(server.id))
  }, [currentSession?.mcp_server_ids, enabledMCPServers, skillMCPServerIDs])
  const selectedConnectorDevice = useMemo(
    () => connectorDevices.find((device) => device.id === currentSession?.connector_device_id),
    [currentSession?.connector_device_id, connectorDevices]
  )
  const selectableConnectorDevices = assistantConnectorToolsEnabled ? connectorDevices : []
  const currentConnectorDeviceID = currentSession?.connector_device_id || ""
  const currentConnectorDevice = connectorDevices.find((device) => device.id === currentConnectorDeviceID)
  const { data: agentGroups = [], isFetching: isFetchingAgentGroups } = useQuery<ChatAgentGroup[]>({
    queryKey: agentGroupsQueryKey,
    enabled: isAdvanced,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/agent-groups")
      const rawGroups: unknown[] = Array.isArray(res.data?.groups) ? res.data.groups : Array.isArray(res.data) ? res.data : []
      return rawGroups.map(normalizeChatAgentGroup).filter((group): group is ChatAgentGroup => Boolean(group))
    },
  })
  const currentAgentGroup = useMemo(
    () => agentGroups.find((group) => group.id === currentSession?.agent_group_id),
    [agentGroups, currentSession?.agent_group_id]
  )
  const fallbackAgentWork = useMemo<AgentWorkResponse | undefined>(() => {
    if (!currentAgentGroup || activeRunMode !== "agent_group") {
      return undefined
    }
    return {
      run_id: activeRunID,
      session_id: currentSession?.id || "",
      group_id: currentAgentGroup.id,
      group_name: currentAgentGroup.name,
      agents: currentAgentGroup.agents.map((agent) => ({
        agent_id: agent.id,
        agent_name: agent.name,
        agent_type: agent.type || "worker",
        group_id: currentAgentGroup.id,
        group_name: currentAgentGroup.name,
        status: "idle",
        working: false,
        messages: [],
      })),
      connector_tasks: [],
    }
  }, [activeRunID, activeRunMode, currentAgentGroup, currentSession?.id])
  const agentMentionOptions = useMemo(() => {
    if (activeRunMode !== "agent_group" || !currentAgentGroup) {
      return []
    }
    const query = agentMention.query.trim().toLowerCase()
    const agents = currentAgentGroup.agents
    if (!query) {
      return agents
    }
    return agents.filter((agent) => {
      const id = agent.id.toLowerCase()
      const name = agent.name.toLowerCase()
      const type = agent.type.toLowerCase()
      return id.includes(query) || name.includes(query) || type.includes(query)
    })
  }, [activeRunMode, agentMention.query, currentAgentGroup])

  useEffect(() => {
    if (activeRunMode !== "agent_group" || !currentAgentGroup) {
      closeAgentMention()
    }
  }, [activeRunMode, currentAgentGroup?.id])

  useEffect(() => {
    if ((configTab === "device" && activeRunMode === "chat") || (configTab === "agent" && activeRunMode === "agent_group")) {
      setConfigTab("basic")
    }
  }, [activeRunMode, configTab])

  useEffect(() => {
    if (!sessionMenu) {
      return
    }
    const close = () => setSessionMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [sessionMenu])

  const recentWorkspacePaths = useMemo(() => {
    const deviceID = currentConnectorDeviceID
    if (!deviceID) {
      return []
    }
    return uniqueStrings(
      sessions
        .filter((session) => session.connector_device_id === deviceID && session.connector_workspace_path)
        .map((session) => session.connector_workspace_path || "")
    ).slice(0, 6)
  }, [currentConnectorDeviceID, sessions])

  useEffect(() => {
    if (isAdvanced) {
      return
    }
    localStorage.setItem(storeKeys.sessions, JSON.stringify(sessions))
  }, [isAdvanced, sessions, storeKeys.sessions])

  useEffect(() => {
    if (!isAdvanced || !serverSessionsFetched || serverSessions.length === 0) {
      return
    }
    setSessions((current) => mergeServerSessions(current, serverSessions, activeSessionID))
  }, [activeSessionID, isAdvanced, serverSessions, serverSessionsFetched])

  useEffect(() => {
    if (isAdvanced) {
      return
    }
    if (activeSessionID && !sessions.some((session) => session.id === activeSessionID) && sessions[0]) {
      setActiveSessionID(sessions[0].id)
      return
    }
    if (activeSessionID && sessions.length === 0) {
      setActiveSessionID("")
    }
  }, [activeSessionID, isAdvanced, sessions])

  useEffect(() => {
    if (isAdvanced) {
      return
    }
    if (activeSessionID) {
      localStorage.setItem(storeKeys.selectedSession, activeSessionID)
    } else {
      localStorage.removeItem(storeKeys.selectedSession)
    }
  }, [activeSessionID, isAdvanced, storeKeys.selectedSession])

  const messagesScrollElement = () => {
    const marker = messagesEndRef.current
    if (marker) {
      const main = marker.closest("main")
      if (main instanceof HTMLElement) {
        return main
      }
    }
    return (document.scrollingElement as HTMLElement | null) || document.documentElement
  }

  const messagesAtBottom = () => {
    const marker = messagesEndRef.current
    if (!marker) {
      return true
    }
    const container = messagesScrollElement()
    const markerBottom = marker.getBoundingClientRect().bottom
    const containerBottom = container === document.scrollingElement || container === document.documentElement
      ? window.innerHeight
      : container.getBoundingClientRect().bottom
    return markerBottom - containerBottom < 120
  }

  const scrollMessagesToLatest = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior })
    setShowJumpToLatest(false)
  }

  useEffect(() => {
    setShowJumpToLatest(false)
    requestAnimationFrame(() => scrollMessagesToLatest("auto"))
  }, [currentSession?.id])

  useEffect(() => {
    const container = messagesScrollElement()
    const target: HTMLElement | Window = container === document.scrollingElement || container === document.documentElement
      ? window
      : container
    const handleScroll = () => setShowJumpToLatest(!messagesAtBottom())
    target.addEventListener("scroll", handleScroll, { passive: true })
    requestAnimationFrame(handleScroll)
    return () => target.removeEventListener("scroll", handleScroll)
  }, [currentSession?.id])

  useEffect(() => {
    if (!showJumpToLatest) {
      requestAnimationFrame(() => scrollMessagesToLatest("smooth"))
    }
  }, [latestMessageSignal, showJumpToLatest])

  useEffect(() => {
    const textarea = composerTextareaRef.current
    if (!isAdvanced || !textarea || currentSession?.messages.length === 0) {
      return
    }
    textarea.style.height = "40px"
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 40), 160)}px`
  }, [prompt, currentSession?.id, currentSession?.messages.length, isAdvanced])

  useEffect(() => {
    if (modelName) {
      localStorage.setItem(storeKeys.model, modelName)
    }
  }, [modelName, storeKeys.model])

  useEffect(() => {
    localStorage.setItem(storeKeys.endpoint, endpointMode)
  }, [endpointMode, storeKeys.endpoint])

  useEffect(() => {
    if (!selectedAPIKey && selectedAPIKeyID !== 0) {
      setSelectedAPIKeyID(0)
      return
    }
    if (!selectedAPIKeyID && selectedAPIKey) {
      setSelectedAPIKeyID(selectedAPIKey.id)
    }
  }, [selectedAPIKey, selectedAPIKeyID])

  useEffect(() => {
    if (!isAdvanced) {
      return
    }
    if (!selectedUserChannel && selectedUserChannelID !== 0) {
      setSelectedUserChannelID(0)
      return
    }
    if (!selectedUserChannelID && selectedUserChannel) {
      setSelectedUserChannelID(selectedUserChannel.id)
    }
  }, [isAdvanced, selectedUserChannel, selectedUserChannelID])

  useEffect(() => {
    if (selectedAPIKeyID) {
      localStorage.setItem(storeKeys.apiKey, String(selectedAPIKeyID))
    }
  }, [selectedAPIKeyID, storeKeys.apiKey])

  useEffect(() => {
    if (isAdvanced && selectedUserChannelID) {
      localStorage.setItem(storeKeys.userChannel, String(selectedUserChannelID))
    }
  }, [isAdvanced, selectedUserChannelID, storeKeys.userChannel])

  useEffect(() => {
    if (!isAdvanced || !currentSession?.user_channel_id || currentSession.user_channel_id === selectedUserChannelID) {
      return
    }
    setSelectedUserChannelID(currentSession.user_channel_id)
  }, [currentSession?.id, currentSession?.user_channel_id, isAdvanced, selectedUserChannelID])

  useEffect(() => {
    if (!modelName && modelOptions.length > 0) {
      setModelName(modelOptions[0])
    }
  }, [modelName, modelOptions])

  useEffect(() => {
    if (!isAdvanced) {
      return
    }
    if (!agentsFetched) {
      return
    }
    if (selectedAgentID && agents.some((agent) => agent.id === selectedAgentID)) {
      localStorage.setItem(selectedAgentStoreKey, selectedAgentID)
      return
    }
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID) || agents[0]
    if (defaultAgent) {
      setSelectedAgentID(defaultAgent.id)
      localStorage.setItem(selectedAgentStoreKey, defaultAgent.id)
      return
    }
    setSelectedAgentID("")
    localStorage.removeItem(selectedAgentStoreKey)
  }, [agents, agentsFetched, isAdvanced, selectedAgentID])

  useEffect(() => {
    if (!isAdvanced || !agentsFetched || !currentSession || currentSession.agent_id) {
      return
    }
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID) || agents[0]
    if (!defaultAgent) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_id: defaultAgent.id,
      model_name: session.model_name || defaultAgent.default_model || modelName || modelOptions[0] || "",
    }))
  }, [agents, agentsFetched, currentSession?.agent_id, currentSession?.id, isAdvanced, modelName, modelOptions])

  useEffect(() => {
    if (!isAdvanced || !requestedAgentID || !agentsFetched) {
      return
    }
    const agent = agents.find((item) => item.id === requestedAgentID)
    if (!agent) {
      navigate("/chat", { replace: true })
      return
    }
    const session = createSession({
      agentID: agent.id,
      modelName: modelName || agent.default_model || modelOptions[0] || "",
    })
    setDraftSession(session)
    setActiveSessionID("")
    setSelectedAgentID(agent.id)
    setIsSessionsSidebarOpen(false)
    setPrompt("")
    setAttachments([])
    cancelEdit()
    navigate("/chat", { replace: true })
  }, [agents, agentsFetched, isAdvanced, modelName, modelOptions, navigate, requestedAgentID])

  useEffect(() => {
    if (!isAdvanced || !currentSession || currentSession.model_name || modelOptions.length === 0) {
      return
    }
    const defaultModel = selectedAgent?.default_model || modelName || modelOptions[0]
    updateSession(currentSession.id, (session) => ({ ...session, model_name: defaultModel }))
  }, [currentSession, isAdvanced, modelName, modelOptions, selectedAgent?.default_model])

  useEffect(() => {
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID) || agents[0]
    if (!pendingAgentID && defaultAgent) {
      setPendingAgentID(defaultAgent.id)
      return
    }
    if (pendingAgentID && !agents.some((agent) => agent.id === pendingAgentID)) {
      setPendingAgentID(defaultAgent?.id || "")
    }
  }, [agents, pendingAgentID])

  useEffect(() => {
    if (!pendingSkillID && availableSkillsToAdd[0]) {
      setPendingSkillID(availableSkillsToAdd[0].id)
      return
    }
    if (pendingSkillID && !availableSkillsToAdd.some((skill) => skill.id === pendingSkillID)) {
      setPendingSkillID(availableSkillsToAdd[0]?.id || "")
    }
  }, [availableSkillsToAdd, pendingSkillID])

  useEffect(() => {
    if (!pendingMCPServerID && availableMCPServersToAdd[0]) {
      setPendingMCPServerID(availableMCPServersToAdd[0].id)
      return
    }
    if (pendingMCPServerID && !availableMCPServersToAdd.some((server) => server.id === pendingMCPServerID)) {
      setPendingMCPServerID(availableMCPServersToAdd[0]?.id || "")
    }
  }, [availableMCPServersToAdd, pendingMCPServerID])

  useEffect(() => {
    if (!pendingConnectorDeviceID && selectableConnectorDevices[0]) {
      setPendingConnectorDeviceID(selectableConnectorDevices[0].id)
      return
    }
    if (pendingConnectorDeviceID && !connectorDevices.some((device) => device.id === pendingConnectorDeviceID)) {
      setPendingConnectorDeviceID(selectableConnectorDevices[0]?.id || "")
    }
  }, [selectableConnectorDevices, connectorDevices, pendingConnectorDeviceID])

  const createNewSession = () => {
    setSessionMenu(null)
    const defaultAgent = isAdvanced ? agents.find((agent) => agent.id === defaultAgentID) || agents[0] : undefined
    const session = createSession({
      agentID: defaultAgent?.id,
      modelName: isAdvanced ? modelName || defaultAgent?.default_model || modelOptions[0] || "" : undefined,
    })
    setDraftSession(session)
    setActiveSessionID("")
    setIsSessionsSidebarOpen(false)
    setPrompt("")
    setAttachments([])
    cancelEdit()
    if (isAdvanced && location.pathname !== "/chat") {
      navigate("/chat")
    }
  }

  const deleteSession = (sessionID: string) => {
    setSessionMenu(null)
    if (isAdvanced) {
      void api.delete(`/user/advanced-chat/sessions/${encodeURIComponent(sessionID)}`).then(() => refetchAdvancedSessions()).catch(() => undefined)
    }
    const nextSessions = sessions.filter((session) => session.id !== sessionID)
    setSessions(nextSessions)
    if (isAdvanced) {
      if (routeSessionID === sessionID) {
        const nextID = nextSessions[0]?.id || ""
        navigate(nextID ? `/chat/session/${encodeURIComponent(nextID)}` : "/chat", { replace: true })
      }
    } else if (activeSessionID === sessionID || !nextSessions.some((session) => session.id === activeSessionID)) {
      setActiveSessionID(nextSessions[0]?.id || "")
    }
    cancelEdit()
  }

  const renameSessionTitle = (session: ChatSession) => {
    setSessionMenu(null)
    const nextTitle = window.prompt(copy.customTitlePrompt, session.title || copy.untitledSession)
    if (nextTitle === null) {
      return
    }
    const title = nextTitle.trim()
    if (!title) {
      return
    }
    updateSession(session.id, (current) => ({ ...current, title }), { persist: true })
  }

  const regenerateSessionTitle = async (session: ChatSession) => {
    setSessionMenu(null)
    if (!isAdvanced) {
      return
    }
    setRegeneratingTitleSessionID(session.id)
    try {
      const res = await api.post(`/user/advanced-chat/sessions/${encodeURIComponent(session.id)}/title/regenerate`)
      const saved = normalizeSession(res.data?.session)
      if (saved) {
        setSessions((current) => upsertSession(current, saved))
      } else if (typeof res.data?.title === "string" && res.data.title.trim()) {
        updateSession(session.id, (current) => ({ ...current, title: res.data.title.trim() }))
      }
      void refetchAdvancedSessions()
    } catch (err) {
      error(apiErrorMessage(err, copy.regenerateTitleFailed))
    } finally {
      setRegeneratingTitleSessionID("")
    }
  }

  const persistAdvancedSession = (session: ChatSession) => {
    if (!isAdvanced || isRunActive(session.latest_run)) {
      return
    }
    saveAdvancedSessionSnapshot(session)
      .then((saved) => {
        if (saved) {
          setSessions((current) => upsertSession(current, saved))
        }
      })
      .catch((err) => error(apiErrorMessage(err, err instanceof Error ? err.message : copy.sendFailed)))
  }

  const updateSession = (sessionID: string, updater: (session: ChatSession) => ChatSession, options: { persist?: boolean; materialize?: boolean } = {}) => {
    const existingSession = sessions.find((session) => session.id === sessionID)
    const baseSession = existingSession || (draftSession.id === sessionID ? draftSession : undefined)
    const persistedSession = baseSession ? { ...updater(baseSession), updated_at: new Date().toISOString() } : undefined
    setSessions((current) => {
      const index = current.findIndex((session) => session.id === sessionID)
      if (index >= 0) {
        return current.map((session) =>
          session.id === sessionID ? { ...updater(session), updated_at: new Date().toISOString() } : session
        )
      }
      if (options.materialize && persistedSession) {
        return [persistedSession, ...current]
      }
      return current
    })
    if (draftSession.id === sessionID) {
      setDraftSession((current) => current.id === sessionID ? { ...updater(current), updated_at: new Date().toISOString() } : current)
    }
    if (options.materialize) {
      setActiveSessionID(sessionID)
      if (isAdvanced && !routeSessionID) {
        navigate(`/chat/session/${encodeURIComponent(sessionID)}`, { replace: true })
      }
    }
    if (options.persist && persistedSession && existingSession) {
      persistAdvancedSession(persistedSession)
    }
  }

  const selectSession = (sessionID: string) => {
    setSessionMenu(null)
    setActiveSessionID(sessionID)
    if (isAdvanced) {
      navigate(`/chat/session/${encodeURIComponent(sessionID)}`)
    }
    setIsSessionsSidebarOpen(false)
    cancelEdit()
  }

  const setSessionAgent = (agentID: string) => {
    const nextAgentID = agentID || defaultAgentID
    setSelectedAgentID(nextAgentID)
    const agent = agents.find((item) => item.id === nextAgentID)
    const nextModel = agent?.default_model || modelName || modelOptions[0] || ""
    if (nextModel) {
      setModelName(nextModel)
    }
    setSelectedUserChannelID(agent?.user_channel_id || 0)
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_id: nextAgentID,
      user_channel_id: agent?.user_channel_id || undefined,
      model_name: nextModel,
    }), { persist: true })
  }

  const removeAgentFromSession = () => {
    if (!currentSession) {
      return
    }
    const defaultAgent = agents.find((agent) => agent.id === defaultAgentID)
    setSelectedAgentID(defaultAgentID)
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_id: defaultAgentID,
      user_channel_id: defaultAgent?.user_channel_id || undefined,
    }), { persist: true })
  }

  const handleSessionModelChange = (value: string) => {
    if (activeRunMode === "agent_group") {
      return
    }
    if (value.trim()) {
      setModelName(value.trim())
    }
    if (isAdvanced && currentSession) {
      updateSession(currentSession.id, (session) => ({ ...session, model_name: value }), { persist: true })
      return
    }
    setModelName(value)
  }

  const setSessionRunMode = (mode: ChatRunMode) => {
    if (!isAdvanced || !currentSession) {
      return
    }
    const hasStarted = currentSession.messages.length > 0 || isRunActive(currentSession.latest_run)
    if (currentSession.run_mode !== "chat" && mode === "chat" && hasStarted) {
      return
    }
    if ((mode === "assistant" || mode === "agent_group") && !assistantModeEnabled) {
      error(copy.assistantModeDisabled)
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      run_mode: mode,
      agent_id: mode === "agent_group" ? undefined : session.agent_id || defaultAgentID,
      agent_group_id: mode === "agent_group" ? session.agent_group_id : undefined,
      connector_device_id: mode === "chat" ? undefined : session.connector_device_id,
      connector_workspace_path: mode === "chat" ? undefined : session.connector_workspace_path,
      connector_auto_approve: mode === "chat" ? false : session.connector_auto_approve,
      connector_command_prefixes: mode === "chat" ? [] : session.connector_command_prefixes,
      model_name: mode === "agent_group" ? undefined : session.model_name,
    }), { persist: true })
    setComposerControlMenu("")
  }

  const addSessionSkill = (skillID: string) => {
    if (!currentSession) {
      return
    }
    if (currentSession.skill_ids.includes(skillID)) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      skill_ids: [...session.skill_ids, skillID],
    }), { persist: true })
  }

  const removeSessionSkill = (skillID: string) => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      skill_ids: session.skill_ids.filter((id) => id !== skillID),
    }), { persist: true })
  }

  const addSessionMCPServer = (serverID: string) => {
    if (!currentSession) {
      return
    }
    if (!currentAdvancedSettings.assistant_mcp_tools_enabled) {
      error(copy.assistantMCPToolsDisabled)
      return
    }
    if (currentSession.mcp_server_ids.includes(serverID)) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      mcp_server_ids: [...session.mcp_server_ids, serverID],
    }), { persist: true })
  }

  const removeSessionMCPServer = (serverID: string) => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      mcp_server_ids: session.mcp_server_ids.filter((id) => id !== serverID),
    }), { persist: true })
  }

  const setSessionConnector = (deviceID: string, workspacePath: string, autoApprove: boolean, commandPrefixes: string[]) => {
    if (!currentSession) {
      return
    }
    if (!assistantConnectorToolsEnabled) {
      error(copy.assistantWorkspaceToolsDisabled)
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      connector_device_id: deviceID || undefined,
      connector_workspace_path: workspacePath || undefined,
      connector_auto_approve: autoApprove,
      connector_command_prefixes: uniqueStrings(commandPrefixes),
    }), { persist: true })
  }

  const setSessionConnectorDevice = (deviceID: string) => {
    if (!currentSession) {
      return
    }
    if (!assistantConnectorToolsEnabled) {
      error(copy.assistantWorkspaceToolsDisabled)
      return
    }
    const keepWorkspace = currentSession.connector_device_id === deviceID ? currentSession.connector_workspace_path : ""
    updateSession(currentSession.id, (session) => ({
      ...session,
      connector_device_id: deviceID || undefined,
      connector_workspace_path: keepWorkspace || undefined,
    }), { persist: true })
    setPendingConnectorDeviceID(deviceID)
    setPendingConnectorWorkspace(keepWorkspace || "")
    setComposerControlMenu("")
  }

  const setSessionAgentGroup = (groupID: string) => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      agent_group_id: groupID || undefined,
    }), { persist: true })
    setComposerControlMenu("")
  }

  const setSessionWorkspacePath = (workspacePath: string) => {
    if (!currentSession) {
      return
    }
    const path = workspacePath.trim()
    const deviceID = currentSession.connector_device_id || ""
    if (!deviceID) {
      return
    }
    setSessionConnector(
      deviceID,
      path,
      currentSession.connector_auto_approve || pendingConnectorAutoApprove,
      currentSession.connector_command_prefixes || commandPrefixesFromText(pendingConnectorCommandPrefixes)
    )
    setPendingConnectorWorkspace(path)
    setComposerControlMenu("")
  }

  const promptForWorkspacePath = () => {
    const initial = currentSession?.connector_workspace_path || pendingConnectorWorkspace
    const path = window.prompt(copy.workspacePathPlaceholder, initial)
    if (path !== null) {
      setSessionWorkspacePath(path)
    }
  }

  const clearSessionConnector = () => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      connector_device_id: undefined,
      connector_workspace_path: undefined,
      agent_group_id: undefined,
      connector_auto_approve: false,
      connector_command_prefixes: [],
    }), { persist: true })
    setWorkspaceSkills([])
  }

  const refreshWorkspaceSkills = async () => {
    const deviceID = currentSession?.connector_device_id || pendingConnectorDeviceID
    const workspacePath = currentSession?.connector_workspace_path || pendingConnectorWorkspace.trim()
    if (!deviceID) {
      error(copy.noDeviceSelected)
      return
    }
    setIsRefreshingWorkspaceSkills(true)
    try {
      const res = await api.post("/user/advanced-chat/workspace-skills/refresh", {
        connector_device_id: deviceID,
        connector_workspace_path: workspacePath || undefined,
      })
      const rawSkills: unknown[] = Array.isArray(res.data?.skills) ? res.data.skills : []
      const skills = rawSkills.map(normalizeWorkspaceSkill).filter((skill): skill is WorkspaceSkill => Boolean(skill))
      setWorkspaceSkills(skills)
    } catch (err) {
      error(apiErrorMessage(err, copy.workspaceSkillsRefreshFailed))
    } finally {
      setIsRefreshingWorkspaceSkills(false)
    }
  }

  const decideConnectorApproval = async (taskID: string, approved: boolean) => {
    if (!taskID || decidingConnectorTaskID) {
      return
    }
    setDecidingConnectorTaskID(taskID)
    try {
      await api.post(`/user/advanced-chat/connector-tasks/${encodeURIComponent(taskID)}/decision`, { approved })
      if (activeSessionID) {
        updateSession(activeSessionID, (session) => ({
          ...session,
          messages: session.messages.map((message) => ({
            ...message,
            tool_calls: (message.tool_calls || []).map((toolCall) =>
              stringArgument(toolCall.arguments, "connector_task_id") === taskID
                ? { ...toolCall, status: approved ? "running" : "error" }
                : toolCall
            ),
          })),
        }))
      }
      await refetchConnectorApprovals()
      void refetchAdvancedSessions()
    } catch (err) {
      await refetchConnectorApprovals()
      error(apiErrorMessage(err, copy.connectorApprovalFailed))
    } finally {
      setDecidingConnectorTaskID("")
    }
  }

  const openAdvancedConfig = (tab: SessionConfigTab = configTab) => {
    if (tab === "mcp" && !currentAdvancedSettings.assistant_mcp_tools_enabled) {
      tab = "basic"
    }
    if (tab === "device" && !assistantConnectorToolsEnabled) {
      tab = "basic"
    }
    if (tab === "device") {
      setPendingConnectorDeviceID(currentSession?.connector_device_id || connectorDevices[0]?.id || "")
      setPendingConnectorWorkspace(currentSession?.connector_workspace_path || "")
      setPendingConnectorAutoApprove(Boolean(currentSession?.connector_auto_approve))
      setPendingConnectorCommandPrefixes((currentSession?.connector_command_prefixes || []).join("\n"))
    }
    setConfigTab(tab)
    setIsConfigOpen(true)
  }

  const stopActiveTask = async () => {
    if (isStopping) {
      return
    }
    setIsStopping(true)
    abortControllerRef.current?.abort()
    if (isAdvanced && activeRunID && currentSession) {
      try {
        const res = await api.post(`/user/advanced-chat/runs/${encodeURIComponent(activeRunID)}/stop`)
        const stoppedRun = normalizeRun(res.data)
        updateSession(currentSession.id, (current) => ({
          ...current,
          latest_run: stoppedRun || (current.latest_run ? { ...current.latest_run, status: "cancelled", status_message: "cancelled" } : current.latest_run),
        }))
        void refetchAdvancedSessions()
      } catch (err) {
        error(apiErrorMessage(err, copy.stopFailed))
      } finally {
        setIsStopping(false)
      }
    } else {
      setIsStopping(false)
    }
  }

  const closeAgentMention = () => {
    setAgentMention((current) => current.open ? { ...current, open: false, selected: 0 } : current)
  }

  const updateAgentMention = (value: string, caret: number | null) => {
    if (activeRunMode !== "agent_group" || !currentAgentGroup || caret === null) {
      closeAgentMention()
      return
    }
    const beforeCaret = value.slice(0, caret)
    const match = /(^|\s)@([^\s@]*)$/.exec(beforeCaret)
    if (!match) {
      closeAgentMention()
      return
    }
    const start = beforeCaret.length - match[2].length - 1
    setAgentMention({ open: true, start, query: match[2], selected: 0 })
  }

  const handleComposerPromptChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value
    setPrompt(value)
    updateAgentMention(value, event.currentTarget.selectionStart)
  }

  const selectAgentMention = (agent: ChatAgentGroupAgent) => {
    const textarea = composerTextareaRef.current
    const caret = textarea?.selectionStart ?? prompt.length
    const token = `@${(agent.name || agent.id).trim()} `
    const nextPrompt = `${prompt.slice(0, agentMention.start)}${token}${prompt.slice(caret)}`
    const nextCaret = agentMention.start + token.length
    setPrompt(nextPrompt)
    setAgentMention({ open: false, start: 0, query: "", selected: 0 })
    window.setTimeout(() => {
      const current = composerTextareaRef.current
      current?.focus()
      current?.setSelectionRange(nextCaret, nextCaret)
    }, 0)
  }

  const handleComposerPromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (agentMention.open) {
      if (event.key === "Escape") {
        event.preventDefault()
        closeAgentMention()
        return
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        setAgentMention((current) => {
          const count = agentMentionOptions.length
          if (!count) {
            return current
          }
          const direction = event.key === "ArrowDown" ? 1 : -1
          return { ...current, selected: (current.selected + direction + count) % count }
        })
        return
      }
      if ((event.key === "Enter" || event.key === "Tab") && agentMentionOptions.length > 0) {
        event.preventDefault()
        selectAgentMention(agentMentionOptions[Math.min(agentMention.selected, agentMentionOptions.length - 1)])
        return
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault()
      sendMessage()
    }
  }

  const agentMentionPicker = () => {
    if (!agentMention.open || activeRunMode !== "agent_group" || !currentAgentGroup) {
      return null
    }
    return (
      <div className="absolute bottom-full left-0 z-40 mb-2 max-h-56 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
        {agentMentionOptions.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">{agentGroupCopy.noAgents}</div>
        ) : (
          agentMentionOptions.map((agent, index) => (
            <button
              key={agent.id}
              type="button"
              className={cn(
                "flex min-h-10 w-full items-center justify-between gap-3 rounded px-2 text-left text-sm hover:bg-muted",
                index === agentMention.selected && "bg-primary/10 text-primary"
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                selectAgentMention(agent)
              }}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{agent.name || agent.id}</span>
                <span className="block truncate text-[11px] text-muted-foreground">@{agent.id}</span>
              </span>
              <span className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">{agent.type}</span>
            </button>
          ))
        )}
      </div>
    )
  }

  const sendMessage = async () => {
    const content = prompt.trim()
    const rawKey = selectedAPIKey?.api_key.trim() || ""
    const session = currentSession
    const resolvedModel = activeModelName.trim()
    if (!session) {
      return
    }
    if (!resolvedModel && activeRunMode !== "agent_group") {
      error(copy.modelRequired)
      return
    }
    if (isAdvanced && activeRunMode !== "agent_group" && !selectedAgent) {
      error(copy.agentSelectRequired)
      return
    }
    if (!selectedAgent?.default_model && activeRunMode !== "agent_group") {
      setModelName(resolvedModel)
    }
    if (isAdvanced && !selectedUserChannel) {
      error(copy.channelRequired)
      return
    }
    if (isAdvanced && (activeRunMode === "assistant" || activeRunMode === "agent_group")) {
      if (!assistantModeEnabled) {
        error(copy.assistantModeDisabled)
        return
      }
      if (activeRunMode === "agent_group") {
        if (!session.agent_group_id) {
          error(agentGroupCopy.groupRequired)
          return
        }
      }
      if (!currentAdvancedSettings.assistant_mcp_tools_enabled && (session.mcp_server_ids.length > 0 || selectedSkills.some((skill) => skill.mcp_server_ids.length > 0))) {
        error(copy.assistantMCPToolsDisabled)
        return
      }
      if (!assistantConnectorToolsEnabled && (session.connector_device_id || session.connector_workspace_path)) {
        error(copy.assistantWorkspaceToolsDisabled)
        return
      }
    }
    if (!isAdvanced && !rawKey) {
      error(copy.keyRequired)
      return
    }
    if (!content && attachments.length === 0) {
      return
    }

    const messageContent = messageContentWithAttachments(content, attachments)
    const userMessage = createMessage("user", messageContent)
    const nextMessages = [...session.messages, userMessage]
    const nextTitle = session.title || titleFromMessage(content || attachments[0]?.name || copy.attachmentMessageTitle, copy)
    updateSession(session.id, (current) => ({
      ...current,
      title: nextTitle,
      messages: nextMessages,
      agent_id: activeRunMode === "agent_group" ? undefined : current.agent_id || defaultAgentID,
      model_name: activeRunMode === "agent_group" ? undefined : resolvedModel,
    }), { materialize: true })
    setPrompt("")
    closeAgentMention()
    setAttachments([])
    setIsSending(true)
    cancelEdit()

    try {
      if (isAdvanced) {
        if (activeRunMode === "assistant" || activeRunMode === "agent_group") {
          const assistantMessage = createMessage("assistant", "", [])
          updateSession(session.id, (current) => ({
            ...current,
            user_channel_id: selectedUserChannel?.id || current.user_channel_id,
            messages: [...current.messages, assistantMessage],
            latest_run: {
              id: "",
              session_id: session.id,
              assistant_message_id: assistantMessage.id,
              mode: activeRunMode,
              status: "queued",
              status_message: "assistant_started",
            },
          }))
          try {
            const res = await api.post("/user/advanced-chat/completions", {
              session_id: session.id,
              title: nextTitle,
              model: activeRunMode === "agent_group" ? "" : resolvedModel,
              user_channel_id: selectedUserChannel?.id || 0,
              mode: activeRunMode,
              messages: advancedMessagePayload(nextMessages),
              agent_id: activeRunMode === "agent_group" ? "" : session.agent_id || defaultAgentID,
              agent_group_id: session.agent_group_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
              connector_device_id: session.connector_device_id || "",
              connector_workspace_path: session.connector_workspace_path || "",
              connector_auto_approve: session.connector_auto_approve,
              connector_command_prefixes: session.connector_command_prefixes,
              max_tokens: session.max_tokens || 0,
              temperature: session.temperature ?? null,
              reasoning_effort: session.reasoning_effort || "",
              stream: false,
            })
            const serverSession = normalizeSession(res.data?.session)
            if (serverSession) {
              setSessions((current) => upsertSession(current, serverSession))
              setActiveSessionID(serverSession.id)
              navigate(`/chat/session/${encodeURIComponent(serverSession.id)}`, { replace: true })
            }
            void refetchAdvancedSessions()
          } catch (err) {
            updateSession(session.id, (current) => ({
              ...current,
              latest_run: undefined,
              messages: current.messages.filter((message) => message.id !== assistantMessage.id),
            }))
            throw err
          }
          return
        }

        const assistantMessage = createMessage("assistant", "", [])
        const assistantMessageID = assistantMessage.id
        if (selectedAgent?.stream !== true) {
          updateSession(session.id, (current) => ({ ...current, messages: [...current.messages, assistantMessage] }))
          try {
            const res = await api.post("/user/advanced-chat/completions", {
              session_id: session.id,
              title: nextTitle,
              model: resolvedModel,
              user_channel_id: selectedUserChannel?.id || 0,
              mode: activeRunMode,
              messages: advancedMessagePayload(nextMessages),
              agent_id: session.agent_id || defaultAgentID,
              agent_group_id: session.agent_group_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
              connector_device_id: "",
              connector_workspace_path: "",
              connector_auto_approve: false,
              connector_command_prefixes: [],
              max_tokens: session.max_tokens || 0,
              temperature: session.temperature ?? null,
              reasoning_effort: session.reasoning_effort || "",
              stream: false,
            })
            const content = typeof res.data?.message?.content === "string" ? res.data.message.content : ""
            const finalParts = normalizeContentParts(res.data?.message?.content_parts, content)
            const finalToolCalls = normalizeToolCalls(res.data?.tool_call_details)
            updateSession(session.id, (current) => ({
              ...current,
              messages: current.messages.map((message) =>
                message.id === assistantMessageID
                  ? { ...message, content: content || copy.emptyResponse, content_parts: finalParts, tool_calls: finalToolCalls }
                  : message
              ),
            }))
          } catch (err) {
            updateSession(session.id, (current) => ({
              ...current,
              messages: current.messages.filter((message) => message.id !== assistantMessageID),
            }))
            throw err
          }
          void refetchAdvancedSessions()
          return
        }
        const controller = new AbortController()
        abortControllerRef.current = controller
        setIsStreamActive(true)
        updateSession(session.id, (current) => ({ ...current, messages: [...current.messages, assistantMessage] }))

        let accumulatedText = ""
        try {
          const token = getAuthToken()
          const response = await fetch(apiURL("/api/user/advanced-chat/completions"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              session_id: session.id,
              title: nextTitle,
              model: resolvedModel,
              user_channel_id: selectedUserChannel?.id || 0,
              mode: activeRunMode,
              messages: advancedMessagePayload(nextMessages),
              agent_id: session.agent_id || defaultAgentID,
              agent_group_id: session.agent_group_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
              connector_device_id: "",
              connector_workspace_path: "",
              connector_auto_approve: false,
              connector_command_prefixes: [],
              max_tokens: session.max_tokens || 0,
              temperature: session.temperature ?? null,
              reasoning_effort: session.reasoning_effort || "",
              stream: true,
            }),
            signal: controller.signal,
          })
          if (!response.ok) {
            throw new Error(await responseErrorMessage(response))
          }
          if (!response.body) {
            throw new Error(copy.emptyResponse)
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          const handleStreamEvent = (event: ParsedSSEEvent | null) => {
            if (!event) {
              return
            }
            if (event.type === "text") {
              const delta = typeof event.payload.delta === "string" ? event.payload.delta : ""
              if (!delta) {
                return
              }
              const round = typeof event.payload.round === "number" && Number.isFinite(event.payload.round) ? event.payload.round : 1
              accumulatedText += delta
              updateSession(session.id, (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.id === assistantMessageID
                    ? { ...message, content: accumulatedText, content_parts: appendContentPart(message.content_parts || [], round, delta) }
                    : message
                ),
              }))
            } else if (event.type === "status") {
              const statusText = streamStatusText(event.payload, copy)
              if (!statusText || accumulatedText) {
                return
              }
              updateSession(session.id, (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.id === assistantMessageID ? { ...message, content: statusText } : message
                ),
              }))
            } else if (event.type === "tool_call") {
              const nextToolCalls = normalizeToolCalls([event.payload])
              if (nextToolCalls.length === 0) {
                return
              }
              updateSession(session.id, (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.id === assistantMessageID
                    ? { ...message, tool_calls: mergeToolCalls(message.tool_calls || [], nextToolCalls) }
                    : message
                ),
              }))
            } else if (event.type === "done") {
              const finalContent = typeof event.payload.message?.content === "string" ? event.payload.message.content : accumulatedText
              const finalParts = normalizeContentParts(event.payload.message?.content_parts, finalContent)
              const finalToolCalls = normalizeToolCalls(event.payload.tool_call_details)
              updateSession(session.id, (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.id === assistantMessageID
                    ? { ...message, content: finalContent, content_parts: finalParts, tool_calls: finalToolCalls }
                    : message
                ),
              }))
            } else if (event.type === "error") {
              throw new Error(typeof event.payload.error === "string" ? event.payload.error : copy.sendFailed)
            }
          }
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split(/\r?\n\r?\n/)
            buffer = parts.pop() || ""
            for (const part of parts) {
              handleStreamEvent(parseSSEEvent(part))
            }
          }
          if (buffer.trim()) {
            handleStreamEvent(parseSSEEvent(buffer))
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            updateSession(session.id, (current) => ({
              ...current,
              messages: current.messages.map((message) =>
                message.id === assistantMessageID && !message.content ? { ...message, content: copy.stopped } : message
              ),
            }))
          } else {
            updateSession(session.id, (current) => ({
              ...current,
              messages: current.messages.filter((message) => message.id !== assistantMessageID || message.content || (message.tool_calls || []).length > 0),
            }))
            error(apiErrorMessage(err, err instanceof Error ? err.message : copy.sendFailed))
          }
        } finally {
          abortControllerRef.current = null
          setIsStreamActive(false)
          setIsStopping(false)
          setIsSending(false)
          void refetchAdvancedSessions()
        }
        return
      }

      let answer = ""
      const systemPrompt = ""
      const request = chatRequest(endpointMode, resolvedModel, rawKey, nextMessages, systemPrompt)
      const response = await fetch(apiURL(request.url), {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
      })
      const text = await response.text()
      let payload: any = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || text || `HTTP ${response.status}`)
      }
      answer = responseTextFromPayload(payload)
      const assistantMessage = createMessage("assistant", answer || copy.emptyResponse)
      updateSession(session.id, (current) => ({ ...current, messages: [...current.messages, assistantMessage] }))
    } catch (err) {
      error(apiErrorMessage(err, err instanceof Error ? err.message : copy.sendFailed))
    } finally {
      setIsSending(false)
    }
  }

  const beginEditMessage = (message: ChatMessage) => {
    setEditingMessageID(message.id)
    if (message.role === "user") {
      const parsed = parseMessageAttachments(message.content)
      setEditingText(parsed.text)
      setEditingAttachments(parsed.attachments.map(chatAttachmentFromParsed))
      return
    }
    setEditingText(message.content)
    setEditingAttachments([])
  }

  const saveEditedMessage = () => {
    const content = messageContentWithAttachments(editingText.trim(), editingAttachments)
    if (!currentSession || !editingMessageID || !content.trim()) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === editingMessageID ? { ...message, content, updated_at: new Date().toISOString() } : message
      ),
    }), { persist: true })
    cancelEdit()
  }

  const deleteMessage = (messageID: string) => {
    if (!currentSession) {
      return
    }
    updateSession(currentSession.id, (session) => ({
      ...session,
      messages: session.messages.filter((message) => message.id !== messageID),
    }), { persist: true })
    if (editingMessageID === messageID) {
      cancelEdit()
    }
  }

  const handleAttachmentFiles = async (files: FileList | null, target: AttachmentTarget = "composer") => {
    if (!isAdvanced || !files?.length) {
      return
    }
    setAttachmentMenuTarget("")
    if (!currentAdvancedSettings.file_storage_enabled) {
      error(fileCopy.storageDisabled)
      return
    }
    if (isUploadingAttachments) {
      return
    }
    setIsUploadingAttachments(true)
    const next: ChatAttachment[] = []
    try {
      for (const file of Array.from(files)) {
        const validationError = validateAttachment(file, currentAdvancedSettings, copy)
        if (validationError) {
          error(validationError)
          continue
        }
        const formData = new FormData()
        formData.append("file", file)
        const res = await api.post("/user/advanced-chat/files", formData)
        const storedFile = normalizeStoredFile(res.data?.file)
        if (!storedFile) {
          continue
        }
        next.push(attachmentFromStoredFile(storedFile, normalizeStoredFileContent(res.data?.content)))
      }
      if (next.length > 0) {
        appendAttachments(target, next)
        void queryClient.invalidateQueries({ queryKey: advancedFilesQueryKey })
        void queryClient.invalidateQueries({ queryKey: ["advanced-chat-user-settings"] })
      }
    } catch (err) {
      error(apiErrorMessage(err, fileCopy.uploadFailed))
    } finally {
      setIsUploadingAttachments(false)
    }
  }

  const selectStoredFile = async (file: StoredFile) => {
    const targetAttachments = filePickerTarget === "editor" ? editingAttachments : attachments
    if (targetAttachments.some((attachment) => attachment.storage_id === file.id)) {
      setIsFilePickerOpen(false)
      return
    }
    setSelectingFileID(file.id)
    try {
      const res = await api.get(`/user/advanced-chat/files/${encodeURIComponent(file.id)}/content`)
      const content = normalizeStoredFileContent(res.data)
      appendAttachments(filePickerTarget, [attachmentFromStoredFile(file, content)])
      setIsFilePickerOpen(false)
    } catch (err) {
      error(apiErrorMessage(err, fileCopy.selectFailed))
    } finally {
      setSelectingFileID("")
    }
  }

  const appendAttachments = (target: AttachmentTarget, next: ChatAttachment[]) => {
    if (target === "editor") {
      setEditingAttachments((current) => mergeAttachments(current, next).slice(0, 8))
      return
    }
    setAttachments((current) => mergeAttachments(current, next).slice(0, 8))
  }

  const openFilePicker = (target: AttachmentTarget) => {
    setAttachmentMenuTarget("")
    setFilePickerTarget(target)
    setIsFilePickerOpen(true)
  }

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }

  const removeEditingAttachment = (id: string) => {
    setEditingAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }

  const attachmentMenuButton = (target: AttachmentTarget, className = "") => {
    const open = attachmentMenuTarget === target
    const disabled = !currentAdvancedSettings.file_storage_enabled
    return (
      <div className={cn("relative shrink-0", className)}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={copy.addAttachment}
          aria-expanded={open}
          onClick={() => setAttachmentMenuTarget((current) => current === target ? "" : target)}
        >
          <Plus size={16} />
        </Button>
        {open && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            <label className={cn(
              "flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted",
              isUploadingAttachments && "pointer-events-none opacity-50"
            )}>
              <Paperclip size={15} />
              {isUploadingAttachments ? fileCopy.uploading : copy.addAttachment}
              <input
                className="sr-only"
                type="file"
                multiple
                disabled={isUploadingAttachments || disabled}
                onChange={(event) => {
                  handleAttachmentFiles(event.target.files, target)
                  event.target.value = ""
                }}
              />
            </label>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled}
              onClick={() => openFilePicker(target)}
            >
              <FileText size={15} />
              {fileCopy.selectFile}
            </button>
          </div>
        )}
      </div>
    )
  }

  const advancedComposerActionButton = (className = "") => {
    if (isStreamActive || isActiveRunRunning || isSending) {
      return (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={className}
          disabled={isStopping}
          onClick={stopActiveTask}
          title={copy.stopTask}
          aria-label={copy.stopTask}
        >
          <X size={16} />
        </Button>
      )
    }
    const title = activeRunMode === "assistant" ? copy.runAssistant : activeRunMode === "agent_group" ? agentGroupCopy.runAgentGroup : copy.send
    return (
      <Button
        type="button"
        size="icon"
        className={className}
        disabled={(!prompt.trim() && attachments.length === 0) || isSending || isUploadingAttachments || isActiveRunRunning}
        onClick={sendMessage}
        title={title}
        aria-label={title}
      >
        <Send size={16} />
      </Button>
    )
  }

  const agentWorkStatusButton = (className = "") => {
    if (!showAgentWorkStatus) {
      return null
    }
    const workingCount = agentWork?.agents.filter((agent) => agent.working).length || 0
    const title = workingCount > 0
      ? agentGroupCopy.workStatusActive.replace("{count}", String(workingCount))
      : agentGroupCopy.workStatus
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(className, workingCount > 0 && "border-primary/40 bg-primary/5 text-primary")}
        onClick={() => setIsAgentWorkOpen(true)}
        title={title}
        aria-label={title}
      >
        <Activity size={16} />
      </Button>
    )
  }

  const sessionAgentName = (session: ChatSession) => {
    if (!isAdvanced) {
      return ""
    }
    if (session.run_mode === "agent_group") {
      const groupID = session.agent_group_id || ""
      return agentGroups.find((group) => group.id === groupID)?.name || groupID
    }
    const agentID = session.agent_id || defaultAgentID
    return agents.find((agent) => agent.id === agentID)?.name || agentID
  }

  const composerModeControl = () => {
    const open = composerControlMenu === "mode"
    const chatLocked = Boolean((currentSession?.messages.length || 0) > 0 || isActiveRunRunning)
    return (
      <div className="relative min-w-0">
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-between gap-2 px-2 text-xs"
          onClick={() => setComposerControlMenu((current) => current === "mode" ? "" : "mode")}
        >
          <span className="truncate">{runModeLabel(activeRunMode, copy, agentGroupCopy)}</span>
          <ArrowDown className="h-3.5 w-3.5 rotate-180" />
        </Button>
        {open && (
          <div className="absolute bottom-full left-0 z-30 mb-2 w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            {(["chat", "assistant", "agent_group"] as const).map((mode) => {
              const disabled = (mode === "chat" && chatLocked) || ((mode === "assistant" || mode === "agent_group") && !assistantModeEnabled)
              return (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded px-2 text-left text-sm hover:bg-muted",
                    activeRunMode === mode && "bg-primary/10 text-primary",
                    disabled && "pointer-events-none opacity-40"
                  )}
                  disabled={disabled}
                  onClick={() => setSessionRunMode(mode)}
                >
                  <span>{runModeLabel(mode, copy, agentGroupCopy)}</span>
                  {activeRunMode === mode && <Check size={14} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const composerDeviceControl = () => {
    if (activeRunMode === "chat") {
      return null
    }
    const open = composerControlMenu === "device"
    return (
      <div className="relative min-w-0">
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-between gap-2 px-2 text-xs"
          disabled={!assistantConnectorToolsEnabled}
          onClick={() => setComposerControlMenu((current) => current === "device" ? "" : "device")}
        >
          <span className="truncate">{currentConnectorDevice?.name || copy.selectDevice}</span>
          <ArrowDown className="h-3.5 w-3.5 rotate-180" />
        </Button>
        {open && (
          <div className="absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            {selectableConnectorDevices.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">{copy.noDevices}</div>
            ) : (
              selectableConnectorDevices.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => setSessionConnectorDevice(device.id)}
                >
                  <span className="min-w-0 truncate">{device.name}</span>
                  <span className={cn("shrink-0 text-[11px]", device.online ? "text-emerald-600" : "text-muted-foreground")}>
                    {device.online ? copy.deviceOnline : copy.deviceOffline}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  const composerWorkspaceControl = () => {
    if (activeRunMode === "chat") {
      return null
    }
    const open = composerControlMenu === "workspace"
    const disabled = !currentConnectorDeviceID
    return (
      <div className="relative min-w-0">
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-between gap-2 px-2 text-xs"
          disabled={disabled}
          onClick={() => setComposerControlMenu((current) => current === "workspace" ? "" : "workspace")}
        >
          <span className="truncate">{currentSession?.connector_workspace_path || copy.workspacePath}</span>
          <ArrowDown className="h-3.5 w-3.5 rotate-180" />
        </Button>
        {open && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{currentConnectorDevice?.name || copy.selectDevice}</div>
            {recentWorkspacePaths.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">{copy.noWorkspaces}</div>
            ) : (
              recentWorkspacePaths.map((workspacePath) => (
                <button
                  key={workspacePath}
                  type="button"
                  className="flex min-h-9 w-full items-center rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => setSessionWorkspacePath(workspacePath)}
                >
                  <span className="truncate">{workspacePath}</span>
                </button>
              ))
            )}
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                className="flex h-9 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-muted"
                onClick={promptForWorkspacePath}
              >
                <Plus size={14} />
                {copy.selectWorkspace}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const composerAgentGroupControl = () => {
    const open = composerControlMenu === "agent_group"
    return (
      <div className="relative min-w-0">
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-between gap-2 px-2 text-xs"
          disabled={isFetchingAgentGroups}
          onClick={() => setComposerControlMenu((current) => current === "agent_group" ? "" : "agent_group")}
        >
          <span className="truncate">{currentAgentGroup?.name || agentGroupCopy.selectGroup}</span>
          <ArrowDown className="h-3.5 w-3.5 rotate-180" />
        </Button>
        {open && (
          <div className="absolute bottom-full right-0 z-30 mb-2 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            {isFetchingAgentGroups ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">{agentGroupCopy.loadingGroups}</div>
            ) : agentGroups.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">{agentGroupCopy.noGroups}</div>
            ) : (
              agentGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="flex min-h-10 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-muted"
                  onClick={() => setSessionAgentGroup(group.id)}
                >
                  <span className="min-w-0 truncate">{group.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{agentGroupChiefCount(group)} chief</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  function cancelEdit() {
    setEditingMessageID("")
    setEditingText("")
    setEditingAttachments([])
    setFilePickerTarget("composer")
    setAttachmentMenuTarget("")
    setComposerControlMenu("")
    closeAgentMention()
  }

  const basicConfig = (
    <Card>
      <CardHeader>
        <CardTitle>{copy.config}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_minmax(0,1fr)]">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={selectedAPIKey?.id || ""}
          onChange={(event) => setSelectedAPIKeyID(Number(event.target.value) || 0)}
        >
          <option value="">{selectableAPIKeys.length ? copy.selectKey : copy.noKeys}</option>
          {selectableAPIKeys.map((key) => (
            <option key={key.id} value={key.id}>
              {key.name || key.key_prefix}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={endpointMode}
          onChange={(event) => setEndpointMode(normalizeEndpoint(event.target.value))}
        >
          <option value="chat">{copy.chatCompletions}</option>
          <option value="responses">{copy.responsesAPI}</option>
          <option value="claude">{copy.claudeMessages}</option>
          <option value="gemini">{copy.geminiGenerate}</option>
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={modelName}
          onChange={(event) => setModelName(event.target.value)}
        >
          <option value="">{copy.selectModel}</option>
          {modelSelectOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  )

  const sessionsSidebar = (
    <aside className="flex h-full w-72 flex-col border-l bg-card">
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-4">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{copy.sessions}</div>
        </div>
        <Button variant="ghost" size="sm" className="xl:hidden" onClick={() => setIsSessionsSidebarOpen(false)} aria-label={copy.closeSessions}>
          <X size={16} />
        </Button>
      </div>
      <div className="border-b p-4">
        <Button className="w-full gap-2" onClick={createNewSession}>
          <MessageSquarePlus size={16} />
          {copy.newSession}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border p-2",
              session.id === activeSession?.id && "border-primary bg-primary/5"
            )}
            onContextMenu={(event) => {
              event.preventDefault()
              setSessionMenu({ sessionID: session.id, x: event.clientX, y: event.clientY })
            }}
          >
            <button type="button" className="min-w-0 text-left" onClick={() => selectSession(session.id)}>
              <div className="truncate text-sm font-medium">{session.title || copy.untitledSession}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {copy.messageCount.replace("{count}", String(session.messages.length))}
              </div>
              {isAdvanced && sessionAgentName(session) && (
                <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <Bot size={12} className="shrink-0" />
                  <span className="truncate">{sessionAgentName(session)}</span>
                </div>
              )}
              {isAdvanced && session.run_mode !== "chat" && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="inline-flex rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[11px] text-primary">
                    {runModeLabel(session.run_mode, copy, agentGroupCopy)}
                  </span>
                  {isRunActive(session.latest_run) && (
                    <span className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                      {copy.runningAssistant}
                    </span>
                  )}
                </div>
              )}
            </button>
            <Button variant="ghost" size="sm" onClick={() => deleteSession(session.id)} title={copy.deleteSession}>
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
        {sessionMenu && (() => {
          const session = sessions.find((item) => item.id === sessionMenu.sessionID)
          if (!session) {
            return null
          }
          return (
            <div
              className="fixed z-[80] w-44 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
              style={{ left: Math.min(sessionMenu.x, window.innerWidth - 184), top: Math.min(sessionMenu.y, window.innerHeight - 112) }}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" className="flex h-9 w-full items-center rounded px-2 text-left hover:bg-muted" onClick={() => renameSessionTitle(session)}>
                {copy.customTitle}
              </button>
              <button
                type="button"
                className="flex h-9 w-full items-center rounded px-2 text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                disabled={!isAdvanced || regeneratingTitleSessionID === session.id}
                onClick={() => void regenerateSessionTitle(session)}
              >
                {regeneratingTitleSessionID === session.id ? copy.regeneratingTitle : copy.regenerateTitle}
              </button>
            </div>
          )
        })()}
      </div>
    </aside>
  )
  const sessionsSidebarPortal =
    typeof document === "undefined"
      ? null
      : createPortal(
          <>
            <div className={cn("fixed right-0 z-20 hidden xl:flex", isDesktop ? "top-[6.25rem] h-[calc(100vh-6.25rem)]" : "top-16 h-[calc(100vh-4rem)]")}>{sessionsSidebar}</div>

            {isSessionsSidebarOpen && (
              <div className={cn("fixed inset-x-0 bottom-0 z-40 xl:hidden", isDesktop ? "top-[6.25rem]" : "top-16")}>
                <button
                  type="button"
                  className="absolute inset-0 bg-black/50"
                  aria-label={copy.closeSessions}
                  onClick={() => setIsSessionsSidebarOpen(false)}
                />
                <div className="relative z-50 ml-auto h-full w-72 max-w-[85vw]">{sessionsSidebar}</div>
              </div>
            )}
          </>,
          document.body
        )

  return (
    <div className={cn(isAdvanced ? (isDesktop ? "flex min-h-[calc(100vh-6.25rem)] flex-col xl:pr-72" : "flex min-h-[calc(100vh-4rem)] flex-col xl:pr-72") : "space-y-6 xl:pr-72")}>
      {sessionsSidebarPortal}
      <div className="sticky top-0 z-10 -mx-4 flex justify-end border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="xl:hidden"
            onClick={() => setIsSessionsSidebarOpen((open) => !open)}
            aria-label={isSessionsSidebarOpen ? copy.closeSessions : copy.openSessions}
            aria-expanded={isSessionsSidebarOpen}
            title={isSessionsSidebarOpen ? copy.closeSessions : copy.openSessions}
          >
            <Menu size={16} />
          </Button>
          {isAdvanced && (
            <Button variant="outline" size="icon" onClick={() => openAdvancedConfig()} aria-label={copy.config} title={copy.config}>
              <Settings size={16} />
            </Button>
          )}
        </div>
      </div>

      <PageTitleSlot />
      <div className={cn(isAdvanced ? "flex min-h-0 flex-1 flex-col" : "space-y-4")}>
        {!isAdvanced && basicConfig}

        {isAdvanced && currentSession?.messages.length === 0 ? (
          <div className={cn("flex items-center justify-center py-8", isDesktop ? "min-h-[calc(100vh-16.25rem)]" : "min-h-[calc(100vh-14rem)]")}>
            <div className="w-full max-w-3xl rounded-2xl border bg-card p-3 shadow-sm">
              <div className="relative">
                <textarea
                  ref={composerTextareaRef}
                  className="min-h-36 w-full resize-none rounded-xl border-0 bg-transparent px-3 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-0"
                  value={prompt}
                  placeholder={activeRunMode === "assistant" ? copy.assistantPromptPlaceholder : activeRunMode === "agent_group" ? agentGroupCopy.promptPlaceholder : copy.promptPlaceholder}
                  disabled={isActiveRunRunning}
                  onChange={handleComposerPromptChange}
                  onKeyDown={handleComposerPromptKeyDown}
                  onClick={(event) => updateAgentMention(prompt, event.currentTarget.selectionStart)}
                />
                {agentMentionPicker()}
              </div>

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-2 pb-3">
                  <AttachmentChips attachments={attachments} removeLabel={copy.removeAttachment} onRemove={removeAttachment} />
                </div>
              )}

              <div className={cn(
                "grid gap-2 border-t px-2 pt-3",
                activeRunMode === "agent_group" ? "grid-cols-2 sm:grid-cols-4" : activeRunMode === "assistant" ? "grid-cols-3" : "grid-cols-1"
              )}>
                {composerModeControl()}
                {composerDeviceControl()}
                {activeRunMode === "agent_group" && composerAgentGroupControl()}
                {composerWorkspaceControl()}
              </div>

              <div className="flex flex-col gap-3 border-t px-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {activeRunMode !== "agent_group" && (
                    <select
                      className="h-9 max-w-[min(15rem,100%)] rounded-md border bg-background px-3 text-sm"
                      value={activeModelName}
                      onChange={(event) => handleSessionModelChange(event.target.value)}
                    >
                      <option value="">{copy.selectModel}</option>
                      {modelSelectOptions.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  )}
                  {activeRunMode !== "agent_group" && (
                    <select
                      className="h-9 max-w-[min(15rem,100%)] rounded-md border bg-background px-3 text-sm"
                      value={currentSession?.agent_id || defaultAgentID}
                      onChange={(event) => setSessionAgent(event.target.value)}
                    >
                      {agents.length === 0 && <option value="">{copy.noAgents}</option>}
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted">
                    <Paperclip size={15} />
                    {isUploadingAttachments ? fileCopy.uploading : copy.addAttachment}
                    <input
                      className="sr-only"
                      type="file"
                      multiple
                      disabled={isUploadingAttachments || !currentAdvancedSettings.file_storage_enabled}
                      onChange={(event) => {
                        handleAttachmentFiles(event.target.files, "composer")
                        event.target.value = ""
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    className="h-9 gap-2"
                    disabled={!currentAdvancedSettings.file_storage_enabled}
                    onClick={() => openFilePicker("composer")}
                  >
                    <FileText size={15} />
                    {fileCopy.selectFile}
                  </Button>
                  {agentWorkStatusButton("h-9 w-9")}
                </div>

                {isStreamActive || isActiveRunRunning || isSending ? (
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" className="gap-2" disabled={isStopping} onClick={stopActiveTask}>
                      <X size={16} />
                      {copy.stopTask}
                    </Button>
                    <span className="text-xs text-muted-foreground">{copy.sending}</span>
                  </div>
                ) : (
                  <Button className="gap-2" disabled={(!prompt.trim() && attachments.length === 0) || isSending || isUploadingAttachments || isActiveRunRunning} onClick={sendMessage}>
                    <Send size={16} />
                    {activeRunMode === "assistant" ? copy.runAssistant : activeRunMode === "agent_group" ? agentGroupCopy.runAgentGroup : copy.send}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={cn(isAdvanced ? "flex min-h-0 flex-1 flex-col" : "rounded-lg border bg-card text-card-foreground shadow-sm")}>
            <div className={cn(isAdvanced ? (isActiveRunRunning && activeRun ? "shrink-0 pb-2" : "sr-only") : "flex flex-col space-y-1.5 p-6")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className={cn(isAdvanced && "sr-only")}>{copy.conversation}</CardTitle>
                {isAdvanced && (
                  <div className="flex flex-wrap items-center gap-2">
                    {isActiveRunRunning && activeRun && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
                        {runStatusText(activeRun, copy)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={cn(isAdvanced ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-4 p-6 pt-0")}>
              <div className={cn(isAdvanced ? "min-h-[360px] flex-1 space-y-3 py-3" : "min-h-[360px] space-y-3 rounded-md border p-3")}>
                {!currentSession || currentSession.messages.length === 0 ? (
                  <div className="py-20 text-center text-sm text-muted-foreground">{copy.noMessages}</div>
                ) : (
                  <>
                    {currentSession.messages.map((message) => {
                      if (message.role === "assistant" && editingMessageID !== message.id) {
                        return (
                          <AssistantMessageSequence
                            key={message.id}
                            message={message}
                            activeRun={activeRun}
                            copy={copy}
                            approvalTasks={pendingConnectorApprovals}
                            decidingTaskID={decidingConnectorTaskID}
                            onDecide={decideConnectorApproval}
                            onEdit={() => beginEditMessage(message)}
                            onDelete={() => deleteMessage(message.id)}
                            editLabel={copy.editMessage}
                            deleteLabel={copy.deleteMessage}
                            controlsHidden={isActiveRunRunning && activeRun?.assistant_message_id === message.id}
                          />
                        )
                      }
                      return (
                        <div key={message.id} className="space-y-1.5">
                          <div className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                            <div className="group w-fit max-w-full rounded-md border bg-background p-3 text-sm">
                              <div className="flex items-start gap-2">
                                {message.role === "user" ? (
                                  <User className="mt-0.5 h-4 w-4 shrink-0" />
                                ) : (
                                  <Bot className="mt-0.5 h-4 w-4 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  {editingMessageID === message.id ? (
                                    <div className="space-y-2">
                                      <textarea
                                        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                        value={editingText}
                                        onChange={(event) => setEditingText(event.target.value)}
                                      />
                                      {editingAttachments.length > 0 && (
                                        <AttachmentChips
                                          attachments={editingAttachments}
                                          removeLabel={copy.removeAttachment}
                                          onRemove={removeEditingAttachment}
                                        />
                                      )}
                                      {isAdvanced && message.role === "user" && (
                                        <div className="flex flex-wrap items-center gap-2">
                                          {attachmentMenuButton("editor")}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <MessageContent
                                      message={message}
                                      activeRun={activeRun}
                                      isAdvanced={isAdvanced}
                                      copy={copy}
                                      approvalTasks={pendingConnectorApprovals}
                                      decidingTaskID={decidingConnectorTaskID}
                                      onDecide={decideConnectorApproval}
                                    />
                                  )}
                                </div>
                              </div>
                              <div
                                className={cn(
                                  "mt-2 flex justify-end gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                                  editingMessageID === message.id && "opacity-100",
                                  message.role === "assistant" && isActiveRunRunning && activeRun?.assistant_message_id === message.id && "pointer-events-none opacity-0"
                                )}
                              >
                                {editingMessageID === message.id ? (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={saveEditedMessage} title={copy.saveMessage}>
                                      <Check size={15} />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={cancelEdit} title={copy.cancelEdit}>
                                      <X size={15} />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => beginEditMessage(message)} title={copy.editMessage}>
                                      <Pencil size={14} />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteMessage(message.id)} title={copy.deleteMessage}>
                                      <Trash2 size={14} />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
                <div ref={messagesEndRef} />
                {showJumpToLatest && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="sticky bottom-4 z-10 ml-auto flex gap-1 shadow-sm"
                    onClick={() => scrollMessagesToLatest()}
                  >
                    <ArrowDown size={14} />
                    {copy.jumpToLatest}
                  </Button>
                )}
              </div>

              {attachments.length > 0 && (
                <AttachmentChips attachments={attachments} removeLabel={copy.removeAttachment} onRemove={removeAttachment} />
              )}

              {isAdvanced ? (
                <div className="sticky bottom-0 -mx-4 space-y-2 border-t bg-background px-4 py-3 sm:mx-0 sm:rounded-t-md sm:border sm:bg-card">
                  {pendingConnectorApprovals.length > 0 && (
                    <PendingConnectorApprovalsPanel
                      tasks={pendingConnectorApprovals}
                      copy={copy}
                      decidingTaskID={decidingConnectorTaskID}
                      onDecide={decideConnectorApproval}
                    />
                  )}
                  <div className="flex items-end gap-2">
                    {attachmentMenuButton("composer")}
                    {agentWorkStatusButton()}
                    <div className="relative min-w-0 flex-1">
                      <textarea
                        ref={composerTextareaRef}
                        className="h-10 max-h-40 min-h-10 w-full resize-none overflow-y-auto rounded-md border bg-background px-3 py-0 text-sm leading-10 outline-none focus:ring-2 focus:ring-ring"
                        rows={1}
                        value={prompt}
                        placeholder={activeRunMode === "assistant" ? copy.assistantPromptPlaceholder : activeRunMode === "agent_group" ? agentGroupCopy.promptPlaceholder : copy.promptPlaceholder}
                        disabled={isActiveRunRunning}
                        onChange={handleComposerPromptChange}
                        onKeyDown={handleComposerPromptKeyDown}
                        onClick={(event) => updateAgentMention(prompt, event.currentTarget.selectionStart)}
                      />
                      {agentMentionPicker()}
                    </div>
                    {advancedComposerActionButton()}
                  </div>
                  <div className={cn("grid gap-2", activeRunMode === "agent_group" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
                    {composerModeControl()}
                    {composerDeviceControl()}
                    {activeRunMode === "agent_group" && composerAgentGroupControl()}
                    {composerWorkspaceControl()}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-ring"
                    value={prompt}
                    placeholder={copy.promptPlaceholder}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    className="gap-2 self-end"
                    disabled={(!prompt.trim() && attachments.length === 0) || isSending || isUploadingAttachments || isActiveRunRunning}
                    onClick={sendMessage}
                  >
                    <Send size={16} />
                    {isSending || isActiveRunRunning ? copy.sending : copy.send}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      {isAdvanced && (
        <Dialog open={isFilePickerOpen} onOpenChange={setIsFilePickerOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{fileCopy.selectFile}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {storedFiles.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
                  {fileCopy.noFiles}
                </div>
              ) : (
                storedFiles.map((file) => {
                  const targetAttachments = filePickerTarget === "editor" ? editingAttachments : attachments
                  const selected = targetAttachments.some((attachment) => attachment.storage_id === file.id)
                  return (
                    <div key={file.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">{file.name}</span>
                          {file.text_available && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{fileCopy.text}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{file.type || "application/octet-stream"}</span>
                          <span>{formatBytes(file.size)}</span>
                        </div>
                      </div>
                      <Button
                        variant={selected ? "outline" : "default"}
                        disabled={selected || selectingFileID === file.id}
                        onClick={() => selectStoredFile(file)}
                      >
                        {selected ? fileCopy.selected : selectingFileID === file.id ? fileCopy.loading : fileCopy.useFile}
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsFilePickerOpen(false)}>
                {fileCopy.close}
              </Button>
              <Button asChild variant="outline">
                <Link to="/chat/files">{fileCopy.manageFiles}</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isAdvanced && (
        <AgentWorkDialog
          open={isAgentWorkOpen}
          onOpenChange={setIsAgentWorkOpen}
          work={agentWork || fallbackAgentWork}
          selectedAgentID={selectedWorkAgentID}
          onSelectAgent={setSelectedWorkAgentID}
          copy={agentGroupCopy}
          chatCopy={copy}
          decidingTaskID={decidingConnectorTaskID}
          onDecideConnectorTask={decideConnectorApproval}
        />
      )}
      {isAdvanced && (
        <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.advancedConfig}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                {([
                  ["basic", copy.basicSettings],
                  ["advanced", copy.advancedModelSettings],
                  ...(activeRunMode !== "agent_group" ? ([["agent", copy.agent]] as const) : []),
                  ["agent_group", agentGroupCopy.agentGroups],
                  ["skills", copy.skills],
                  ...(currentAdvancedSettings.assistant_mcp_tools_enabled ? ([["mcp", copy.mcpServers]] as const) : []),
                  ...(assistantConnectorToolsEnabled && activeRunMode !== "chat" ? ([["device", copy.devices]] as const) : []),
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      if (tab === "device") {
                        setPendingConnectorDeviceID(currentSession?.connector_device_id || connectorDevices[0]?.id || "")
                        setPendingConnectorWorkspace(currentSession?.connector_workspace_path || "")
                      }
                      setConfigTab(tab)
                    }}
                    className={cn(
                      "h-9 rounded-md border px-3 text-sm transition-colors hover:bg-muted",
                      configTab === tab && "border-primary bg-primary/5 text-primary"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {configTab === "basic" && (
                <div className="space-y-4 rounded-md border p-3">
                  {activeRunMode !== "agent_group" && (
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{copy.sessionModel}</span>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={activeModelName}
                        onChange={(event) => handleSessionModelChange(event.target.value)}
                      >
                        <option value="">{copy.selectModel}</option>
                        {modelSelectOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.channel}</span>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={selectedUserChannel?.id || ""}
                      onChange={(event) => {
                        const nextID = Number(event.target.value) || 0
                        setSelectedUserChannelID(nextID)
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, user_channel_id: nextID || undefined }), { persist: true })
                        }
                      }}
                    >
                      <option value="">{selectableUserChannels.length ? copy.selectChannel : copy.noChannels}</option>
                      {selectableUserChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {configTab === "advanced" && (
                <div className="space-y-4 rounded-md border p-3">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.temperature}</span>
                    <input
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={currentSession?.temperature ?? ""}
                      onChange={(event) => {
                        const value = event.target.value === "" ? null : Number(event.target.value)
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, temperature: value }), { persist: true })
                        }
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.reasoningEffort}</span>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={currentSession?.reasoning_effort || ""}
                      onChange={(event) => {
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, reasoning_effort: event.target.value }), { persist: true })
                        }
                      }}
                    >
                      <option value="">{copy.reasoningDefault}</option>
                      <option value="minimal">{copy.reasoningMinimal}</option>
                      <option value="low">{copy.reasoningLow}</option>
                      <option value="medium">{copy.reasoningMedium}</option>
                      <option value="high">{copy.reasoningHigh}</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.maxTokens}</span>
                    <input
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      type="number"
                      min={0}
                      max={200000}
                      step={1}
                      value={currentSession?.max_tokens || ""}
                      placeholder={copy.maxTokensPlaceholder}
                      onChange={(event) => {
                        const value = Math.max(0, Number(event.target.value) || 0)
                        if (currentSession) {
                          updateSession(currentSession.id, (session) => ({ ...session, max_tokens: value }), { persist: true })
                        }
                      }}
                    />
                  </label>
                </div>
              )}

              {configTab === "agent" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">{copy.addedAgent}</div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/agents">{copy.manageAgents}</Link>
                    </Button>
                  </div>
                  {selectedAgent ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{selectedAgent.name}</div>
                        {selectedAgent.prompt && <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{selectedAgent.prompt}</div>}
                      </div>
                      {selectedAgent.id !== defaultAgentID && (
                        <Button variant="ghost" size="sm" onClick={removeAgentFromSession} title={copy.remove}>
                          <X size={15} />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noAgentAdded}</div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={pendingAgentID}
                      onChange={(event) => setPendingAgentID(event.target.value)}
                    >
                      {agents.length === 0 && <option value="">{copy.noAgents}</option>}
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    <Button className="gap-2" disabled={!pendingAgentID} onClick={() => setSessionAgent(pendingAgentID)}>
                      <Check size={16} />
                      {selectedAgent ? copy.replaceAgent : copy.setAgent}
                    </Button>
                  </div>
                </div>
              )}

              {configTab === "skills" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles size={15} />
                      {copy.addedSkills}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/skills">{copy.manageSkills}</Link>
                    </Button>
                  </div>
                  {selectedSkills.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noSkillsAdded}</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedSkills.map((skill) => (
                        <div key={skill.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{skill.name}</div>
                            {skill.description && <div className="mt-1 truncate text-xs text-muted-foreground">{skill.description}</div>}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeSessionSkill(skill.id)} title={copy.remove}>
                            <X size={15} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={pendingSkillID}
                      onChange={(event) => setPendingSkillID(event.target.value)}
                    >
                      <option value="">{availableSkillsToAdd.length ? copy.selectSkills : copy.noSkills}</option>
                      {availableSkillsToAdd.map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                    </select>
                    <Button className="gap-2" disabled={!pendingSkillID} onClick={() => addSessionSkill(pendingSkillID)}>
                      <Plus size={16} />
                      {copy.add}
                    </Button>
                  </div>
                </div>
              )}

              {configTab === "mcp" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Server size={15} />
                      {copy.addedMCPServers}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/mcp">{copy.manageMCP}</Link>
                    </Button>
                  </div>
                  {sessionMCPServers.length === 0 && skillMCPServerIDs.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noMCPServersAdded}</div>
                  ) : (
                    <div className="space-y-2">
                      {sessionMCPServers.map((server) => (
                        <div key={server.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{server.name}</div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{server.url}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeSessionMCPServer(server.id)} title={copy.remove}>
                            <X size={15} />
                          </Button>
                        </div>
                      ))}
                      {enabledMCPServers
                        .filter((server) => skillMCPServerIDs.includes(server.id) && !currentSession?.mcp_server_ids.includes(server.id))
                        .map((server) => (
                          <div key={`skill-${server.id}`} className="rounded-md border bg-muted/40 p-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium">{server.name}</span>
                              <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{copy.fromSkill}</span>
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{server.url}</div>
                          </div>
                        ))}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={pendingMCPServerID}
                      onChange={(event) => setPendingMCPServerID(event.target.value)}
                    >
                      <option value="">{availableMCPServersToAdd.length ? copy.selectMCPServer : copy.noMCPServers}</option>
                      {availableMCPServersToAdd.map((server) => (
                        <option key={server.id} value={server.id}>
                          {server.name}
                        </option>
                      ))}
                    </select>
                    <Button className="gap-2" disabled={!pendingMCPServerID} onClick={() => addSessionMCPServer(pendingMCPServerID)}>
                      <Plus size={16} />
                      {copy.add}
                    </Button>
                  </div>
                </div>
              )}

              {configTab === "agent_group" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium">{agentGroupCopy.agentGroups}</div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/agent-groups">{agentGroupCopy.manageGroups}</Link>
                    </Button>
                  </div>
                  {currentAgentGroup ? (
                    <div className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{currentAgentGroup.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{agentGroupCopy.chiefCount.replace("{count}", String(agentGroupChiefCount(currentAgentGroup)))}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSessionAgentGroup("")} title={copy.remove}>
                          <X size={15} />
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {currentAgentGroup.agents.map((agent) => (
                          <span key={agent.id} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                            @{agent.name || agent.id} · {agent.type}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{agentGroupCopy.noGroupSelected}</div>
                  )}
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{agentGroupCopy.selectGroup}</span>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={currentSession?.agent_group_id || ""}
                      disabled={isFetchingAgentGroups}
                      onChange={(event) => setSessionAgentGroup(event.target.value)}
                    >
                      <option value="">{agentGroups.length ? agentGroupCopy.selectGroup : agentGroupCopy.noGroups}</option>
                      {agentGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {configTab === "device" && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Server size={15} />
                      {copy.sessionDevice}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/chat/devices">{copy.manageDevices}</Link>
                    </Button>
                  </div>

                  {selectedConnectorDevice ? (
                    <div className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{selectedConnectorDevice.name}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{currentSession?.connector_workspace_path || copy.unrestrictedWorkspace}</div>
                        {selectedConnectorDevice.remark && <div className="mt-1 truncate text-xs text-muted-foreground">{selectedConnectorDevice.remark}</div>}
                        <div className={cn("mt-1 text-xs", selectedConnectorDevice.online ? "text-emerald-600" : "text-muted-foreground")}>
                          {selectedConnectorDevice.online ? copy.deviceOnline : copy.deviceOffline}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={clearSessionConnector} title={copy.remove}>
                        <X size={15} />
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{copy.noDeviceSelected}</div>
                  )}

                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles size={15} />
                        {copy.workspaceSkills}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={isRefreshingWorkspaceSkills || !(currentSession?.connector_device_id || pendingConnectorDeviceID)}
                        onClick={refreshWorkspaceSkills}
                      >
                        <Sparkles size={15} />
                        {isRefreshingWorkspaceSkills ? copy.refreshingWorkspaceSkills : copy.refreshWorkspaceSkills}
                      </Button>
                    </div>
                    {workspaceSkills.length === 0 ? (
                      <div className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{copy.noWorkspaceSkills}</div>
                    ) : (
                      <div className="space-y-2">
                        {workspaceSkills.map((skill) => (
                          <div key={skill.path} className="rounded-md border p-3">
                            <div className="flex min-w-0 items-center gap-2 text-sm">
                              <span className="truncate font-medium">{skill.name}</span>
                              {skill.truncated && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{copy.truncated}</span>}
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground">{skill.path}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{copy.selectDevice}</span>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={pendingConnectorDeviceID}
                        onChange={(event) => setPendingConnectorDeviceID(event.target.value)}
                      >
                        <option value="">{selectableConnectorDevices.length ? copy.selectDevice : copy.noDevices}</option>
                        {selectableConnectorDevices.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.name}{device.online ? "" : ` (${copy.deviceOffline})`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">{copy.workspacePath}</span>
                      <input
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={pendingConnectorWorkspace}
                        placeholder={copy.workspacePathPlaceholder}
                        onChange={(event) => setPendingConnectorWorkspace(event.target.value)}
                      />
                    </label>
                    <div className="flex items-end">
                      <Button
                        className="w-full gap-2"
                        disabled={!pendingConnectorDeviceID || !pendingConnectorWorkspace.trim()}
                        onClick={() => setSessionConnector(
                          pendingConnectorDeviceID,
                          pendingConnectorWorkspace.trim(),
                          pendingConnectorAutoApprove,
                          commandPrefixesFromText(pendingConnectorCommandPrefixes)
                        )}
                      >
                        <Check size={16} />
                        {copy.setDevice}
                      </Button>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={pendingConnectorAutoApprove}
                      onChange={(event) => setPendingConnectorAutoApprove(event.target.checked)}
                    />
                    <span>
                      <span className="block font-medium">{copy.connectorAutoApprove}</span>
                    </span>
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.connectorCommandPrefixes}</span>
                    <textarea
                      className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={pendingConnectorCommandPrefixes}
                      placeholder={copy.connectorCommandPrefixesPlaceholder}
                      onChange={(event) => setPendingConnectorCommandPrefixes(event.target.value)}
                    />
                    <span className="block text-xs text-muted-foreground">{copy.connectorCommandPrefixesHint}</span>
                  </label>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setIsConfigOpen(false)}>{copy.done}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; language: string; text: string }
  | { type: "hr" }

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content)
  if (blocks.length === 0) {
    return null
  }
  return (
    <div className="space-y-2 break-words leading-relaxed">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
    </div>
  )
}

function UserMessageContent({ content }: { content: string }) {
  const parsed = parseMessageAttachments(content)
  return (
    <div className="space-y-2">
      {parsed.text && <MarkdownContent content={parsed.text} />}
      {parsed.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parsed.attachments.map((attachment, index) => (
            <div
              key={`${attachment.storageID || attachment.name}-${index}`}
              className="flex max-w-full items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs shadow-sm"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{attachment.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{attachment.type || "application/octet-stream"}</span>
                  <span>{attachment.sizeLabel || "0 B"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AttachmentChips({
  attachments,
  removeLabel,
  onRemove,
}: {
  attachments: ChatAttachment[]
  removeLabel: string
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <Paperclip size={14} className="shrink-0" />
          <span className="truncate">{attachment.name}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.size)}</span>
          <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => onRemove(attachment.id)} aria-label={removeLabel}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

function AssistantMessageSequence({
  message,
  activeRun,
  copy,
  approvalTasks,
  decidingTaskID,
  onDecide,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  controlsHidden,
}: {
  message: ChatMessage
  activeRun?: ChatRun
  copy: ChatCopy
  approvalTasks: ConnectorApprovalTask[]
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
  onEdit: () => void
  onDelete: () => void
  editLabel: string
  deleteLabel: string
  controlsHidden: boolean
}) {
  const parts = messageContentParts(message, activeRun, copy)
  const toolCallsByRound = groupToolCallsByRound(message.tool_calls || [])
  const rounds = orderedMessageRounds(parts, toolCallsByRound)
  if (rounds.length === 0) {
    return null
  }
  return (
    <div className="space-y-1.5">
      {rounds.map((round) => {
        const roundParts = parts.filter((part) => normalizedRound(part.round) === round)
        const roundToolCalls = toolCallsByRound.get(round) || []
        const roundApprovalTasks = roundToolCalls.some((toolCall) => toolCall.status === "approval_required") ? approvalTasks : []
        return (
          <div key={round} className="space-y-1.5">
            {roundParts.map((part, index) => (
              <div key={`${round}-part-${index}`} className="flex justify-start">
                <div className="group w-fit max-w-full rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Bot className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <MarkdownContent content={part.content} />
                    </div>
                  </div>
                  <div
                    className={cn(
                      "mt-2 flex justify-end gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                      controlsHidden && "pointer-events-none opacity-0"
                    )}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title={editLabel}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={onDelete} title={deleteLabel}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {roundToolCalls.length > 0 && (
              <div className="flex justify-start">
                <div className="w-full max-w-3xl pl-1">
                  <ToolCallRounds
                    toolCalls={roundToolCalls}
                    copy={copy}
                    approvalTasks={roundApprovalTasks}
                    decidingTaskID={decidingTaskID}
                    onDecide={onDecide}
                    collapseCompleted
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MessageContent({
  message,
  activeRun,
  isAdvanced,
  copy,
  approvalTasks,
  decidingTaskID,
  onDecide,
  hideToolCalls = false,
}: {
  message: ChatMessage
  activeRun?: ChatRun
  isAdvanced: boolean
  copy: ChatCopy
  approvalTasks: ConnectorApprovalTask[]
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
  hideToolCalls?: boolean
}) {
  if (message.role !== "assistant") {
    return <UserMessageContent content={messageDisplayContent(message, activeRun, copy)} />
  }

  const parts = messageContentParts(message, activeRun, copy)
  if (hideToolCalls) {
    if (parts.length === 0) {
      return <MarkdownContent content={messageDisplayContent(message, activeRun, copy)} />
    }
    return (
      <div className="space-y-2">
        {parts.map((part, index) => (
          <MarkdownContent key={`${normalizedRound(part.round)}-text-${index}`} content={part.content} />
        ))}
      </div>
    )
  }
  const toolCallsByRound = groupToolCallsByRound(message.tool_calls || [])
  const rounds = orderedMessageRounds(parts, toolCallsByRound)
  if (rounds.length === 0) {
    return <MarkdownContent content={messageDisplayContent(message, activeRun, copy)} />
  }

  return (
    <div className="space-y-3">
      {rounds.map((round) => {
        const roundParts = parts.filter((part) => normalizedRound(part.round) === round)
        const roundToolCalls = toolCallsByRound.get(round) || []
        const roundApprovalTasks =
          isAdvanced && roundToolCalls.some((toolCall) => toolCall.status === "approval_required") ? approvalTasks : []
        return (
          <div key={round} className="space-y-2">
            {roundParts.map((part, index) => (
              <MarkdownContent key={`${round}-text-${index}`} content={part.content} />
            ))}
            {roundToolCalls.length > 0 && (
              <ToolCallRounds
                toolCalls={roundToolCalls}
                copy={copy}
                approvalTasks={roundApprovalTasks}
                decidingTaskID={decidingTaskID}
                onDecide={onDecide}
                collapseCompleted
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ToolCallRounds({
  toolCalls,
  copy,
  approvalTasks = [],
  decidingTaskID = "",
  onDecide,
  collapseCompleted = false,
}: {
  toolCalls: ChatToolCall[]
  copy: ChatCopy
  approvalTasks?: ConnectorApprovalTask[]
  decidingTaskID?: string
  onDecide?: (taskID: string, approved: boolean) => void
  collapseCompleted?: boolean
}) {
  if (toolCalls.length === 0) {
    return null
  }
  return (
    <div className="mb-2 space-y-2">
      {toolCalls.map((toolCall) => (
        <ToolCallDetails
          key={toolCall.id}
          toolCall={toolCall}
          copy={copy}
          approvalTask={findConnectorApprovalTask(toolCall, approvalTasks)}
          decidingTaskID={decidingTaskID}
          onDecide={onDecide}
          collapseCompleted={collapseCompleted}
        />
      ))}
    </div>
  )
}

function ToolCallDetails({
  toolCall,
  copy,
  approvalTask,
  decidingTaskID = "",
  onDecide,
  collapseCompleted = false,
}: {
  toolCall: ChatToolCall
  copy: ChatCopy
  approvalTask?: ConnectorApprovalTask
  decidingTaskID?: string
  onDecide?: (taskID: string, approved: boolean) => void
  collapseCompleted?: boolean
}) {
  const shouldAutoOpen = toolCall.status === "running" || toolCall.status === "approval_required"
  const [open, setOpen] = useState(collapseCompleted ? shouldAutoOpen : true)
  const builtinKind = builtinToolKind(toolCall)
  const path = stringArgument(toolCall.arguments, "path")
  const content = stringArgument(toolCall.arguments, "content")
  const command = stringArgument(toolCall.arguments, "command")
  const query = stringArgument(toolCall.arguments, "query")
  const url = stringArgument(toolCall.arguments, "url")
  const domainName = stringArgument(toolCall.arguments, "domain_name")
  const siteID = stringArgument(toolCall.arguments, "site_id")
  const replacements = replacementEntriesFromArguments(toolCall.arguments)
  const toolTarget = builtinKind === "search" ? query : builtinKind === "fetch" ? url : command
  const siteTitle = staticSiteToolTitle(toolCall, domainName, siteID)
  const title = builtinKind
    ? builtinToolTitle(builtinKind, path, toolTarget, copy, booleanArgument(toolCall.arguments, "preview_old_content_available"))
    : siteTitle || toolLabel(toolCall)

  useEffect(() => {
    setOpen(collapseCompleted ? shouldAutoOpen : true)
  }, [collapseCompleted, shouldAutoOpen, toolCall.id])

  return (
    <details
      className="group rounded-md px-1 py-1 text-muted-foreground"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[11px]", toolStatusClassName(toolCall.status))}>
          {toolStatusLabel(toolCall.status, copy)}
        </span>
        <ArrowDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </summary>
      <ConnectorApprovalControls
        task={approvalTask}
        copy={copy}
        decidingTaskID={decidingTaskID}
        onDecide={onDecide}
        className="mt-2"
      />
      {builtinKind === "write" ? (
        <div className="mt-2 overflow-hidden rounded-md bg-muted/40">
          <LineDiff oldText={stringArgument(toolCall.arguments, "preview_old_content")} newText={content} />
        </div>
      ) : builtinKind === "replace" ? (
        <ReplacementDiffList entries={replacements} copy={copy} />
      ) : builtinKind === "read" || builtinKind === "list" ? (
        <ToolResultBlock result={toolCall.result} copy={copy} />
      ) : builtinKind === "command" || builtinKind === "search" || builtinKind === "fetch" ? (
        <ToolResultBlock result={toolCall.result} copy={copy} />
      ) : (
        <>
          <div className="mt-2 text-[11px] font-medium text-muted-foreground">{copy.toolArguments}</div>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
            {formatToolArguments(toolCall.arguments)}
          </pre>
        </>
      )}
    </details>
  )
}

function ToolResultBlock({ result, copy }: { result?: string; copy: ChatCopy }) {
  const text = typeof result === "string" ? result.trim() : ""
  if (!text) {
    return <div className="mt-2 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">{copy.emptyResponse}</div>
  }
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{copy.toolResult}</div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

function ConnectorApprovalControls({
  task,
  copy,
  decidingTaskID,
  onDecide,
  className,
}: {
  task?: ConnectorApprovalTask
  copy: ChatCopy
  decidingTaskID: string
  onDecide?: (taskID: string, approved: boolean) => void
  className?: string
}) {
  if (!task || !onDecide) {
    return null
  }
  return (
    <div className={cn("flex shrink-0 flex-wrap justify-end gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        disabled={Boolean(decidingTaskID)}
        onClick={() => onDecide(task.id, false)}
      >
        <X size={14} />
        {copy.rejectConnectorTask}
      </Button>
      <Button
        size="sm"
        disabled={Boolean(decidingTaskID)}
        onClick={() => onDecide(task.id, true)}
      >
        <Check size={14} />
        {copy.approveConnectorTask}
      </Button>
    </div>
  )
}

function PendingConnectorApprovalsPanel({
  tasks,
  copy,
  decidingTaskID,
  onDecide,
}: {
  tasks: ConnectorApprovalTask[]
  copy: ChatCopy
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
}) {
  if (tasks.length === 0) {
    return null
  }
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <div className="font-medium text-amber-900 dark:text-amber-200">{copy.connectorApprovalTitle}</div>
      <div className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">{copy.connectorApprovalDescription}</div>
      <div className="mt-3 space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-md border bg-background p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-xs">
                <div className="font-medium">{connectorApprovalTaskTitle(task)}</div>
                <div className="mt-1 truncate text-muted-foreground">{connectorApprovalTaskSubtitle(task)}</div>
              </div>
              <ConnectorApprovalControls
                task={task}
                copy={copy}
                decidingTaskID={decidingTaskID}
                onDecide={onDecide}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentWorkDialog({
  open,
  onOpenChange,
  work,
  selectedAgentID,
  onSelectAgent,
  copy,
  chatCopy,
  decidingTaskID,
  onDecideConnectorTask,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  work?: AgentWorkResponse
  selectedAgentID: string
  onSelectAgent: (agentID: string) => void
  copy: AgentGroupCopy
  chatCopy: ChatCopy
  decidingTaskID: string
  onDecideConnectorTask: (taskID: string, approved: boolean) => void
}) {
  const agents = work?.agents || []
  const connectorTasks = work?.connector_tasks || []
  const activeAgent = agents.find((agent) => agent.agent_id === selectedAgentID) || agents[0]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{copy.workStatus}</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 gap-3 md:grid-cols-[16rem_1fr]">
          <div className="max-h-[65vh] space-y-2 overflow-y-auto rounded-md border p-2">
            {agents.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">{copy.noWorkStatus}</div>
            ) : (
              agents.map((agent) => {
                const selected = (selectedAgentID || activeAgent?.agent_id) === agent.agent_id
                return (
                  <button
                    key={agent.agent_id}
                    type="button"
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                      selected && "border-primary bg-primary/5 text-primary"
                    )}
                    onClick={() => onSelectAgent(agent.agent_id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{agent.agent_name || agent.agent_id}</span>
                      <span className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                        agent.working ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {agent.working ? copy.working : copy.idle}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {agent.agent_type} · {agentWorkStatusText(agent.status, copy)}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="flex max-h-[65vh] min-h-0 flex-col rounded-md border">
            {activeAgent ? (
              <>
                <div className="border-b px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{activeAgent.agent_name || activeAgent.agent_id}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{activeAgent.agent_type}</span>
                    <span className={cn("rounded px-2 py-0.5 text-xs", activeAgent.working ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {activeAgent.working ? copy.working : copy.idle}
                    </span>
                  </div>
                  {activeAgent.updated_at && (
                    <div className="mt-1 text-xs text-muted-foreground">{copy.updatedAt}: {formatAgentWorkTime(activeAgent.updated_at)}</div>
                  )}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {connectorTasks.length > 0 && (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium">{copy.roleTool}</span>
                        <span className="text-muted-foreground">{connectorTasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {connectorTasks.map((task) => (
                          <AgentWorkConnectorTaskItem
                            key={task.id}
                            task={task}
                            runID={work?.run_id || ""}
                            copy={copy}
                            chatCopy={chatCopy}
                            decidingTaskID={decidingTaskID}
                            onDecide={onDecideConnectorTask}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {activeAgent.messages.length === 0 ? (
                    <div className="rounded-md border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">{copy.noWorkMessages}</div>
                  ) : (
                    activeAgent.messages.map((message, index) => (
                      <div key={`${message.created_at || index}-${index}`} className="rounded-md border bg-background p-3 text-sm">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5">{agentWorkRoleLabel(message.role, copy)}</span>
                          {message.tool && <span>{message.tool}</span>}
                          {message.status && <span>{agentWorkStatusText(message.status, copy)}</span>}
                          {message.created_at && <span className="ml-auto">{formatAgentWorkTime(message.created_at)}</span>}
                        </div>
                        <MarkdownContent content={message.content} />
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[18rem] items-center justify-center px-3 text-sm text-muted-foreground">{copy.noWorkStatus}</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AgentWorkConnectorTaskItem({
  task,
  runID,
  copy,
  chatCopy,
  decidingTaskID,
  onDecide,
}: {
  task: AgentWorkConnectorTask
  runID: string
  copy: AgentGroupCopy
  chatCopy: ChatCopy
  decidingTaskID: string
  onDecide: (taskID: string, approved: boolean) => void
}) {
  const pending = task.status === "pending_approval"
  const approvalTask = agentWorkConnectorTaskAsApprovalTask(task, runID)
  const target =
    stringArgument(task.payload, "path") ||
    stringArgument(task.payload, "command") ||
    stringArgument(task.payload, "url") ||
    stringArgument(task.payload, "query")
  const payloadText = JSON.stringify(task.payload, null, 2)
  return (
    <div className="rounded-md border bg-background p-2 text-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{task.action || "connector"}</span>
            <span className={cn("rounded px-1.5 py-0.5", pending ? "bg-amber-500/10 text-amber-700 dark:text-amber-200" : "bg-muted text-muted-foreground")}>
              {agentWorkStatusText(task.status, copy)}
            </span>
            {task.updated_at && <span className="text-muted-foreground">{formatAgentWorkTime(task.updated_at)}</span>}
          </div>
          <div className="mt-1 truncate text-muted-foreground">
            {[task.device_name, task.workspace_path, target].filter(Boolean).join(" · ") || task.id}
          </div>
        </div>
        {pending && (
          <ConnectorApprovalControls
            task={approvalTask}
            copy={chatCopy}
            decidingTaskID={decidingTaskID}
            onDecide={onDecide}
          />
        )}
      </div>
      {payloadText !== "{}" && (
        <pre className="mt-2 max-h-28 overflow-auto rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{payloadText}</pre>
      )}
      {(task.result || task.error_message) && (
        <div className={cn("mt-2 whitespace-pre-wrap rounded px-2 py-1", task.error_message ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
          {task.error_message || task.result}
        </div>
      )}
    </div>
  )
}

function agentWorkConnectorTaskAsApprovalTask(task: AgentWorkConnectorTask, runID: string): ConnectorApprovalTask {
  return {
    id: task.id,
    device_id: task.device_id,
    device_name: task.device_name,
    run_id: runID,
    action: task.action,
    workspace_path: task.workspace_path,
    payload: task.payload,
    created_at: task.created_at,
  }
}

function ReplacementDiffList({ entries, copy }: { entries: ReplacementEntry[]; copy: ChatCopy }) {
  if (entries.length === 0) {
    return <div className="mt-2 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">{copy.toolArguments}</div>
  }
  return (
    <div className="mt-2 space-y-3">
      {entries.map((entry, index) => (
        <div key={`${entry.path}-${index}`} className="overflow-hidden rounded-md border">
          {entry.path && <div className="border-b bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">{entry.path}</div>}
          <LineDiff oldText={entry.oldText} newText={entry.newText} />
        </div>
      ))}
    </div>
  )
}

function LineDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const hunks = diffHunks(oldText, newText, 2)
  return (
    <div className="max-h-96 overflow-auto bg-background py-1 font-mono text-xs">
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          {hunkIndex > 0 && <div className="px-2 py-1 text-muted-foreground">...</div>}
          {hunk.map((line, lineIndex) => (
            <div
              key={`${hunkIndex}-${lineIndex}`}
              className={cn(
                "grid grid-cols-[1.5rem_1fr] gap-2 whitespace-pre-wrap break-words px-2 py-0.5",
                line.type === "remove" && "bg-red-50 text-red-800",
                line.type === "add" && "bg-emerald-50 text-emerald-800",
                line.type === "context" && "text-muted-foreground"
              )}
            >
              <span className="select-none text-right opacity-70">{line.type === "remove" ? "-" : line.type === "add" ? "+" : " "}</span>
              <span>{line.text || " "}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let index = 0

  const flushParagraph = () => {
    const text = paragraph.join("\n").trim()
    if (text) {
      blocks.push({ type: "paragraph", text })
    }
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    const fence = trimmed.match(/^```([\w-]*)\s*$/)
    if (fence) {
      flushParagraph()
      const language = fence[1] || ""
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) {
        index += 1
      }
      blocks.push({ type: "code", language, text: codeLines.join("\n") })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph()
      blocks.push({ type: "hr" })
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
    if (unordered) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)$/)
        if (!item) {
          break
        }
        items.push(item[1].trim())
        index += 1
      }
      blocks.push({ type: "ul", items })
      continue
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/)
        if (!item) {
          break
        }
        items.push(item[1].trim())
        index += 1
      }
      blocks.push({ type: "ol", items })
      continue
    }

    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      const quoteLines: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*>\s?(.*)$/)
        if (!item) {
          break
        }
        quoteLines.push(item[1])
        index += 1
      }
      blocks.push({ type: "quote", lines: quoteLines })
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flushParagraph()
  return blocks
}

function renderMarkdownBlock(block: MarkdownBlock, index: number) {
  switch (block.type) {
    case "heading": {
      const className = cn("font-semibold leading-snug", block.level <= 2 ? "text-base" : "text-sm")
      if (block.level === 1) {
        return <h1 key={index} className={className}>{renderInlineMarkdown(block.text, `h-${index}`)}</h1>
      }
      if (block.level === 2) {
        return <h2 key={index} className={className}>{renderInlineMarkdown(block.text, `h-${index}`)}</h2>
      }
      return <h3 key={index} className={className}>{renderInlineMarkdown(block.text, `h-${index}`)}</h3>
    }
    case "quote":
      return (
        <blockquote key={index} className="border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground">
          {block.lines.map((line, lineIndex) => (
            <div key={lineIndex}>{renderInlineMarkdown(line, `q-${index}-${lineIndex}`)}</div>
          ))}
        </blockquote>
      )
    case "ul":
      return (
        <ul key={index} className="list-disc space-y-1 pl-5">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item, `ul-${index}-${itemIndex}`)}</li>
          ))}
        </ul>
      )
    case "ol":
      return (
        <ol key={index} className="list-decimal space-y-1 pl-5">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineMarkdown(item, `ol-${index}-${itemIndex}`)}</li>
          ))}
        </ol>
      )
    case "code":
      return (
        <div key={index} className="overflow-hidden rounded-md border bg-muted/50">
          {block.language && <div className="border-b px-3 py-1 text-[11px] uppercase text-muted-foreground">{block.language}</div>}
          <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
            <code>{block.text}</code>
          </pre>
        </div>
      )
    case "hr":
      return <hr key={index} className="border-border" />
    default:
      return (
        <p key={index}>
          {block.text.split("\n").map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 && <br />}
              {renderInlineMarkdown(line, `p-${index}-${lineIndex}`)}
            </span>
          ))}
        </p>
      )
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const codePattern = /`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = codePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderLinksAndEmphasis(text.slice(lastIndex, match.index), `${keyPrefix}-${nodes.length}`))
    }
    nodes.push(
      <code key={`${keyPrefix}-code-${match.index}`} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
        {match[1]}
      </code>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(...renderLinksAndEmphasis(text.slice(lastIndex), `${keyPrefix}-${nodes.length}`))
  }
  return nodes
}

function renderLinksAndEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const linkPattern = /\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderEmphasis(text.slice(lastIndex, match.index), `${keyPrefix}-${nodes.length}`))
    }
    const href = safeMarkdownHref(match[2])
    nodes.push(
      href ? (
        <a key={`${keyPrefix}-link-${match.index}`} href={href} target={isExternalHref(href) ? "_blank" : undefined} rel={isExternalHref(href) ? "noreferrer" : undefined} className="font-medium text-primary underline underline-offset-2">
          {renderEmphasis(match[1], `${keyPrefix}-link-label-${match.index}`)}
        </a>
      ) : (
        <span key={`${keyPrefix}-link-${match.index}`}>{renderEmphasis(match[1], `${keyPrefix}-link-label-${match.index}`)}</span>
      )
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(...renderEmphasis(text.slice(lastIndex), `${keyPrefix}-${nodes.length}`))
  }
  return nodes
}

function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const emphasisPattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = emphasisPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const value = match[0]
    const inner = value.replace(/^(\*\*|__|\*|_|~~)|(\*\*|__|\*|_|~~)$/g, "")
    if (value.startsWith("**") || value.startsWith("__")) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{inner}</strong>)
    } else if (value.startsWith("~~")) {
      nodes.push(<del key={`${keyPrefix}-del-${match.index}`}>{inner}</del>)
    } else {
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{inner}</em>)
    }
    lastIndex = match.index + value.length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function safeMarkdownHref(value: string) {
  const href = value.trim()
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("/") || href.startsWith("#")) {
    return href
  }
  return ""
}

function isExternalHref(href: string) {
  return /^(https?:|mailto:)/i.test(href)
}

function readStoredSessions(storeKey = sessionsStoreKey, includeLegacy = true): ChatSession[] {
  try {
    const value = JSON.parse(localStorage.getItem(storeKey) || "[]")
    const sessions = Array.isArray(value) ? value.map(normalizeSession).filter((session): session is ChatSession => Boolean(session)) : []
    if (sessions.length > 0) {
      return sessions
    }
  } catch {
    // Ignore invalid browser storage and fall back to a new session.
  }

  const legacyMessages = includeLegacy ? readLegacyMessages() : []
  if (legacyMessages.length > 0) {
    const now = new Date().toISOString()
    return [{
      id: createID(),
      title: "",
      messages: legacyMessages,
      run_mode: "chat",
      skill_ids: [],
      mcp_server_ids: [],
      connector_auto_approve: false,
      connector_command_prefixes: [],
      created_at: now,
      updated_at: now,
    }]
  }
  return []
}

function readLegacyMessages(): ChatMessage[] {
  try {
    const value = JSON.parse(localStorage.getItem(legacyMessagesStoreKey) || "[]")
    return Array.isArray(value) ? value.map(normalizeMessage).filter((message): message is ChatMessage => Boolean(message)) : []
  } catch {
    return []
  }
}

function readStoredEndpoint(storeKey = endpointStoreKey): ChatEndpoint {
  return normalizeEndpoint(localStorage.getItem(storeKey) || "chat")
}

function normalizeEndpoint(value: string): ChatEndpoint {
  if (value === "responses" || value === "claude" || value === "gemini") {
    return value
  }
  return "chat"
}

function chatRequest(endpoint: ChatEndpoint, modelName: string, apiKey: string, messages: ChatMessage[], systemPrompt: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (endpoint === "gemini") {
    return {
      url: `/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers,
      body: chatRequestPayload(endpoint, modelName, messages, systemPrompt),
    }
  }
  if (endpoint === "claude") {
    headers["x-api-key"] = apiKey
    return {
      url: "/v1/messages",
      headers,
      body: chatRequestPayload(endpoint, modelName, messages, systemPrompt),
    }
  }
  headers.Authorization = `Bearer ${apiKey}`
  return {
    url: endpoint === "responses" ? "/v1/responses" : "/v1/chat/completions",
    headers,
    body: chatRequestPayload(endpoint, modelName, messages, systemPrompt),
  }
}

function chatRequestPayload(endpoint: ChatEndpoint, modelName: string, messages: ChatMessage[], systemPrompt: string) {
  const prompt = systemPrompt.trim()
  if (endpoint === "responses") {
    return {
      model: modelName,
      input: [
        ...(prompt ? [{ role: "system", content: prompt }] : []),
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }
  }
  if (endpoint === "claude") {
    return {
      model: modelName,
      max_tokens: 1024,
      ...(prompt ? { system: prompt } : {}),
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    }
  }
  if (endpoint === "gemini") {
    return {
      ...(prompt ? { systemInstruction: { parts: [{ text: prompt }] } } : {}),
      contents: messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    }
  }
  return {
    model: modelName,
    messages: [
      ...(prompt ? [{ role: "system", content: prompt }] : []),
      ...messages.map((message) => ({ role: message.role, content: message.content })),
    ],
  }
}

async function responseErrorMessage(response: Response) {
  const text = await response.text().catch(() => "")
  try {
    const payload = text ? JSON.parse(text) : null
    if (typeof payload?.error === "string" && payload.error) {
      return payload.error
    }
    if (typeof payload?.message === "string" && payload.message) {
      return payload.message
    }
  } catch {
    // Fall through to plain text / status.
  }
  return text || `HTTP ${response.status}`
}

async function saveAdvancedSessionSnapshot(session: ChatSession): Promise<ChatSession | null> {
  if (isRunActive(session.latest_run)) {
    return null
  }
  const isStudio = session.run_mode === "agent_group"
  const isChat = session.run_mode === "chat"
  const res = await api.put(`/user/advanced-chat/sessions/${encodeURIComponent(session.id)}`, {
    id: session.id,
    title: session.title,
    run_mode: session.run_mode,
    agent_id: isStudio ? "" : session.agent_id || defaultAgentID,
    agent_group_id: isStudio ? session.agent_group_id || "" : "",
    skill_ids: session.skill_ids,
    mcp_server_ids: session.mcp_server_ids,
    connector_device_id: isChat ? "" : session.connector_device_id || "",
    connector_workspace_path: isChat ? "" : session.connector_workspace_path || "",
    connector_auto_approve: isChat ? false : session.connector_auto_approve,
    connector_command_prefixes: isChat ? [] : session.connector_command_prefixes,
    model_name: isStudio ? "" : session.model_name || "",
    user_channel_id: session.user_channel_id || 0,
    max_tokens: session.max_tokens || 0,
    temperature: session.temperature ?? null,
    reasoning_effort: session.reasoning_effort || "",
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      content_parts: message.content_parts || [],
      tool_calls: message.tool_calls || [],
    })),
  })
  return normalizeSession(res.data)
}

function advancedMessagePayload(messages: ChatMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    content_parts: message.content_parts || [],
    tool_calls: message.tool_calls || [],
  }))
}

function parseSSEEvent(raw: string): ParsedSSEEvent | null {
  let type = "message"
  const dataLines: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      type = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) {
    return null
  }
  try {
    return { type, payload: JSON.parse(dataLines.join("\n")) }
  } catch {
    return null
  }
}

function streamStatusText(payload: any, copy: ChatCopy) {
  const message = typeof payload?.message === "string" ? payload.message : ""
  const retryMatch = message.match(/^retrying:(\d+)\/(\d+)$/)
  if (message === "retrying" || retryMatch) {
    const attempt = Number(payload?.attempt || retryMatch?.[1] || 0)
    const max = Number(payload?.max || retryMatch?.[2] || 0)
    return copy.streamRetrying
      .replace("{attempt}", String(attempt || 1))
      .replace("{max}", String(max || 10))
  }
  if (message === "stream_started") {
    return copy.streamStarted
  }
  if (message === "loading_tools") {
    return copy.streamLoadingTools
  }
  if (message === "assistant_started") {
    return copy.assistantStarted
  }
  if (message === "model_round") {
    return copy.streamModelRound || copy.streamThinking
  }
  return ""
}

function responseTextFromPayload(payload: any): string {
  const chatText = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text
  if (typeof chatText === "string") {
    return chatText
  }
  if (typeof payload?.output_text === "string") {
    return payload.output_text
  }
  if (Array.isArray(payload?.content)) {
    const claudeText = payload.content
      .map((item: any) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim()
    if (claudeText) {
      return claudeText
    }
  }
  if (Array.isArray(payload?.candidates)) {
    const geminiText = payload.candidates
      .flatMap((candidate: any) => {
        const parts = isRecord(candidate?.content) && Array.isArray(candidate.content.parts) ? candidate.content.parts : []
        return parts.map((part: any) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      })
      .filter(Boolean)
      .join("\n")
      .trim()
    if (geminiText) {
      return geminiText
    }
  }

  const texts: string[] = []
  const output = Array.isArray(payload?.output) ? payload.output : []
  for (const item of output) {
    if (!isRecord(item)) {
      continue
    }
    if (typeof item.text === "string") {
      texts.push(item.text)
    }
    if (typeof item.content === "string") {
      texts.push(item.content)
    }
    if (Array.isArray(item.content)) {
      for (const content of item.content) {
        if (!isRecord(content)) {
          continue
        }
        if (typeof content.text === "string") {
          texts.push(content.text)
        } else if (typeof content.output_text === "string") {
          texts.push(content.output_text)
        }
      }
    }
  }
  return texts.join("\n").trim()
}

function normalizeAdvancedChatSettings(value: unknown): AdvancedChatSettings {
  const item = isRecord(value) ? value : {}
  const builtin = Array.isArray(item.builtin_mcp_servers) ? item.builtin_mcp_servers.map(normalizeMCPServer) : []
  const custom = Array.isArray(item.custom_mcp_servers) ? item.custom_mcp_servers.map(normalizeMCPServer) : []
  return {
    attachment_max_mb: Number(item.attachment_max_mb || defaultAdvancedChatSettings.attachment_max_mb),
    attachment_allowed_types: Array.isArray(item.attachment_allowed_types)
      ? item.attachment_allowed_types.filter((value): value is string => typeof value === "string")
      : defaultAdvancedChatSettings.attachment_allowed_types,
    file_storage_enabled: item.file_storage_enabled !== false,
    file_storage_total_mb: Number(item.file_storage_total_mb || defaultAdvancedChatSettings.file_storage_total_mb),
    file_storage_used_bytes: Number(item.file_storage_used_bytes || 0),
    file_storage_auto_save_images_enabled: item.file_storage_auto_save_images_enabled === true,
    file_storage_auto_save_videos_enabled: item.file_storage_auto_save_videos_enabled === true,
    mcp_servers: Array.isArray(item.mcp_servers) ? item.mcp_servers.map(normalizeMCPServer) : mergeMCPServers(builtin, custom),
    builtin_mcp_servers: builtin,
    custom_mcp_servers: custom,
    assistant_mode_enabled: item.assistant_mode_enabled !== false,
    assistant_mcp_tools_enabled: item.assistant_mcp_tools_enabled !== false,
    assistant_connector_list_files_enabled: item.assistant_connector_list_files_enabled !== false,
    assistant_connector_read_file_enabled: item.assistant_connector_read_file_enabled !== false,
    assistant_connector_write_file_enabled: item.assistant_connector_write_file_enabled !== false,
    assistant_connector_replace_text_enabled: item.assistant_connector_replace_text_enabled !== false,
    assistant_connector_run_command_enabled: item.assistant_connector_run_command_enabled !== false,
    assistant_connector_web_search_enabled: item.assistant_connector_web_search_enabled !== false,
    assistant_connector_static_site_enabled: item.assistant_connector_static_site_enabled !== false,
  }
}

function normalizeMCPServer(value: unknown): MCPServer {
  const item = isRecord(value) ? value : {}
  return {
    id: typeof item.id === "string" && item.id ? item.id : createID(),
    name: typeof item.name === "string" ? item.name : "",
    url: typeof item.url === "string" ? item.url : "",
    enabled: item.enabled !== false,
    request_mode: typeof item.request_mode === "string" ? item.request_mode : "frontend",
  }
}

function normalizeConnectorDevice(value: unknown): ConnectorDevice | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: stringFromUnknown(value.name) || "Local device",
    remark: stringFromUnknown(value.remark) || undefined,
    hostname: stringFromUnknown(value.hostname) || undefined,
    os: stringFromUnknown(value.os) || undefined,
    arch: stringFromUnknown(value.arch) || undefined,
    version: stringFromUnknown(value.version) || undefined,
    status: stringFromUnknown(value.status) || "offline",
    online: value.online === true,
    last_seen_at: stringFromUnknown(value.last_seen_at) || undefined,
  }
}

function normalizeConnectorApprovalTask(value: unknown): ConnectorApprovalTask | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  const payload = isRecord(value.payload) ? value.payload : {}
  return {
    id,
    device_id: stringFromUnknown(value.device_id) || "",
    device_name: stringFromUnknown(value.device_name) || "",
    run_id: stringFromUnknown(value.run_id) || "",
    action: stringFromUnknown(value.action) || "",
    workspace_path: stringFromUnknown(value.workspace_path) || "",
    payload,
    created_at: stringFromUnknown(value.created_at) || new Date().toISOString(),
  }
}

function normalizeWorkspaceSkill(value: unknown): WorkspaceSkill | null {
  if (!isRecord(value)) {
    return null
  }
  const path = stringFromUnknown(value.path)
  if (!path) {
    return null
  }
  return {
    id: stringFromUnknown(value.id) || path,
    name: stringFromUnknown(value.name) || path,
    path,
    content: stringFromUnknown(value.content) || "",
    size: Number(value.size || 0),
    truncated: value.truncated === true,
  }
}

function validateAttachment(file: File, settings: AdvancedChatSettings, copy: ChatCopy) {
  const maxBytes = Math.max(1, Number(settings.attachment_max_mb) || 1) * 1024 * 1024
  if (file.size > maxBytes) {
    return copy.attachmentTooLarge.replace("{file}", file.name).replace("{size}", String(settings.attachment_max_mb))
  }
  const type = attachmentFileType(file)
  if (!mimeAllowed(type, settings.attachment_allowed_types)) {
    return copy.attachmentTypeBlocked.replace("{file}", file.name).replace("{type}", type)
  }
  return ""
}

function mimeAllowed(type: string, allowedTypes: string[]) {
  return allowedTypes.some((allowed) => {
    const item = allowed.toLowerCase().trim()
    if (item === "*/*" || item === type) {
      return true
    }
    if (item.endsWith("/*")) {
      return type.startsWith(item.slice(0, -1))
    }
    return false
  })
}

function attachmentFileType(file: File) {
  return (file.type || mimeTypeFromName(file.name) || "application/octet-stream").toLowerCase()
}

function mimeTypeFromName(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  switch (ext) {
    case "txt":
      return "text/plain"
    case "md":
    case "markdown":
      return "text/markdown"
    case "json":
      return "application/json"
    case "csv":
      return "text/csv"
    case "xml":
      return "application/xml"
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "pdf":
      return "application/pdf"
    default:
      return ""
  }
}

function attachmentFromStoredFile(file: StoredFile, content?: StoredFileContent): ChatAttachment {
  return {
    id: createID(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    storage_id: file.id,
    text: content?.text || "",
    binary: content?.binary ?? !file.text_available,
    truncated: content?.truncated === true,
  }
}

function mergeAttachments(current: ChatAttachment[], next: ChatAttachment[]) {
  const existingIDs = new Set(current.map((attachment) => attachment.storage_id).filter(Boolean))
  const result = [...current]
  for (const attachment of next) {
    if (attachment.storage_id && existingIDs.has(attachment.storage_id)) {
      continue
    }
    result.push(attachment)
    if (attachment.storage_id) {
      existingIDs.add(attachment.storage_id)
    }
  }
  return result
}

function parseMessageAttachments(content: string): { text: string; attachments: ParsedMessageAttachment[] } {
  const normalized = content.replace(/\r\n/g, "\n")
  const attachmentPattern = /^\[Attachment:\s*(.*?);\s*type=([^;\]]*);\s*size=([^;\]]+)(?:;\s*file_id=([^\]]+))?\]\s*$/gm
  const attachments: ParsedMessageAttachment[] = []
  const ranges: Array<{ start: number; end: number }> = []
  let match: RegExpExecArray | null

  while ((match = attachmentPattern.exec(normalized)) !== null) {
    const headerStart = match.index
    const nextHeader = normalized.slice(attachmentPattern.lastIndex).search(/^\[Attachment:\s*/m)
    const blockEnd = nextHeader >= 0 ? attachmentPattern.lastIndex + nextHeader : normalized.length
    const body = normalized.slice(attachmentPattern.lastIndex, blockEnd).trim()
    attachments.push({
      name: match[1]?.trim() || "Attachment",
      type: match[2]?.trim() || "application/octet-stream",
      sizeLabel: match[3]?.trim() || "0 B",
      storageID: match[4]?.trim() || undefined,
      body,
      truncated: body.endsWith("...(truncated)"),
      binary: body === "(binary content omitted)" || body === "(image attached for model vision input)",
    })
    ranges.push({ start: headerStart, end: blockEnd })
    attachmentPattern.lastIndex = blockEnd
  }

  if (ranges.length === 0) {
    return { text: content, attachments: [] }
  }

  let text = ""
  let cursor = 0
  for (const range of ranges) {
    text += normalized.slice(cursor, range.start)
    cursor = range.end
  }
  text += normalized.slice(cursor)
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), attachments }
}

function chatAttachmentFromParsed(attachment: ParsedMessageAttachment): ChatAttachment {
  return {
    id: createID(),
    storage_id: attachment.storageID,
    name: attachment.name,
    type: attachment.type,
    size: bytesFromSizeLabel(attachment.sizeLabel),
    text: attachment.binary ? "" : attachment.body.replace(/\n\.\.\.\(truncated\)$/, ""),
    binary: attachment.binary,
    truncated: attachment.truncated,
  }
}

function bytesFromSizeLabel(value: string) {
  const match = value.trim().match(/^([\d.]+)\s*(B|KB|MB|GB)$/i)
  if (!match) {
    return 0
  }
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) {
    return 0
  }
  switch (match[2].toUpperCase()) {
    case "KB":
      return Math.round(amount * 1024)
    case "MB":
      return Math.round(amount * 1024 * 1024)
    case "GB":
      return Math.round(amount * 1024 * 1024 * 1024)
    default:
      return Math.round(amount)
  }
}

function normalizeStoredFilesResponse(value: unknown): StoredFileListResponse {
  if (Array.isArray(value)) {
    return {
      files: value.map(normalizeStoredFile).filter((file): file is StoredFile => Boolean(file)),
      used_bytes: 0,
      total_bytes: 0,
      remaining_bytes: 0,
    }
  }
  const item = isRecord(value) ? value : {}
  return {
    files: Array.isArray(item.files) ? item.files.map(normalizeStoredFile).filter((file): file is StoredFile => Boolean(file)) : [],
    used_bytes: Number(item.used_bytes || 0),
    total_bytes: Number(item.total_bytes || 0),
    remaining_bytes: Number(item.remaining_bytes || 0),
  }
}

function normalizeStoredFile(value: unknown): StoredFile | null {
  const item = isRecord(value) ? value : {}
  const id = typeof item.id === "string" ? item.id : ""
  if (!id) {
    return null
  }
  return {
    id,
    name: typeof item.name === "string" ? item.name : id,
    type: typeof item.type === "string" ? item.type : "",
    size: Number(item.size || 0),
    source: typeof item.source === "string" ? item.source : "",
    text_available: item.text_available === true,
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  }
}

function normalizeStoredFileContent(value: unknown): StoredFileContent {
  const item = isRecord(value) ? value : {}
  return {
    id: typeof item.id === "string" ? item.id : "",
    text: typeof item.text === "string" ? item.text : "",
    binary: item.binary === true,
    truncated: item.truncated === true,
  }
}

function messageContentWithAttachments(content: string, attachments: ChatAttachment[]) {
  if (attachments.length === 0) {
    return content
  }
  const sections = attachments.map((attachment) => {
    const fileID = attachment.storage_id ? `; file_id=${attachment.storage_id}` : ""
    const header = `[Attachment: ${attachment.name}; type=${attachment.type}; size=${formatBytes(attachment.size)}${fileID}]`
    if (!attachment.text) {
      if (attachment.type.toLowerCase().startsWith("image/") && attachment.storage_id) {
        return `${header}\n(image attached for model vision input)`
      }
      return `${header}\n(binary content omitted)`
    }
    const suffix = attachment.truncated ? "\n...(truncated)" : ""
    return `${header}\n${attachment.text.slice(0, 20000)}${suffix}`
  })
  return [content, sections.join("\n\n")].filter(Boolean).join("\n\n")
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B"
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function normalizeSession(value: unknown): ChatSession | null {
  if (!isRecord(value)) {
    return null
  }
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeMessage).filter((message): message is ChatMessage => Boolean(message))
    : []
  const runMode = normalizeChatRunMode(value.run_mode)
  const agentID = stringFromUnknown(value.agent_id)
  return {
    id: typeof value.id === "string" && value.id ? value.id : createID(),
    title: typeof value.title === "string" ? value.title : "",
    messages,
    run_mode: runMode,
    latest_run: normalizeRun(value.latest_run),
    agent_id: runMode === "agent_group" ? undefined : agentID || defaultAgentID,
    agent_group_id: stringFromUnknown(value.agent_group_id),
    skill_ids: stringArrayFromUnknown(value.skill_ids),
    mcp_server_ids: stringArrayFromUnknown(value.mcp_server_ids),
    connector_device_id: stringFromUnknown(value.connector_device_id) || undefined,
    connector_workspace_path: stringFromUnknown(value.connector_workspace_path) || undefined,
    connector_auto_approve: value.connector_auto_approve === true,
    connector_command_prefixes: stringArrayFromUnknown(value.connector_command_prefixes),
    model_name: stringFromUnknown(value.model_name),
    user_channel_id: Number(value.user_channel_id || 0) || undefined,
    max_tokens: Number(value.max_tokens || 0) || 0,
    temperature: value.temperature === null || value.temperature === undefined ? null : Number(value.temperature),
    reasoning_effort: stringFromUnknown(value.reasoning_effort) || "",
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizeChatRunMode(value: unknown): ChatRunMode {
  return value === "assistant" || value === "agent_group" ? value : "chat"
}

function normalizeRun(value: unknown): ChatRun | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = stringFromUnknown(value.id) || ""
  const sessionID = stringFromUnknown(value.session_id) || ""
  if (!id && !sessionID) {
    return undefined
  }
  return {
    id,
    session_id: sessionID,
    assistant_message_id: stringFromUnknown(value.assistant_message_id) || "",
    mode: normalizeChatRunMode(value.mode),
    status: typeof value.status === "string" && value.status ? value.status : "queued",
    status_message: typeof value.status_message === "string" ? value.status_message : undefined,
    current_round: typeof value.current_round === "number" ? value.current_round : undefined,
    error_message: typeof value.error_message === "string" ? value.error_message : undefined,
    tool_calls: typeof value.tool_calls === "number" ? value.tool_calls : undefined,
    tool_call_details: normalizeToolCalls(value.tool_call_details),
    created_at: typeof value.created_at === "string" ? value.created_at : undefined,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
    started_at: typeof value.started_at === "string" ? value.started_at : undefined,
    finished_at: typeof value.finished_at === "string" ? value.finished_at : undefined,
  }
}

function normalizeAgentWorkResponse(value: unknown): AgentWorkResponse | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const runID = stringFromUnknown(value.run_id) || ""
  if (!runID) {
    return undefined
  }
  const rawAgents = Array.isArray(value.agents) ? value.agents : []
  const rawConnectorTasks = Array.isArray(value.connector_tasks) ? value.connector_tasks : []
  return {
    run_id: runID,
    session_id: stringFromUnknown(value.session_id) || "",
    group_id: stringFromUnknown(value.group_id) || "",
    group_name: stringFromUnknown(value.group_name) || "",
    agents: rawAgents.map(normalizeAgentWorkStatus).filter((agent): agent is AgentWorkStatus => Boolean(agent)),
    connector_tasks: rawConnectorTasks.map(normalizeAgentWorkConnectorTask).filter((task): task is AgentWorkConnectorTask => Boolean(task)),
  }
}

function normalizeAgentWorkStatus(value: unknown): AgentWorkStatus | null {
  if (!isRecord(value)) {
    return null
  }
  const agentID = stringFromUnknown(value.agent_id) || ""
  const agentName = stringFromUnknown(value.agent_name) || agentID
  if (!agentID && !agentName) {
    return null
  }
  const rawMessages = Array.isArray(value.messages) ? value.messages : []
  return {
    agent_id: agentID,
    agent_name: agentName,
    agent_type: stringFromUnknown(value.agent_type) || "worker",
    group_id: stringFromUnknown(value.group_id) || "",
    group_name: stringFromUnknown(value.group_name) || "",
    status: stringFromUnknown(value.status) || "idle",
    working: value.working === true,
    updated_at: stringFromUnknown(value.updated_at) || undefined,
    messages: rawMessages.map(normalizeAgentWorkMessage).filter((message): message is AgentWorkMessage => Boolean(message)),
  }
}

function normalizeAgentWorkMessage(value: unknown): AgentWorkMessage | null {
  if (!isRecord(value)) {
    return null
  }
  const content = stringFromUnknown(value.content) || ""
  if (!content.trim()) {
    return null
  }
  return {
    role: stringFromUnknown(value.role) || "system",
    content,
    status: stringFromUnknown(value.status) || undefined,
    tool: stringFromUnknown(value.tool) || undefined,
    created_at: stringFromUnknown(value.created_at) || undefined,
  }
}

function normalizeAgentWorkConnectorTask(value: unknown): AgentWorkConnectorTask | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    device_id: stringFromUnknown(value.device_id) || "",
    device_name: stringFromUnknown(value.device_name) || "",
    action: stringFromUnknown(value.action) || "",
    status: stringFromUnknown(value.status) || "queued",
    workspace_path: stringFromUnknown(value.workspace_path) || "",
    workspace_unrestricted: value.workspace_unrestricted === true,
    payload: isRecord(value.payload) ? value.payload : {},
    result: stringFromUnknown(value.result) || undefined,
    error_message: stringFromUnknown(value.error_message) || undefined,
    created_at: stringFromUnknown(value.created_at) || new Date().toISOString(),
    updated_at: stringFromUnknown(value.updated_at) || undefined,
    started_at: stringFromUnknown(value.started_at) || undefined,
    finished_at: stringFromUnknown(value.finished_at) || undefined,
  }
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.role !== "user" && value.role !== "assistant") {
    return null
  }
  if (typeof value.content !== "string") {
    return null
  }
  return {
    id: typeof value.id === "string" && value.id ? value.id : createID(),
    role: value.role,
    content: value.content,
    content_parts: normalizeContentParts(value.content_parts, value.content),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
    tool_calls: normalizeToolCalls(value.tool_calls),
  }
}

function normalizeContentParts(value: unknown, fallback = ""): ChatContentPart[] {
  if (!Array.isArray(value)) {
    return fallback.trim() ? [{ round: 1, content: fallback }] : []
  }
  const parts: ChatContentPart[] = []
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return
    }
    const content = typeof item.content === "string" ? item.content : ""
    if (!content.trim()) {
      return
    }
    const round = typeof item.round === "number" && Number.isFinite(item.round) && item.round > 0 ? item.round : index + 1
    parts.push({ round, content })
  })
  if (parts.length === 0 && fallback.trim()) {
    return [{ round: 1, content: fallback }]
  }
  return parts
}

function appendContentPart(parts: ChatContentPart[], round: number, delta: string): ChatContentPart[] {
  if (!delta.trim()) {
    return parts
  }
  const nextRound = round > 0 ? round : 1
  const next = [...parts]
  const last = next[next.length - 1]
  if (last && normalizedRound(last.round) === nextRound) {
    next[next.length - 1] = { ...last, content: last.content + delta }
    return next
  }
  next.push({ round: nextRound, content: delta })
  return next
}

function normalizeToolCalls(value: unknown): ChatToolCall[] {
  if (!Array.isArray(value)) {
    return []
  }
  const calls: ChatToolCall[] = []
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return
    }
    const name = typeof item.name === "string" ? item.name : ""
    const tool = typeof item.tool === "string" ? item.tool : ""
    const server = typeof item.server === "string" ? item.server : ""
    if (!name && !tool) {
      return
    }
    const round = typeof item.round === "number" && Number.isFinite(item.round) && item.round > 0 ? item.round : undefined
    const id = typeof item.id === "string" && item.id ? item.id : `${round || 0}-${server}-${name || tool}-${index}`
    calls.push({
      id,
      round,
      name: name || tool,
      server,
      tool,
      status: typeof item.status === "string" && item.status ? item.status : "ok",
      arguments: isRecord(item.arguments) ? item.arguments : undefined,
      result: typeof item.result === "string" ? item.result : undefined,
    })
  })
  return calls
}

function mergeToolCalls(current: ChatToolCall[], incoming: ChatToolCall[]) {
  const merged = [...current]
  for (const next of incoming) {
    const index = merged.findIndex(
      (item) => item.id === next.id
    )
    if (index >= 0) {
      const currentItem = merged[index]
      merged[index] = {
        ...currentItem,
        ...next,
        result: typeof next.result === "string" && next.result.trim() ? next.result : currentItem.result,
      }
    } else {
      merged.push(next)
    }
  }
  return merged
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
    user_channel_id: Number(value.user_channel_id || 0) || undefined,
    stream: value.stream === true,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizeSkill(value: unknown): ChatSkill | null {
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
    description: typeof value.description === "string" ? value.description : "",
    prompt: typeof value.prompt === "string" ? value.prompt : "",
    mcp_server_ids: stringArrayFromUnknown(value.mcp_server_ids),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizeChatAgentGroup(value: unknown): ChatAgentGroup | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  const agents = Array.isArray(value.agents)
    ? value.agents.map(normalizeChatAgentGroupAgent).filter((agent): agent is ChatAgentGroupAgent => Boolean(agent))
    : []
  return {
    id,
    name: stringFromUnknown(value.name) || id,
    agents,
  }
}

function normalizeChatAgentGroupAgent(value: unknown): ChatAgentGroupAgent | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: stringFromUnknown(value.name) || id,
    type: stringFromUnknown(value.type) || "worker",
  }
}

function agentGroupChiefCount(group: ChatAgentGroup): number {
  return group.agents.filter((agent) => agent.type === "chief").length
}

function runModeLabel(mode: ChatRunMode, copy: ChatCopy, agentGroupCopy: AgentGroupCopy) {
  if (mode === "assistant") {
    return copy.assistantMode
  }
  if (mode === "agent_group") {
    return agentGroupCopy.agentGroupMode
  }
  return copy.chatMode
}

function createSession(input: { agentID?: string; modelName?: string } = {}): ChatSession {
  const now = new Date().toISOString()
  return {
    id: createID(),
    title: "",
    messages: [],
    run_mode: "chat",
    agent_id: input.agentID || undefined,
    agent_group_id: undefined,
    skill_ids: [],
    mcp_server_ids: [],
    connector_device_id: undefined,
    connector_workspace_path: undefined,
    connector_auto_approve: false,
    connector_command_prefixes: [],
    model_name: input.modelName || undefined,
    max_tokens: 0,
    temperature: null,
    reasoning_effort: "",
    created_at: now,
    updated_at: now,
  }
}

function createMessage(role: ChatMessage["role"], content: string, toolCalls: ChatToolCall[] = []): ChatMessage {
  return {
    id: createID(),
    role,
    content,
    content_parts: content.trim() ? [{ round: 1, content }] : [],
    created_at: new Date().toISOString(),
    tool_calls: toolCalls,
  }
}

function createID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function titleFromMessage(content: string, copy: ChatCopy) {
  const title = content.replace(/\s+/g, " ").trim()
  return title ? title.slice(0, 28) : copy.untitledSession
}

function isRunActive(run?: ChatRun) {
  return run?.status === "queued" || run?.status === "running"
}

function runStatusText(run: ChatRun, copy: ChatCopy) {
  if (run.status === "queued") {
    return copy.assistantStarted
  }
  const text = streamStatusText({ message: run.status_message || "assistant_started", round: run.current_round }, copy)
  return text || copy.runningAssistant
}

function agentWorkStatusText(status: string, copy: AgentGroupCopy) {
  switch (status) {
    case "queued":
      return copy.statusQueued
    case "running":
      return copy.statusRunning
    case "completed":
      return copy.statusCompleted
    case "failed":
    case "error":
      return copy.statusFailed
    case "cancelled":
      return copy.statusCancelled
    case "approval_required":
    case "pending_approval":
      return copy.statusApproval
    case "idle":
    case "":
      return copy.idle
    default:
      return status
  }
}

function agentWorkRoleLabel(role: string, copy: AgentGroupCopy) {
  switch (role) {
    case "user":
      return copy.roleUser
    case "assistant":
      return copy.roleAssistant
    case "tool":
      return copy.roleTool
    case "system":
      return copy.roleSystem
    default:
      return role || copy.roleSystem
  }
}

function formatAgentWorkTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function messageDisplayContent(message: ChatMessage, run: ChatRun | undefined, copy: ChatCopy) {
  if (message.content.trim()) {
    return message.content
  }
  if (run && isRunActive(run) && run.assistant_message_id === message.id) {
    return runStatusText(run, copy)
  }
  if (run?.status === "failed" && run.assistant_message_id === message.id) {
    return run.error_message || copy.sendFailed
  }
  if (message.role === "assistant" && (message.tool_calls || []).length > 0) {
    return ""
  }
  if (message.role === "assistant") {
    return copy.emptyResponse
  }
  return message.content
}

function messageContentParts(message: ChatMessage, run: ChatRun | undefined, copy: ChatCopy) {
  const parts = normalizeContentParts(message.content_parts, "")
  if (parts.length > 0) {
    return parts
  }
  const content = messageDisplayContent(message, run, copy)
  return content.trim() ? [{ round: 1, content }] : []
}

function groupToolCallsByRound(toolCalls: ChatToolCall[]) {
  const groups = new Map<number, ChatToolCall[]>()
  for (const toolCall of toolCalls) {
    const round = normalizedRound(toolCall.round)
    groups.set(round, [...(groups.get(round) || []), toolCall])
  }
  return groups
}

function orderedMessageRounds(parts: ChatContentPart[], toolCallsByRound: Map<number, ChatToolCall[]>) {
  const rounds = new Set<number>()
  parts.forEach((part) => rounds.add(normalizedRound(part.round)))
  toolCallsByRound.forEach((_items, round) => rounds.add(round))
  return Array.from(rounds).sort((a, b) => a - b)
}

function normalizedRound(round?: number) {
  return typeof round === "number" && Number.isFinite(round) && round > 0 ? round : 1
}

function upsertSession(current: ChatSession[], next: ChatSession) {
  const index = current.findIndex((session) => session.id === next.id)
  if (index < 0) {
    return [next, ...current]
  }
  const updated = [...current]
  updated[index] = next
  return updated
}

function mergeServerSessions(current: ChatSession[], serverSessions: ChatSession[], activeSessionID = "") {
  const serverIDs = new Set(serverSessions.map((session) => session.id))
  const localDrafts = current.filter((session) =>
    !serverIDs.has(session.id) && (session.messages.length === 0 || session.id === activeSessionID || isRunActive(session.latest_run))
  )
  return [...localDrafts, ...serverSessions]
}

function sessionIDFromAdvancedChatPath(pathname: string) {
  const match = pathname.match(/^\/chat\/session\/([^/]+)$/)
  if (!match) {
    return ""
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
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

function normalizeAPIKey(value: unknown): APIKey {
  const item = isRecord(value) ? value : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    api_key: typeof item.api_key === "string" ? item.api_key : "",
    key_prefix: typeof item.key_prefix === "string" ? item.key_prefix : "",
    allowed_models: Array.isArray(item.allowed_models)
      ? item.allowed_models.filter((model): model is string => typeof model === "string")
      : [],
    enabled: Boolean(item.enabled),
  }
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? uniqueStrings(value.map(stringFromUnknown).filter((item): item is string => Boolean(item))) : []
}

function commandPrefixesFromText(value: string) {
  return uniqueStrings(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))
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

function formatToolArguments(value?: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) {
    return "{}"
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

interface ReplacementEntry {
  path: string
  oldText: string
  newText: string
}

interface DiffLine {
  type: "context" | "remove" | "add"
  text: string
}

function replacementEntriesFromArguments(value?: Record<string, unknown>): ReplacementEntry[] {
  if (!value) {
    return []
  }
  const defaultPath = stringArgument(value, "path")
  const rawReplacements = Array.isArray(value.replacements) ? value.replacements : []
  const entries = rawReplacements
    .filter(isRecord)
    .map((item) => ({
      path: stringArgument(item, "path") || defaultPath,
      oldText: stringArgument(item, "old_text"),
      newText: stringArgument(item, "new_text"),
    }))
    .filter((item) => item.oldText || item.newText)
  if (entries.length > 0) {
    return entries
  }
  const oldText = stringArgument(value, "old_text")
  const newText = stringArgument(value, "new_text")
  return oldText || newText ? [{ path: defaultPath, oldText, newText }] : []
}

function diffHunks(oldText: string, newText: string, contextLines: number): DiffLine[][] {
  const lines = lineDiff(oldText, newText)
  const changed = lines
    .map((line, index) => (line.type === "context" ? -1 : index))
    .filter((index) => index >= 0)
  if (changed.length === 0) {
    return [lines.slice(0, Math.max(1, contextLines * 2 + 1))]
  }

  const ranges: Array<[number, number]> = []
  for (const index of changed) {
    const start = Math.max(0, index - contextLines)
    const end = Math.min(lines.length, index + contextLines + 1)
    const last = ranges[ranges.length - 1]
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      ranges.push([start, end])
    }
  }
  return ranges.map(([start, end]) => lines.slice(start, end))
}

function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitDiffLines(oldText)
  const newLines = splitDiffLines(newText)
  if (oldLines.length * newLines.length > 40000) {
    return [
      ...oldLines.map((text) => ({ type: "remove" as const, text })),
      ...newLines.map((text) => ({ type: "add" as const, text })),
    ]
  }

  const dp = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0) as number[])
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      dp[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? dp[oldIndex + 1][newIndex + 1] + 1
        : Math.max(dp[oldIndex + 1][newIndex], dp[oldIndex][newIndex + 1])
    }
  }

  const result: DiffLine[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      result.push({ type: "context", text: oldLines[oldIndex] })
      oldIndex += 1
      newIndex += 1
    } else if (dp[oldIndex + 1][newIndex] >= dp[oldIndex][newIndex + 1]) {
      result.push({ type: "remove", text: oldLines[oldIndex] })
      oldIndex += 1
    } else {
      result.push({ type: "add", text: newLines[newIndex] })
      newIndex += 1
    }
  }
  while (oldIndex < oldLines.length) {
    result.push({ type: "remove", text: oldLines[oldIndex] })
    oldIndex += 1
  }
  while (newIndex < newLines.length) {
    result.push({ type: "add", text: newLines[newIndex] })
    newIndex += 1
  }
  return result
}

function splitDiffLines(value: string) {
  return value.replace(/\r\n/g, "\n").split("\n")
}

function toolLabel(toolCall: ChatToolCall) {
  return `${toolCall.server ? `${toolCall.server}: ` : ""}${toolCall.tool || toolCall.name}`
}

function staticSiteToolTitle(toolCall: ChatToolCall, domainName: string, siteID: string) {
  const name = toolCall.name.toLowerCase()
  const target = domainName || siteID || "."
  if (name === "list_static_sites") {
    return "列出静态站点"
  }
  if (name === "deploy_static_site") {
    return `部署静态站点: ${target}`
  }
  if (name === "set_static_site_enabled") {
    return `切换静态站点: ${target}`
  }
  if (name === "delete_static_site") {
    return `删除静态站点: ${target}`
  }
  return ""
}

function findConnectorApprovalTask(toolCall: ChatToolCall, tasks: ConnectorApprovalTask[]) {
  if (toolCall.status !== "approval_required" || tasks.length === 0) {
    return undefined
  }
  return tasks.find((task) => connectorApprovalTaskMatchesToolCall(toolCall, task))
}

function connectorApprovalTaskMatchesToolCall(toolCall: ChatToolCall, task: ConnectorApprovalTask) {
  if (task.id === stringArgument(toolCall.arguments, "connector_task_id")) {
    return true
  }
  if (stringArgument(task.payload, "preview_tool_call_id") === toolCall.id) {
    return true
  }
  const action = connectorActionForToolCall(toolCall)
  if (!action || task.action !== action) {
    return false
  }
  if (action === "run_command") {
    return stringArgument(task.payload, "command") === stringArgument(toolCall.arguments, "command")
  }
  return stringArgument(task.payload, "path") === stringArgument(toolCall.arguments, "path")
}

function connectorApprovalTaskTitle(task: ConnectorApprovalTask) {
  const action = task.action || "connector action"
  const target =
    stringArgument(task.payload, "path") ||
    stringArgument(task.payload, "command") ||
    stringArgument(task.payload, "url") ||
    stringArgument(task.payload, "query")
  return target ? `${action}: ${target}` : action
}

function connectorApprovalTaskSubtitle(task: ConnectorApprovalTask) {
  const parts = [task.device_name, task.workspace_path].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : task.id
}

function connectorActionForToolCall(toolCall: ChatToolCall) {
  if (toolCall.tool) {
    return toolCall.tool
  }
  switch (builtinToolKind(toolCall)) {
    case "list":
      return "list_files"
    case "read":
      return "read_file"
    case "write":
      return "write_file"
    case "replace":
      return "replace_text"
    case "command":
      return "run_command"
    case "search":
      return "web_search"
    case "fetch":
      return "web_fetch"
    default:
      return ""
  }
}

function builtinToolKind(toolCall: ChatToolCall): "list" | "read" | "write" | "replace" | "command" | "search" | "fetch" | "" {
  const name = toolCall.name.toLowerCase()
  if (!name.startsWith("workspace_")) {
    return ""
  }
  if (name.includes("workspace_list_files")) {
    return "list"
  }
  if (name.includes("workspace_read_file")) {
    return "read"
  }
  if (name.includes("workspace_write_file")) {
    return "write"
  }
  if (name.includes("workspace_replace_text")) {
    return "replace"
  }
  if (name.includes("workspace_run_command")) {
    return "command"
  }
  if (name.includes("workspace_web_search")) {
    return "search"
  }
  if (name.includes("workspace_web_fetch")) {
    return "fetch"
  }
  return ""
}

function builtinToolTitle(
  kind: "list" | "read" | "write" | "replace" | "command" | "search" | "fetch",
  path: string,
  command: string,
  copy: ChatCopy,
  writeModifiesExisting: boolean
) {
  const target = kind === "command" || kind === "search" || kind === "fetch" ? command || "." : path || "."
  const template = kind === "list"
    ? copy.toolActionListFiles
    : kind === "read"
      ? copy.toolActionReadFile
      : kind === "command"
        ? copy.toolActionRunCommand
        : kind === "search"
          ? copy.toolActionWebSearch
          : kind === "fetch"
            ? copy.toolActionWebFetch
          : kind === "write"
            ? writeModifiesExisting ? copy.toolActionEditFile : copy.toolActionWriteFile
            : copy.toolActionEditFile
  return template.replace("{target}", target)
}

function stringArgument(value: Record<string, unknown> | undefined, key: string) {
  const item = value?.[key]
  if (typeof item === "string") {
    return item
  }
  if (typeof item === "number" || typeof item === "boolean") {
    return String(item)
  }
  return ""
}

function booleanArgument(value: Record<string, unknown> | undefined, key: string) {
  return value?.[key] === true
}

function toolStatusClassName(status: string) {
  switch (status) {
    case "ok":
      return "bg-emerald-50 text-emerald-700"
    case "running":
    case "approval_required":
      return "bg-amber-50 text-amber-700"
    case "missing":
    case "invalid_arguments":
    case "error":
    default:
      return "bg-destructive/10 text-destructive"
  }
}

function toolStatusLabel(status: string, copy: ChatCopy) {
  switch (status) {
    case "ok":
      return copy.toolStatusOk
    case "running":
      return copy.toolStatusRunning
    case "approval_required":
      return copy.toolStatusApprovalRequired
    case "missing":
      return copy.toolStatusMissing
    case "invalid_arguments":
      return copy.toolStatusInvalidArguments
    default:
      return copy.toolStatusError
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const chatCopyKeys = {
  title: "chat.title",
  sessions: "chat.sessions",
  openSessions: "chat.openSessions",
  closeSessions: "chat.closeSessions",
  newSession: "chat.newSession",
  untitledSession: "chat.untitledSession",
  messageCount: "chat.messageCount",
  deleteSession: "chat.deleteSession",
  customTitle: "chat.customTitle",
  customTitlePrompt: "chat.customTitlePrompt",
  regenerateTitle: "chat.regenerateTitle",
  regeneratingTitle: "chat.regeneratingTitle",
  regenerateTitleFailed: "chat.regenerateTitleFailed",
  config: "chat.config",
  advancedConfig: "chat.advancedConfig",
  apiKey: "chat.apiKey",
  channel: "chat.channel",
  endpoint: "chat.endpoint",
  agent: "chat.agent",
  noAgentSelected: "chat.noAgentSelected",
  selectAgent: "chat.selectAgent",
  noAgents: "chat.noAgents",
  manageAgents: "chat.manageAgents",
  newAgent: "chat.newAgent",
  editAgent: "chat.editAgent",
  deleteAgent: "chat.deleteAgent",
  agentName: "chat.agentName",
  defaultAgentName: "chat.defaultAgentName",
  agentPrompt: "chat.agentPrompt",
  agentPromptPlaceholder: "chat.agentPromptPlaceholder",
  agentDefaultModel: "chat.agentDefaultModel",
  saveAgent: "chat.saveAgent",
  agentSaved: "chat.agentSaved",
  agentCreated: "chat.agentCreated",
  agentDeleted: "chat.agentDeleted",
  agentNameRequired: "chat.agentNameRequired",
  agentSelectRequired: "chat.agentSelectRequired",
  agentDefaultModelRequired: "chat.agentDefaultModelRequired",
  agentSaveFailed: "chat.agentSaveFailed",
  agentCreateFailed: "chat.agentCreateFailed",
  agentDeleteFailed: "chat.agentDeleteFailed",
  basicSettings: "chat.basicSettings",
  advancedModelSettings: "chat.advancedModelSettings",
  maxTokens: "chat.maxTokens",
  maxTokensPlaceholder: "chat.maxTokensPlaceholder",
  temperature: "chat.temperature",
  reasoningEffort: "chat.reasoningEffort",
  reasoningDefault: "chat.reasoningDefault",
  reasoningMinimal: "chat.reasoningMinimal",
  reasoningLow: "chat.reasoningLow",
  reasoningMedium: "chat.reasoningMedium",
  reasoningHigh: "chat.reasoningHigh",
  addedAgent: "chat.addedAgent",
  noAgentAdded: "chat.noAgentAdded",
  setAgent: "chat.setAgent",
  replaceAgent: "chat.replaceAgent",
  skills: "chat.skills",
  selectSkills: "chat.selectSkills",
  noSkills: "chat.noSkills",
  addedSkills: "chat.addedSkills",
  noSkillsAdded: "chat.noSkillsAdded",
  manageSkills: "chat.manageSkills",
  mcpServers: "chat.mcpServers",
  noMCPServers: "chat.noMCPServers",
  addedMCPServers: "chat.addedMCPServers",
  noMCPServersAdded: "chat.noMCPServersAdded",
  selectMCPServer: "chat.selectMCPServer",
  manageMCP: "chat.manageMCP",
  fromSkill: "chat.fromSkill",
  devices: "chat.devices",
  connectedDevices: "chat.connectedDevices",
  sessionDevice: "chat.sessionDevice",
  manageDevices: "chat.manageDevices",
  createConnectorToken: "chat.createConnectorToken",
  creatingConnectorToken: "chat.creatingConnectorToken",
  connectorToken: "chat.connectorToken",
  connectorCommand: "chat.connectorCommand",
  connectorTokenCreated: "chat.connectorTokenCreated",
  connectorTokenCreateFailed: "chat.connectorTokenCreateFailed",
  connectorApprovalTitle: "chat.connectorApprovalTitle",
  connectorApprovalDescription: "chat.connectorApprovalDescription",
  connectorApprovalFailed: "chat.connectorApprovalFailed",
  approveConnectorTask: "chat.approveConnectorTask",
  rejectConnectorTask: "chat.rejectConnectorTask",
  connectorAutoApprove: "chat.connectorAutoApprove",
  connectorCommandPrefixes: "chat.connectorCommandPrefixes",
  connectorCommandPrefixesPlaceholder: "chat.connectorCommandPrefixesPlaceholder",
  connectorCommandPrefixesHint: "chat.connectorCommandPrefixesHint",
  localDevice: "chat.localDevice",
  noDeviceSelected: "chat.noDeviceSelected",
  selectDevice: "chat.selectDevice",
  noDevices: "chat.noDevices",
  selectWorkspace: "chat.selectWorkspace",
  workspacePath: "chat.workspacePath",
  workspacePathPlaceholder: "chat.workspacePathPlaceholder",
  unrestrictedWorkspace: "chat.unrestrictedWorkspace",
  workspaceSkills: "chat.workspaceSkills",
  refreshWorkspaceSkills: "chat.refreshWorkspaceSkills",
  refreshingWorkspaceSkills: "chat.refreshingWorkspaceSkills",
  noWorkspaceSkills: "chat.noWorkspaceSkills",
  workspaceSkillsRefreshFailed: "chat.workspaceSkillsRefreshFailed",
  truncated: "chat.truncated",
  noWorkspaces: "chat.noWorkspaces",
  setDevice: "chat.setDevice",
  deviceOnline: "chat.deviceOnline",
  deviceOffline: "chat.deviceOffline",
  add: "chat.add",
  remove: "chat.remove",
  sessionModel: "chat.sessionModel",
  done: "chat.done",
  chatCompletions: "chat.chatCompletions",
  responsesAPI: "chat.responsesAPI",
  claudeMessages: "chat.claudeMessages",
  geminiGenerate: "chat.geminiGenerate",
  selectKey: "chat.selectKey",
  selectChannel: "chat.selectChannel",
  noKeys: "chat.noKeys",
  noChannels: "chat.noChannels",
  selectModel: "chat.selectModel",
  conversation: "chat.conversation",
  noMessages: "chat.noMessages",
  chatMode: "chat.chatMode",
  assistantMode: "chat.assistantMode",
  assistantModeDisabled: "chat.assistantModeDisabled",
  assistantMCPToolsDisabled: "chat.assistantMCPToolsDisabled",
  assistantWorkspaceToolsDisabled: "chat.assistantWorkspaceToolsDisabled",
  promptPlaceholder: "chat.promptPlaceholder",
  assistantPromptPlaceholder: "chat.assistantPromptPlaceholder",
  attachmentMessageTitle: "chat.attachmentMessageTitle",
  addAttachment: "chat.addAttachment",
  removeAttachment: "chat.removeAttachment",
  attachmentLimit: "chat.attachmentLimit",
  attachmentTooLarge: "chat.attachmentTooLarge",
  attachmentTypeBlocked: "chat.attachmentTypeBlocked",
  send: "chat.send",
  sending: "chat.sending",
  runAssistant: "chat.runAssistant",
  runningAssistant: "chat.runningAssistant",
  editMessage: "chat.editMessage",
  deleteMessage: "chat.deleteMessage",
  saveMessage: "chat.saveMessage",
  cancelEdit: "chat.cancelEdit",
  keyRequired: "chat.keyRequired",
  channelRequired: "chat.channelRequired",
  modelRequired: "chat.modelRequired",
  sendFailed: "chat.sendFailed",
  emptyResponse: "chat.emptyResponse",
  stopped: "chat.stopped",
  stop: "chat.stop",
  stopTask: "chat.stopTask",
  stopFailed: "chat.stopFailed",
  streamStarted: "chat.streamStarted",
  streamLoadingTools: "chat.streamLoadingTools",
  assistantStarted: "chat.assistantStarted",
  streamModelRound: "chat.streamModelRound",
  streamRetrying: "chat.streamRetrying",
  streamThinking: "chat.streamThinking",
  usedTools: "chat.usedTools",
  toolRound: "chat.toolRound",
  toolArguments: "chat.toolArguments",
  toolResult: "chat.toolResult",
  toolWriteContent: "chat.toolWriteContent",
  toolReplaceOld: "chat.toolReplaceOld",
  toolReplaceNew: "chat.toolReplaceNew",
  toolActionListFiles: "chat.toolActionListFiles",
  toolActionReadFile: "chat.toolActionReadFile",
  toolActionRunCommand: "chat.toolActionRunCommand",
  toolActionWebSearch: "chat.toolActionWebSearch",
  toolActionWebFetch: "chat.toolActionWebFetch",
  toolActionWriteFile: "chat.toolActionWriteFile",
  toolActionEditFile: "chat.toolActionEditFile",
  jumpToLatest: "chat.jumpToLatest",
  expandToolCall: "chat.expandToolCall",
  toolStatusOk: "chat.toolStatusOk",
  toolStatusRunning: "chat.toolStatusRunning",
  toolStatusApprovalRequired: "chat.toolStatusApprovalRequired",
  toolStatusError: "chat.toolStatusError",
  toolStatusMissing: "chat.toolStatusMissing",
  toolStatusInvalidArguments: "chat.toolStatusInvalidArguments",
} as const satisfies Record<string, TranslationKey>

type ChatCopy = Record<keyof typeof chatCopyKeys, string>
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

function buildChatCopy(t: Translate): ChatCopy {
  return Object.fromEntries(
    Object.entries(chatCopyKeys).map(([name, key]) => [name, t(key)])
  ) as ChatCopy
}

const zhFileAttachmentCopy = {
  selectFile: "选择文件",
  useFile: "使用",
  selected: "已选择",
  loading: "加载中",
  noFiles: "文件库暂无文件",
  manageFiles: "管理文件库",
  text: "文本",
  close: "关闭",
  uploading: "上传中",
  uploadFailed: "上传附件失败",
  selectFailed: "选择文件失败",
  storageDisabled: "管理员已关闭文件存储功能",
}

const enFileAttachmentCopy: typeof zhFileAttachmentCopy = {
  selectFile: "Select file",
  useFile: "Use",
  selected: "Selected",
  loading: "Loading",
  noFiles: "No files in storage",
  manageFiles: "Manage files",
  text: "Text",
  close: "Close",
  uploading: "Uploading",
  uploadFailed: "Failed to upload attachment",
  selectFailed: "Failed to select file",
  storageDisabled: "File storage is disabled by the administrator",
}

type AgentGroupCopy = typeof enAgentGroupCopy

const enAgentGroupCopy = {
  agentGroupMode: "Agent Studio",
  agentGroups: "Agent Studios",
  selectGroup: "Select studio",
  noGroups: "No agent studios",
  loadingGroups: "Loading studios",
  noAgents: "No agents in this studio",
  manageGroups: "Manage studios",
  noGroupSelected: "No studio selected",
  chiefCount: "{count} chief",
  runAgentGroup: "Send to studio",
  promptPlaceholder: "Send a task to the studio, or use @agent to address one agent",
  groupRequired: "Select a studio before sending",
  workStatus: "Work status",
  workStatusActive: "{count} working",
  noWorkStatus: "No main agent status yet",
  noWorkMessages: "No messages recorded for this agent",
  working: "Working",
  idle: "Idle",
  updatedAt: "Updated",
  roleUser: "User",
  roleAssistant: "Assistant",
  roleTool: "Tool",
  roleSystem: "System",
  statusQueued: "Queued",
  statusRunning: "Running",
  statusCompleted: "Completed",
  statusFailed: "Failed",
  statusCancelled: "Cancelled",
  statusApproval: "Approval required",
}

const zhAgentGroupCopy: AgentGroupCopy = {
  agentGroupMode: "\u5de5\u4f5c\u5ba4\u6a21\u5f0f",
  agentGroups: "\u5de5\u4f5c\u5ba4",
  selectGroup: "\u9009\u62e9\u5de5\u4f5c\u5ba4",
  noGroups: "\u6682\u65e0\u5de5\u4f5c\u5ba4",
  loadingGroups: "\u6b63\u5728\u52a0\u8f7d\u5de5\u4f5c\u5ba4",
  noAgents: "\u8be5\u5de5\u4f5c\u5ba4\u6682\u65e0\u4ee3\u7406",
  manageGroups: "\u7ba1\u7406\u5de5\u4f5c\u5ba4",
  noGroupSelected: "\u5c1a\u672a\u9009\u62e9\u5de5\u4f5c\u5ba4",
  chiefCount: "{count} \u4e2a chief",
  runAgentGroup: "\u53d1\u9001\u5230\u5de5\u4f5c\u5ba4",
  promptPlaceholder: "\u5411\u5de5\u4f5c\u5ba4\u53d1\u9001\u4efb\u52a1\uff0c\u6216\u4f7f\u7528 @agent \u6307\u5b9a\u4ee3\u7406",
  groupRequired: "\u53d1\u9001\u524d\u8bf7\u5148\u9009\u62e9\u5de5\u4f5c\u5ba4",
  workStatus: "\u5de5\u4f5c\u72b6\u6001",
  workStatusActive: "{count} \u4e2a\u6b63\u5728\u5de5\u4f5c",
  noWorkStatus: "\u6682\u65e0\u4e3b\u4ee3\u7406\u5de5\u4f5c\u72b6\u6001",
  noWorkMessages: "\u8be5\u4ee3\u7406\u6682\u65e0\u6d88\u606f\u8bb0\u5f55",
  working: "\u5de5\u4f5c\u4e2d",
  idle: "\u7a7a\u95f2",
  updatedAt: "\u66f4\u65b0",
  roleUser: "\u7528\u6237",
  roleAssistant: "\u52a9\u624b",
  roleTool: "\u5de5\u5177",
  roleSystem: "\u7cfb\u7edf",
  statusQueued: "\u6392\u961f\u4e2d",
  statusRunning: "\u8fd0\u884c\u4e2d",
  statusCompleted: "\u5df2\u5b8c\u6210",
  statusFailed: "\u5931\u8d25",
  statusCancelled: "\u5df2\u53d6\u6d88",
  statusApproval: "\u7b49\u5f85\u6279\u51c6",
}
