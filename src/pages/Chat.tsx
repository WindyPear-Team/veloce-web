import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { Bot, Check, Menu, MessageSquarePlus, Paperclip, Pencil, Plus, Send, Server, Settings, Sparkles, Trash2, User, X } from "lucide-react"
import api from "@/lib/api"
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
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
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
  skill_ids: string[]
  mcp_server_ids: string[]
  model_name?: string
  user_channel_id?: number
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

interface ChatAgent {
  id: string
  name: string
  prompt: string
  default_model: string
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

interface MCPServer {
  id: string
  name: string
  url: string
  enabled: boolean
  request_mode: "backend" | "frontend" | string
}

interface AdvancedChatSettings {
  attachment_max_mb: number
  attachment_allowed_types: string[]
  mcp_servers: MCPServer[]
  builtin_mcp_servers: MCPServer[]
  custom_mcp_servers: MCPServer[]
}

interface ChatAttachment {
  id: string
  name: string
  type: string
  size: number
  text?: string
}

type ChatEndpoint = "chat" | "responses" | "claude" | "gemini"
type ChatMode = "basic" | "advanced"
type ChatRunMode = "chat" | "assistant"
type SessionConfigTab = "basic" | "agent" | "skills" | "mcp"

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
const agentsQueryKey = ["advanced-chat-agents"] as const
const skillsQueryKey = ["advanced-chat-skills"] as const
const advancedSessionsQueryKey = ["advanced-chat-sessions"] as const
const defaultAdvancedChatSettings: AdvancedChatSettings = {
  attachment_max_mb: 10,
  attachment_allowed_types: ["text/plain", "text/markdown", "application/json", "text/csv", "image/png", "image/jpeg", "application/pdf"],
  mcp_servers: [],
  builtin_mcp_servers: [],
  custom_mcp_servers: [],
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
  const storeKeys = chatStoreKeys[variant]
  const { t } = useI18n()
  const copy = useMemo(() => buildChatCopy(t), [t])
  const { error } = useToast()
  const [sessions, setSessions] = useState<ChatSession[]>(() => (variant === "advanced" ? [createSession()] : readStoredSessions(storeKeys.sessions, true)))
  const [activeSessionID, setActiveSessionID] = useState(() => localStorage.getItem(storeKeys.selectedSession) || "")
  const [modelName, setModelName] = useState(() => localStorage.getItem(storeKeys.model) || "")
  const [endpointMode, setEndpointMode] = useState<ChatEndpoint>(() => readStoredEndpoint(storeKeys.endpoint))
  const [selectedAPIKeyID, setSelectedAPIKeyID] = useState(() => Number(localStorage.getItem(storeKeys.apiKey) || 0))
  const [selectedUserChannelID, setSelectedUserChannelID] = useState(() => Number(localStorage.getItem(storeKeys.userChannel) || 0))
  const [selectedAgentID, setSelectedAgentID] = useState(() => (isAdvanced ? localStorage.getItem(selectedAgentStoreKey) || "" : ""))
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [isSessionsSidebarOpen, setIsSessionsSidebarOpen] = useState(false)
  const [configTab, setConfigTab] = useState<SessionConfigTab>("basic")
  const [pendingAgentID, setPendingAgentID] = useState("")
  const [pendingSkillID, setPendingSkillID] = useState("")
  const [pendingMCPServerID, setPendingMCPServerID] = useState("")
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isSending, setIsSending] = useState(false)
  const [isStreamActive, setIsStreamActive] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [editingMessageID, setEditingMessageID] = useState("")
  const [editingContent, setEditingContent] = useState("")

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

