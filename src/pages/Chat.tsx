import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Bot, Check, MessageSquarePlus, Paperclip, Pencil, Plus, Send, Server, Settings, Sparkles, Trash2, User, X } from "lucide-react"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  created_at: string
  updated_at?: string
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  agent_id?: string
  skill_ids: string[]
  mcp_server_ids: string[]
  model_name?: string
  created_at: string
  updated_at: string
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

const sessionsStoreKey = "windypear.chat.sessions.v1"
const legacyMessagesStoreKey = "windypear.chat.messages.v1"
const selectedSessionStoreKey = "windypear.chat.selected_session.v1"
const modelStoreKey = "windypear.chat.model.v1"
const endpointStoreKey = "windypear.chat.endpoint.v1"
const apiKeyStoreKey = "windypear.chat.api_key_id.v1"
const selectedAgentStoreKey = "windypear.advanced_chat.selected_agent.v1"
const agentsQueryKey = ["advanced-chat-agents"] as const
const skillsQueryKey = ["advanced-chat-skills"] as const
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
  const { language } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const { error } = useToast()
  const [sessions, setSessions] = useState<ChatSession[]>(() => readStoredSessions(storeKeys.sessions, variant === "basic"))
  const [activeSessionID, setActiveSessionID] = useState(() => localStorage.getItem(storeKeys.selectedSession) || "")
  const [modelName, setModelName] = useState(() => localStorage.getItem(storeKeys.model) || "")
  const [endpointMode, setEndpointMode] = useState<ChatEndpoint>(() => readStoredEndpoint(storeKeys.endpoint))
  const [selectedAPIKeyID, setSelectedAPIKeyID] = useState(() => Number(localStorage.getItem(storeKeys.apiKey) || 0))
  const [selectedUserChannelID, setSelectedUserChannelID] = useState(() => Number(localStorage.getItem(storeKeys.userChannel) || 0))
  const [selectedAgentID, setSelectedAgentID] = useState(() => (isAdvanced ? localStorage.getItem(selectedAgentStoreKey) || "" : ""))
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [configTab, setConfigTab] = useState<SessionConfigTab>("basic")
  const [pendingAgentID, setPendingAgentID] = useState("")
  const [pendingSkillID, setPendingSkillID] = useState("")
  const [pendingMCPServerID, setPendingMCPServerID] = useState("")
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isSending, setIsSending] = useState(false)
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
  const selectedAgent = useMemo(() => {
    if (!isAdvanced) {
      return undefined
    }
    return agents.find((agent) => agent.id === activeSession?.agent_id)
  }, [activeSession?.agent_id, agents, isAdvanced])
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
    localStorage.setItem(storeKeys.sessions, JSON.stringify(sessions))
  }, [sessions, storeKeys.sessions])

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
    setPrompt("")
    setAttachments([])
    cancelEdit()
  }

  const deleteSession = (sessionID: string) => {
    const nextSessions = sessions.filter((session) => session.id !== sessionID)
    const fallbackSessions = nextSessions.length > 0 ? nextSessions : [createSession()]
    setSessions(fallbackSessions)
    if (activeSessionID === sessionID || !fallbackSessions.some((session) => session.id === activeSessionID)) {
      setActiveSessionID(fallbackSessions[0].id)
    }
    cancelEdit()
  }

  const updateSession = (sessionID: string, updater: (session: ChatSession) => ChatSession) => {
    setSessions((current) =>
      current.map((session) => {
        if (session.id !== sessionID) {
          return session
        }
        return { ...updater(session), updated_at: new Date().toISOString() }
      })
    )
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
    }))
  }

  const removeAgentFromSession = () => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      agent_id: undefined,
    }))
  }

  const handleSessionModelChange = (value: string) => {
    if (isAdvanced && activeSession) {
      updateSession(activeSession.id, (session) => ({ ...session, model_name: value }))
      return
    }
    setModelName(value)
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
    }))
  }

  const removeSessionSkill = (skillID: string) => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      skill_ids: session.skill_ids.filter((id) => id !== skillID),
    }))
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
    }))
  }

  const removeSessionMCPServer = (serverID: string) => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      mcp_server_ids: session.mcp_server_ids.filter((id) => id !== serverID),
    }))
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
      let answer = ""
      if (isAdvanced) {
        const res = await api.post("/user/advanced-chat/completions", {
          model: resolvedModel,
          user_channel_id: selectedUserChannel?.id || 0,
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
          agent_id: session.agent_id || "",
          skill_ids: session.skill_ids,
          mcp_server_ids: session.mcp_server_ids,
        })
        answer = typeof res.data?.message?.content === "string" ? res.data.message.content : ""
      } else {
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
      }
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
    }))
    cancelEdit()
  }

  const deleteMessage = (messageID: string) => {
    if (!activeSession) {
      return
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      messages: session.messages.filter((message) => message.id !== messageID),
    }))
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
      const validationError = validateAttachment(file, currentAdvancedSettings)
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">{copy.title}</h1>
        <div className="flex flex-wrap gap-2">
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

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{copy.sessions}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  "grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border p-2",
                  session.id === activeSession?.id && "border-primary bg-primary/5"
                )}
              >
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => {
                    setActiveSessionID(session.id)
                    cancelEdit()
                  }}
                >
                  <div className="truncate text-sm font-medium">{session.title || copy.untitledSession}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {copy.messageCount.replace("{count}", String(session.messages.length))}
                  </div>
                </button>
                <Button variant="ghost" size="sm" onClick={() => deleteSession(session.id)} title={copy.deleteSession}>
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!isAdvanced && basicConfig}

          <Card>
            <CardHeader>
              <CardTitle>{copy.conversation}</CardTitle>
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
                              <div className="whitespace-pre-wrap break-words">{message.content}</div>
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
                    placeholder={copy.promptPlaceholder}
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
                <Button className="gap-2 self-end" disabled={(!prompt.trim() && attachments.length === 0) || isSending} onClick={sendMessage}>
                  <Send size={16} />
                  {isSending ? copy.sending : copy.send}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
                      onChange={(event) => setSelectedUserChannelID(Number(event.target.value) || 0)}
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
    return [{ id: createID(), title: "", messages: legacyMessages, skill_ids: [], mcp_server_ids: [], created_at: now, updated_at: now }]
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