  const { data: agents = [] } = useQuery<ChatAgent[]>({
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

  const modelOptions = useMemo(() => uniqueModels(catalog), [catalog])
  const selectableAPIKeys = useMemo(() => apiKeys.filter((key) => key.enabled && key.api_key), [apiKeys])
  const selectedAPIKey = useMemo(
    () => selectableAPIKeys.find((key) => key.id === selectedAPIKeyID) || selectableAPIKeys[0],
    [selectableAPIKeys, selectedAPIKeyID]
  )
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionID) || sessions[0],
    [sessions, activeSessionID]
  )
  const activeToolCalls = useMemo(() => {
    const messages = activeSession?.messages || []
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const toolCalls = messages[index].tool_calls || []
      if (toolCalls.length > 0) {
        return toolCalls
      }
    }
    return []
  }, [activeSession?.messages])
  const selectedAgent = useMemo(() => {
    if (!isAdvanced) {
      return undefined
    }
    return agents.find((agent) => agent.id === activeSession?.agent_id)
  }, [activeSession?.agent_id, agents, isAdvanced])
  const activeRunMode: ChatRunMode = isAdvanced ? activeSession?.run_mode || "chat" : "chat"
  const activeRun = isAdvanced ? activeSession?.latest_run : undefined
  const isActiveRunRunning = isRunActive(activeRun)
  const activeModelName = isAdvanced ? activeSession?.model_name || selectedAgent?.default_model || modelName : modelName
  const selectableUserChannels = useMemo(
    () => catalog.filter((channel) => !activeModelName || channel.models.includes(activeModelName)),
    [activeModelName, catalog]
  )
  const selectedUserChannel = useMemo(
    () => selectableUserChannels.find((channel) => channel.id === selectedUserChannelID) || selectableUserChannels[0],
    [selectableUserChannels, selectedUserChannelID]
  )
  const currentAdvancedSettings = useMemo<AdvancedChatSettings>(
    () => ({ ...defaultAdvancedChatSettings, ...(advancedSettings ?? {}) }),
    [advancedSettings]
  )
  const mcpServers = useMemo(() => {
    if (currentAdvancedSettings.mcp_servers.length > 0) {
      return currentAdvancedSettings.mcp_servers
    }
    return mergeMCPServers(currentAdvancedSettings.builtin_mcp_servers, currentAdvancedSettings.custom_mcp_servers)
  }, [currentAdvancedSettings])
  const enabledMCPServers = useMemo(() => mcpServers.filter((server) => server.enabled), [mcpServers])
  const selectedSkills = useMemo(() => {
    const selectedIDs = activeSession?.skill_ids || []
    return skills.filter((skill) => selectedIDs.includes(skill.id))
  }, [activeSession?.skill_ids, skills])
  const availableSkillsToAdd = useMemo(() => {
    const selectedIDs = new Set(activeSession?.skill_ids || [])
    return skills.filter((skill) => !selectedIDs.has(skill.id))
  }, [activeSession?.skill_ids, skills])
  const skillMCPServerIDs = useMemo(() => uniqueStrings(selectedSkills.flatMap((skill) => skill.mcp_server_ids)), [selectedSkills])
  const sessionMCPServers = useMemo(() => {
    const selectedIDs = new Set(activeSession?.mcp_server_ids || [])
    return enabledMCPServers.filter((server) => selectedIDs.has(server.id))
  }, [activeSession?.mcp_server_ids, enabledMCPServers])
  const availableMCPServersToAdd = useMemo(() => {
    const selectedIDs = new Set(activeSession?.mcp_server_ids || [])
    const skillSelectedIDs = new Set(skillMCPServerIDs)
    return enabledMCPServers.filter((server) => !selectedIDs.has(server.id) && !skillSelectedIDs.has(server.id))
  }, [activeSession?.mcp_server_ids, enabledMCPServers, skillMCPServerIDs])

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
    setSessions((current) => mergeServerSessions(current, serverSessions))
  }, [isAdvanced, serverSessions, serverSessionsFetched])

  useEffect(() => {
    if (!activeSessionID && sessions[0]) {
      setActiveSessionID(sessions[0].id)
      return
    }
    if (activeSessionID && !sessions.some((session) => session.id === activeSessionID) && sessions[0]) {
      setActiveSessionID(sessions[0].id)
    }
  }, [activeSessionID, sessions])

  useEffect(() => {
    if (activeSessionID) {
      localStorage.setItem(storeKeys.selectedSession, activeSessionID)
    }
  }, [activeSessionID, storeKeys.selectedSession])

  useEffect(() => {
    if (!isAdvanced && modelName) {
      localStorage.setItem(storeKeys.model, modelName)
    }
  }, [isAdvanced, modelName, storeKeys.model])

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
    if (!isAdvanced || !activeSession?.user_channel_id || activeSession.user_channel_id === selectedUserChannelID) {
      return
    }
    setSelectedUserChannelID(activeSession.user_channel_id)
  }, [activeSession?.id, activeSession?.user_channel_id, isAdvanced, selectedUserChannelID])

  useEffect(() => {
    if (!isAdvanced && !modelName && modelOptions.length > 0) {
      setModelName(modelOptions[0])
    }
  }, [isAdvanced, modelName, modelOptions])

  useEffect(() => {
    if (!isAdvanced) {
      return
    }
    if (selectedAgentID && agents.some((agent) => agent.id === selectedAgentID)) {
      localStorage.setItem(selectedAgentStoreKey, selectedAgentID)
      return
    }
    setSelectedAgentID("")
    localStorage.removeItem(selectedAgentStoreKey)
  }, [agents, isAdvanced, selectedAgentID])

  useEffect(() => {
    if (!isAdvanced || !activeSession || activeSession.model_name || modelOptions.length === 0) {
      return
    }
    const defaultModel = selectedAgent?.default_model || modelOptions[0]
    updateSession(activeSession.id, (session) => ({ ...session, model_name: defaultModel }))
  }, [activeSession, isAdvanced, modelOptions, selectedAgent?.default_model])

  useEffect(() => {
    if (!pendingAgentID && agents[0]) {
      setPendingAgentID(agents[0].id)
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

  const createNewSession = () => {
    const session = createSession({
      modelName: isAdvanced ? modelOptions[0] || modelName : undefined,
    })
    setSessions((current) => [session, ...current])
    setActiveSessionID(session.id)
    setIsSessionsSidebarOpen(false)
    setPrompt("")
    setAttachments([])
    cancelEdit()
    if (isAdvanced) {
      void persistAdvancedSession(session)
    }
  }

  const deleteSession = (sessionID: string) => {
    if (isAdvanced) {
      void api.delete(`/user/advanced-chat/sessions/${encodeURIComponent(sessionID)}`).then(() => refetchAdvancedSessions()).catch(() => undefined)
    }
    const nextSessions = sessions.filter((session) => session.id !== sessionID)
    const fallbackSessions = nextSessions.length > 0 ? nextSessions : [createSession()]
    setSessions(fallbackSessions)
    if (activeSessionID === sessionID || !fallbackSessions.some((session) => session.id === activeSessionID)) {
      setActiveSessionID(fallbackSessions[0].id)
    }
    cancelEdit()
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

  const updateSession = (sessionID: string, updater: (session: ChatSession) => ChatSession, options: { persist?: boolean } = {}) => {
    const baseSession = sessions.find((session) => session.id === sessionID)
    const persistedSession = baseSession ? { ...updater(baseSession), updated_at: new Date().toISOString() } : undefined
    setSessions((current) =>
      current.map((session) => {
        if (session.id !== sessionID) {
          return session
        }
        if (persistedSession) {
          return persistedSession
        }
        return { ...updater(session), updated_at: new Date().toISOString() }
      })
    )
    if (options.persist && persistedSession) {
      persistAdvancedSession(persistedSession)
    }
  }

  const selectSession = (sessionID: string) => {
    setActiveSessionID(sessionID)
    setIsSessionsSidebarOpen(false)
    cancelEdit()
  }

  const setSessionAgent = (agentID: string) => {
    setSelectedAgentID(agentID)
    const agent = agents.find((item) => item.id === agentID)
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      agent_id: agentID || undefined,
      model_name: agent?.default_model || session.model_name || modelOptions[0] || "",
    }), { persist: true })
  }

  const removeAgentFromSession = () => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      agent_id: undefined,
    }), { persist: true })
  }

  const handleSessionModelChange = (value: string) => {
    if (isAdvanced && activeSession) {
      updateSession(activeSession.id, (session) => ({ ...session, model_name: value }), { persist: true })
      return
    }
    setModelName(value)
  }

  const setSessionRunMode = (mode: ChatRunMode) => {
    if (!isAdvanced || !activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({ ...session, run_mode: mode }), { persist: true })
  }

  const addSessionSkill = (skillID: string) => {
    if (!activeSession) {
      return
    }
    if (activeSession.skill_ids.includes(skillID)) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      skill_ids: [...session.skill_ids, skillID],
    }), { persist: true })
  }

  const removeSessionSkill = (skillID: string) => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      skill_ids: session.skill_ids.filter((id) => id !== skillID),
    }), { persist: true })
  }

  const addSessionMCPServer = (serverID: string) => {
    if (!activeSession) {
      return
    }
    if (activeSession.mcp_server_ids.includes(serverID)) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      mcp_server_ids: [...session.mcp_server_ids, serverID],
    }), { persist: true })
  }

  const removeSessionMCPServer = (serverID: string) => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      mcp_server_ids: session.mcp_server_ids.filter((id) => id !== serverID),
    }), { persist: true })
  }

  const stopStreaming = () => {
    abortControllerRef.current?.abort()
  }

  const sendMessage = async () => {
    const content = prompt.trim()
    const rawKey = selectedAPIKey?.api_key.trim() || ""
    const session = activeSession
    const resolvedModel = activeModelName.trim()
    if (!session) {
      return
    }
    if (!resolvedModel) {
      error(copy.modelRequired)
      return
    }
    if (isAdvanced && !selectedUserChannel) {
      error(copy.channelRequired)
      return
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
    updateSession(session.id, (current) => ({ ...current, title: nextTitle, messages: nextMessages, model_name: resolvedModel }))
    setPrompt("")
    setAttachments([])
    setIsSending(true)
    cancelEdit()

    try {
      if (isAdvanced) {
        if (activeRunMode === "assistant") {
          const assistantMessage = createMessage("assistant", "", [])
          updateSession(session.id, (current) => ({
            ...current,
            user_channel_id: selectedUserChannel?.id || current.user_channel_id,
            messages: [...current.messages, assistantMessage],
            latest_run: {
              id: "",
              session_id: session.id,
              assistant_message_id: assistantMessage.id,
              mode: "assistant",
              status: "queued",
              status_message: "assistant_started",
            },
          }))
          try {
            const res = await api.post("/user/advanced-chat/completions", {
              session_id: session.id,
              title: nextTitle,
              model: resolvedModel,
              user_channel_id: selectedUserChannel?.id || 0,
              mode: "assistant",
              messages: nextMessages.map((message) => ({ id: message.id, role: message.role, content: message.content })),
              agent_id: session.agent_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
              stream: false,
            })
            const serverSession = normalizeSession(res.data?.session)
            if (serverSession) {
              setSessions((current) => upsertSession(current, serverSession))
              setActiveSessionID(serverSession.id)
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
        const controller = new AbortController()
        abortControllerRef.current = controller
        setIsStreamActive(true)
        updateSession(session.id, (current) => ({ ...current, messages: [...current.messages, assistantMessage] }))

        let accumulatedText = ""
        try {
          const token = localStorage.getItem("token") || ""
          const response = await fetch("/api/user/advanced-chat/completions", {
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
              messages: nextMessages.map((message) => ({ id: message.id, role: message.role, content: message.content })),
              agent_id: session.agent_id || "",
              skill_ids: session.skill_ids,
              mcp_server_ids: session.mcp_server_ids,
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
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split(/\r?\n\r?\n/)
            buffer = parts.pop() || ""
            for (const part of parts) {
              const event = parseSSEEvent(part)
              if (!event) {
                continue
              }
              if (event.type === "text") {
                const delta = typeof event.payload.delta === "string" ? event.payload.delta : ""
                if (!delta) {
                  continue
                }
                accumulatedText += delta
                updateSession(session.id, (current) => ({
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === assistantMessageID ? { ...message, content: accumulatedText } : message
                  ),
                }))
              } else if (event.type === "status") {
                const statusText = streamStatusText(event.payload, copy)
                if (!statusText || accumulatedText) {
                  continue
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
                  continue
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
                const finalToolCalls = normalizeToolCalls(event.payload.tool_call_details)
                updateSession(session.id, (current) => ({
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === assistantMessageID
                      ? { ...message, content: finalContent || copy.emptyResponse, tool_calls: finalToolCalls }
                      : message
                  ),
                }))
              } else if (event.type === "error") {
                throw new Error(typeof event.payload.error === "string" ? event.payload.error : copy.sendFailed)
              }
            }
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
          setIsSending(false)
          void refetchAdvancedSessions()
        }
        return
      }

      let answer = ""
      const systemPrompt = ""
      const request = chatRequest(endpointMode, resolvedModel, rawKey, nextMessages, systemPrompt)
      const response = await fetch(request.url, {
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
    setEditingContent(message.content)
  }

  const saveEditedMessage = () => {
    const content = editingContent.trim()
    if (!activeSession || !editingMessageID || !content) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === editingMessageID ? { ...message, content, updated_at: new Date().toISOString() } : message
      ),
    }), { persist: true })
    cancelEdit()
  }

  const deleteMessage = (messageID: string) => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      messages: session.messages.filter((message) => message.id !== messageID),
    }), { persist: true })
    if (editingMessageID === messageID) {
      cancelEdit()
    }
  }

  const handleAttachmentFiles = async (files: FileList | null) => {
    if (!isAdvanced || !files?.length) {
      return
    }
    const next: ChatAttachment[] = []
    for (const file of Array.from(files)) {
      const validationError = validateAttachment(file, currentAdvancedSettings, copy)
      if (validationError) {
        error(validationError)
        continue
      }
      next.push(await attachmentFromFile(file))
    }
    if (next.length > 0) {
      setAttachments((current) => [...current, ...next].slice(0, 8))
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }

  function cancelEdit() {
    setEditingMessageID("")
    setEditingContent("")
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
          {modelOptions.map((model) => (
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
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={cn(
              "grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border p-2",
              session.id === activeSession?.id && "border-primary bg-primary/5"
            )}
          >
            <button type="button" className="min-w-0 text-left" onClick={() => selectSession(session.id)}>
              <div className="truncate text-sm font-medium">{session.title || copy.untitledSession}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {copy.messageCount.replace("{count}", String(session.messages.length))}
              </div>
              {isAdvanced && session.run_mode === "assistant" && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="inline-flex rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[11px] text-primary">
                    {copy.assistantMode}
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
      </div>
    </aside>
  )
  const sessionsSidebarPortal =
    typeof document === "undefined"
      ? null
      : createPortal(
          <>
            <div className="fixed right-0 top-16 z-20 hidden h-[calc(100vh-4rem)] xl:flex">{sessionsSidebar}</div>

            {isSessionsSidebarOpen && (
              <div className="fixed inset-0 top-16 z-40 xl:hidden">
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
    <div className="space-y-6 xl:pr-72">
      {sessionsSidebarPortal}
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-8 lg:px-8">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <div className="flex flex-wrap gap-2">
          {isAdvanced && (
            <div className="inline-flex rounded-md border bg-background p-1">
              {(["chat", "assistant"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "h-8 rounded px-3 text-sm transition-colors",
                    activeRunMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  onClick={() => setSessionRunMode(mode)}
                  disabled={isSending || isActiveRunRunning}
                >
                  {mode === "assistant" ? copy.assistantMode : copy.chatMode}
                </button>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            className="gap-2 xl:hidden"
            onClick={() => setIsSessionsSidebarOpen((open) => !open)}
            aria-label={isSessionsSidebarOpen ? copy.closeSessions : copy.openSessions}
            aria-expanded={isSessionsSidebarOpen}
          >
            <Menu size={16} />
            {copy.sessions}
          </Button>
          {isAdvanced && (
            <Button variant="outline" className="gap-2" onClick={() => setIsConfigOpen(true)}>
              <Settings size={16} />
              {copy.config}
            </Button>
          )}
          <Button className="gap-2" onClick={createNewSession}>
            <MessageSquarePlus size={16} />
            {copy.newSession}
          </Button>
        </div>
      </div>

      <PageTitleSlot />
      <div className="space-y-4">
        {!isAdvanced && basicConfig}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{copy.conversation}</CardTitle>
                {isAdvanced && (
                  <div className="flex flex-wrap items-center gap-2">
                    {isActiveRunRunning && activeRun && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary">
                        {runStatusText(activeRun, copy)}
                      </div>
                    )}
                    <div className="rounded-md border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                      {activeRunMode === "assistant" ? copy.assistantModeHelp : copy.chatModeHelp}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="min-h-[360px] space-y-3 rounded-md border p-3">
                {!activeSession || activeSession.messages.length === 0 ? (
                  <div className="py-20 text-center text-sm text-muted-foreground">{copy.noMessages}</div>
                ) : (
                  activeSession.messages.map((message) => (
                    <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <div className="max-w-[92%] rounded-md border bg-background p-3 text-sm">
                        <div className="flex items-start gap-2">
                          {message.role === "user" ? (
                            <User className="mt-0.5 h-4 w-4 shrink-0" />
                          ) : (
                            <Bot className="mt-0.5 h-4 w-4 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            {editingMessageID === message.id ? (
                              <textarea
                                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={editingContent}
                                onChange={(event) => setEditingContent(event.target.value)}
                              />
                            ) : (
                              <>
                                {message.tool_calls && message.tool_calls.length > 0 && (
                                  <div className="mb-2 flex flex-wrap gap-1.5">
                                    {message.tool_calls.map((toolCall) => (
                                      <span
                                        key={toolCall.id}
                                        className={cn(
                                          "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
                                          toolCall.status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                                        )}
                                        title={[toolCall.server, toolCall.tool].filter(Boolean).join(" / ") || toolCall.name}
                                      >
                                        {typeof toolCall.round === "number" && (
                                          <span className="shrink-0 rounded bg-background/70 px-1 text-[10px] opacity-80">R{toolCall.round}</span>
                                        )}
                                        <Server size={11} className="shrink-0" />
                                        <span className="truncate">{toolCall.server ? `${toolCall.server}: ` : ""}{toolCall.tool || toolCall.name}</span>
                                        <span className="shrink-0 opacity-70">{toolStatusLabel(toolCall.status, copy)}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <MarkdownContent content={messageDisplayContent(message, activeRun, copy)} />
                              </>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
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
                                <Button variant="ghost" size="sm" onClick={() => beginEditMessage(message)} title={copy.editMessage}>
                                  <Pencil size={15} />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => deleteMessage(message.id)} title={copy.deleteMessage}>
                                  <Trash2 size={15} />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {isAdvanced && activeToolCalls.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">{copy.usedTools}</div>
                  <div className="flex flex-wrap gap-2">
                    {activeToolCalls.map((toolCall) => (
                      <span
                        key={toolCall.id}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs",
                          toolCall.status === "ok" ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"
                        )}
                        title={[toolCall.server, toolCall.tool].filter(Boolean).join(" / ") || toolCall.name}
                      >
                        <Server size={13} className="shrink-0" />
                        <span className="truncate">{toolCall.server ? `${toolCall.server}: ` : ""}{toolCall.tool || toolCall.name}</span>
                        <span className="shrink-0 opacity-70">{toolStatusLabel(toolCall.status, copy)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      <Paperclip size={14} className="shrink-0" />
                      <span className="truncate">{attachment.name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.size)}</span>
                      <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => removeAttachment(attachment.id)} aria-label={copy.removeAttachment}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <textarea
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={prompt}
                    placeholder={isAdvanced && activeRunMode === "assistant" ? copy.assistantPromptPlaceholder : copy.promptPlaceholder}
                    disabled={isActiveRunRunning}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault()
                        sendMessage()
                      }
                    }}
                  />
                  {isAdvanced && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
                        <Paperclip size={15} />
                        {copy.addAttachment}
                        <input
                          className="sr-only"
                          type="file"
                          multiple
                          onChange={(event) => {
                            handleAttachmentFiles(event.target.files)
                            event.target.value = ""
                          }}
                        />
                      </label>
                      <span>
                        {copy.attachmentLimit
                          .replace("{size}", String(currentAdvancedSettings.attachment_max_mb))
                          .replace("{types}", currentAdvancedSettings.attachment_allowed_types.join(", "))}
                      </span>
                    </div>
                  )}
                </div>
                {isAdvanced && isStreamActive ? (
                  <Button variant="outline" className="gap-2 self-end" onClick={stopStreaming}>
                    <X size={16} />
                    {copy.stop}
                  </Button>
                ) : (
                  <Button className="gap-2 self-end" disabled={(!prompt.trim() && attachments.length === 0) || isSending || isActiveRunRunning} onClick={sendMessage}>
                    <Send size={16} />
                    {isAdvanced && activeRunMode === "assistant"
                      ? isSending || isActiveRunRunning ? copy.runningAssistant : copy.runAssistant
                      : isSending ? copy.sending : copy.send}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
      </div>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
      {isAdvanced && (
        <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{copy.advancedConfig}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  ["basic", copy.basicSettings],
                  ["agent", copy.agent],
                  ["skills", copy.skills],
                  ["mcp", copy.mcpServers],
                ] as const).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setConfigTab(tab)}
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
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.sessionModel}</span>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={activeModelName}
                      onChange={(event) => handleSessionModelChange(event.target.value)}
                    >
                      <option value="">{copy.selectModel}</option>
                      {modelOptions.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{copy.channel}</span>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={selectedUserChannel?.id || ""}
                      onChange={(event) => {
                        const nextID = Number(event.target.value) || 0
                        setSelectedUserChannelID(nextID)
                        if (activeSession) {
                          updateSession(activeSession.id, (session) => ({ ...session, user_channel_id: nextID || undefined }), { persist: true })
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
                      <Button variant="ghost" size="sm" onClick={removeAgentFromSession} title={copy.remove}>
                        <X size={15} />
                      </Button>
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
                      <option value="">{agents.length ? copy.selectAgent : copy.noAgents}</option>
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
                        .filter((server) => skillMCPServerIDs.includes(server.id) && !activeSession?.mcp_server_ids.includes(server.id))
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
    return <div className="text-muted-foreground">-</div>
  }
  return (
    <div className="space-y-2 break-words leading-relaxed">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
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
    return [{ id: createID(), title: "", messages: legacyMessages, run_mode: "chat", skill_ids: [], mcp_server_ids: [], created_at: now, updated_at: now }]
  }
  return [createSession()]
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
  const res = await api.put(`/user/advanced-chat/sessions/${encodeURIComponent(session.id)}`, {
    id: session.id,
    title: session.title,
    run_mode: session.run_mode,
    agent_id: session.agent_id || "",
    skill_ids: session.skill_ids,
    mcp_server_ids: session.mcp_server_ids,
    model_name: session.model_name || "",
    user_channel_id: session.user_channel_id || 0,
    messages: session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      tool_calls: message.tool_calls || [],
    })),
  })
  return normalizeSession(res.data)
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
    const round = typeof payload?.round === "number" ? String(payload.round) : ""
    return round ? copy.streamModelRound.replace("{round}", round) : copy.streamThinking
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
    enabled: item.enabled !== false,
    request_mode: typeof item.request_mode === "string" ? item.request_mode : "frontend",
  }
}

function validateAttachment(file: File, settings: AdvancedChatSettings, copy: ChatCopy) {
  const maxBytes = Math.max(1, Number(settings.attachment_max_mb) || 1) * 1024 * 1024
  if (file.size > maxBytes) {
    return copy.attachmentTooLarge.replace("{file}", file.name).replace("{size}", String(settings.attachment_max_mb))
  }
  const type = (file.type || "application/octet-stream").toLowerCase()
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

async function attachmentFromFile(file: File): Promise<ChatAttachment> {
  const type = file.type || "application/octet-stream"
  const attachment: ChatAttachment = {
    id: createID(),
    name: file.name,
    type,
    size: file.size,
  }
  if (isTextLikeFile(file)) {
    attachment.text = await file.text()
  }
  return attachment
}

function isTextLikeFile(file: File) {
  const type = file.type.toLowerCase()
  return type.startsWith("text/") || type === "application/json" || type === "application/xml" || /\.(md|txt|json|csv|xml|yaml|yml)$/i.test(file.name)
}

function messageContentWithAttachments(content: string, attachments: ChatAttachment[]) {
  if (attachments.length === 0) {
    return content
  }
  const sections = attachments.map((attachment) => {
    const header = `[Attachment: ${attachment.name}; type=${attachment.type}; size=${formatBytes(attachment.size)}]`
    if (!attachment.text) {
      return `${header}\n(binary content omitted)`
    }
    return `${header}\n${attachment.text.slice(0, 20000)}`
  })
  return [content, sections.join("\n\n")].filter(Boolean).join("\n\n")
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function normalizeSession(value: unknown): ChatSession | null {
  if (!isRecord(value)) {
    return null
  }
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeMessage).filter((message): message is ChatMessage => Boolean(message))
    : []
  return {
    id: typeof value.id === "string" && value.id ? value.id : createID(),
    title: typeof value.title === "string" ? value.title : "",
    messages,
    run_mode: normalizeChatRunMode(value.run_mode),
    latest_run: normalizeRun(value.latest_run),
    agent_id: stringFromUnknown(value.agent_id),
    skill_ids: stringArrayFromUnknown(value.skill_ids),
    mcp_server_ids: stringArrayFromUnknown(value.mcp_server_ids),
    model_name: stringFromUnknown(value.model_name),
    user_channel_id: Number(value.user_channel_id || 0) || undefined,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizeChatRunMode(value: unknown): ChatRunMode {
  return value === "assistant" ? "assistant" : "chat"
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
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : undefined,
    tool_calls: normalizeToolCalls(value.tool_calls),
  }
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
    calls.push({
      id: `${round || 0}-${server}-${name || tool}-${index}`,
      round,
      name: name || tool,
      server,
      tool,
      status: typeof item.status === "string" && item.status ? item.status : "ok",
    })
  })
  return calls
}

function mergeToolCalls(current: ChatToolCall[], incoming: ChatToolCall[]) {
  const merged = [...current]
  for (const next of incoming) {
    const index = merged.findIndex(
      (item) => item.round === next.round && item.name === next.name && item.server === next.server && item.tool === next.tool
    )
    if (index >= 0) {
      merged[index] = { ...merged[index], ...next }
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

function createSession(input: { agentID?: string; modelName?: string } = {}): ChatSession {
  const now = new Date().toISOString()
  return {
    id: createID(),
    title: "",
    messages: [],
    run_mode: "chat",
    agent_id: input.agentID || undefined,
    skill_ids: [],
    mcp_server_ids: [],
    model_name: input.modelName || undefined,
    created_at: now,
    updated_at: now,
  }
}

function createMessage(role: ChatMessage["role"], content: string, toolCalls: ChatToolCall[] = []): ChatMessage {
  return { id: createID(), role, content, created_at: new Date().toISOString(), tool_calls: toolCalls }
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

function messageDisplayContent(message: ChatMessage, run: ChatRun | undefined, copy: ChatCopy) {
  if (message.content) {
    return message.content
  }
  if (run && isRunActive(run) && run.assistant_message_id === message.id) {
    return runStatusText(run, copy)
  }
  return message.content
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

function mergeServerSessions(current: ChatSession[], serverSessions: ChatSession[]) {
  const serverIDs = new Set(serverSessions.map((session) => session.id))
  const localDrafts = current.filter((session) => !serverIDs.has(session.id) && session.messages.length === 0)
  return [...localDrafts, ...serverSessions]
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

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

function toolStatusLabel(status: string, copy: ChatCopy) {
  switch (status) {
    case "ok":
      return copy.toolStatusOk
    case "running":
      return copy.toolStatusRunning
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
  chatModeHelp: "chat.chatModeHelp",
  assistantModeHelp: "chat.assistantModeHelp",
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
  streamStarted: "chat.streamStarted",
  streamLoadingTools: "chat.streamLoadingTools",
  assistantStarted: "chat.assistantStarted",
  streamModelRound: "chat.streamModelRound",
  streamThinking: "chat.streamThinking",
  usedTools: "chat.usedTools",
  toolStatusOk: "chat.toolStatusOk",
  toolStatusRunning: "chat.toolStatusRunning",
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