function validateAttachment(file: File, settings: AdvancedChatSettings) {
  const maxBytes = Math.max(1, Number(settings.attachment_max_mb) || 1) * 1024 * 1024
  if (file.size > maxBytes) {
    return `附件 ${file.name} 超过 ${settings.attachment_max_mb} MB`
  }
  const type = (file.type || "application/octet-stream").toLowerCase()
  if (!mimeAllowed(type, settings.attachment_allowed_types)) {
    return `附件 ${file.name} 类型不允许：${type}`
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
    agent_id: stringFromUnknown(value.agent_id),
    skill_ids: stringArrayFromUnknown(value.skill_ids),
    mcp_server_ids: stringArrayFromUnknown(value.mcp_server_ids),
    model_name: stringFromUnknown(value.model_name),
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
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
    agent_id: input.agentID || undefined,
    skill_ids: [],
    mcp_server_ids: [],
    model_name: input.modelName || undefined,
    created_at: now,
    updated_at: now,
  }
}

function createMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: createID(), role, content, created_at: new Date().toISOString() }
}

function createID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function titleFromMessage(content: string, copy: typeof zhCopy) {
  const title = content.replace(/\s+/g, " ").trim()
  return title ? title.slice(0, 28) : copy.untitledSession
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

const zhCopy = {
  title: "聊天",
  sessions: "会话",
  newSession: "新会话",
  untitledSession: "新会话",
  messageCount: "{count} 条消息",
  deleteSession: "删除会话",
  config: "配置",
  advancedConfig: "高级聊天配置",
  apiKey: "令牌",
  channel: "渠道",
  endpoint: "接口",
  agent: "智能体",
  noAgentSelected: "未选择智能体",
  selectAgent: "选择智能体",
  noAgents: "暂无智能体",
  manageAgents: "管理智能体",
  newAgent: "新建智能体",
  editAgent: "编辑",
  deleteAgent: "删除",
  agentName: "智能体名称",
  defaultAgentName: "默认智能体",
  agentPrompt: "提示词",
  agentPromptPlaceholder: "输入这个智能体的系统提示词",
  agentDefaultModel: "默认模型",
  saveAgent: "保存智能体",
  agentSaved: "智能体已保存",
  agentDeleted: "智能体已删除",
  agentNameRequired: "请输入智能体名称",
  agentDefaultModelRequired: "请选择智能体默认模型",
  agentSaveFailed: "保存智能体失败",
  agentDeleteFailed: "删除智能体失败",
  basicSettings: "基础",
  addedAgent: "会话智能体",
  noAgentAdded: "这个会话还没有设置智能体",
  setAgent: "设置",
  replaceAgent: "替换",
  skills: "技能",
  selectSkills: "选择技能",
  noSkills: "暂无技能",
  addedSkills: "已添加技能",
  noSkillsAdded: "这个会话还没有添加技能",
  manageSkills: "管理技能",
  mcpServers: "MCP 服务",
  noMCPServers: "暂无可用 MCP 服务",
  addedMCPServers: "已添加 MCP 服务",
  noMCPServersAdded: "这个会话还没有添加 MCP 服务",
  selectMCPServer: "选择 MCP 服务",
  manageMCP: "管理 MCP",
  fromSkill: "来自技能",
  add: "添加",
  remove: "移除",
  sessionModel: "会话模型",
  done: "完成",
  chatCompletions: "Chat Completions",
  responsesAPI: "Responses",
  claudeMessages: "Claude Messages",
  geminiGenerate: "Gemini GenerateContent",
  selectKey: "选择令牌",
  selectChannel: "选择渠道",
  noKeys: "没有可用令牌",
  noChannels: "没有可用渠道",
  selectModel: "选择模型",
  conversation: "对话",
  noMessages: "暂无对话",
  promptPlaceholder: "输入消息",
  attachmentMessageTitle: "附件消息",
  addAttachment: "添加附件",
  removeAttachment: "移除附件",
  attachmentLimit: "单个附件不超过 {size} MB；允许类型：{types}",
  send: "发送",
  sending: "发送中",
  editMessage: "编辑消息",
  deleteMessage: "删除消息",
  saveMessage: "保存消息",
  cancelEdit: "取消编辑",
  keyRequired: "请选择令牌",
  channelRequired: "请选择渠道",
  modelRequired: "请选择模型",
  sendFailed: "发送失败",
  emptyResponse: "空响应",
}

const enCopy: typeof zhCopy = {
  title: "Chat",
  sessions: "Sessions",
  newSession: "New chat",
  untitledSession: "New chat",
  messageCount: "{count} messages",
  deleteSession: "Delete session",
  config: "Config",
  advancedConfig: "Advanced chat config",
  apiKey: "Token",
  channel: "Channel",
  endpoint: "Endpoint",
  agent: "Agent",
  noAgentSelected: "No agent",
  selectAgent: "Select agent",
  noAgents: "No agents",
  manageAgents: "Manage agents",
  newAgent: "New agent",
  editAgent: "Edit",
  deleteAgent: "Delete",
  agentName: "Agent name",
  defaultAgentName: "Default agent",
  agentPrompt: "Prompt",
  agentPromptPlaceholder: "Enter this agent's system prompt",
  agentDefaultModel: "Default model",
  saveAgent: "Save agent",
  agentSaved: "Agent saved",
  agentDeleted: "Agent deleted",
  agentNameRequired: "Enter an agent name",
  agentDefaultModelRequired: "Select a default model for the agent",
  agentSaveFailed: "Failed to save agent",
  agentDeleteFailed: "Failed to delete agent",
  basicSettings: "Basic",
  addedAgent: "Session agent",
  noAgentAdded: "No agent set for this session",
  setAgent: "Set",
  replaceAgent: "Replace",
  skills: "Skills",
  selectSkills: "Select skills",
  noSkills: "No skills",
  addedSkills: "Added skills",
  noSkillsAdded: "No skills added to this session",
  manageSkills: "Manage skills",
  mcpServers: "MCP servers",
  noMCPServers: "No available MCP servers",
  addedMCPServers: "Added MCP servers",
  noMCPServersAdded: "No MCP servers added to this session",
  selectMCPServer: "Select MCP server",
  manageMCP: "Manage MCP",
  fromSkill: "From skill",
  add: "Add",
  remove: "Remove",
  sessionModel: "Session model",
  done: "Done",
  chatCompletions: "Chat Completions",
  responsesAPI: "Responses",
  claudeMessages: "Claude Messages",
  geminiGenerate: "Gemini GenerateContent",
  selectKey: "Select token",
  selectChannel: "Select channel",
  noKeys: "No available tokens",
  noChannels: "No available channels",
  selectModel: "Select model",
  conversation: "Conversation",
  noMessages: "No messages",
  promptPlaceholder: "Enter message",
  attachmentMessageTitle: "Attachment message",
  addAttachment: "Add attachment",
  removeAttachment: "Remove attachment",
  attachmentLimit: "Each attachment up to {size} MB; allowed types: {types}",
  send: "Send",
  sending: "Sending",
  editMessage: "Edit message",
  deleteMessage: "Delete message",
  saveMessage: "Save message",
  cancelEdit: "Cancel edit",
  keyRequired: "Select a token first",
  channelRequired: "Select a channel first",
  modelRequired: "Select a model",
  sendFailed: "Send failed",
  emptyResponse: "Empty response",
}
