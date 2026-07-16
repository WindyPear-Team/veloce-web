import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, CirclePause, ClipboardCheck, Loader2, Plus, Play, RefreshCw, ShieldCheck, Target, UsersRound, XCircle } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

type CompanyState = "draft" | "bootstrap" | "operating" | "attention_required" | "safe_mode" | "paused" | "archived"
type WorkStatus = "planned" | "owner_decision" | "authorized" | "queued" | "executing" | "awaiting_review" | "verified" | "delivered" | "blocked" | "retryable_failure" | "dead_letter" | "cancelled"

interface Company { id: number; name: string; state: CompanyState; timezone: string; autonomy_level: string; daily_budget: string | number; monthly_budget: string | number; agent_group_id?: string; connector_device_id?: string; connector_workspace_path?: string; connector_command_prefixes?: string }
interface Objective { id: number; title: string; description: string; status: string; priority: number; target_date?: string }
interface WorkItem { id: number; objective_id?: number; title: string; description: string; definition_of_done: string; status: WorkStatus; priority: number; risk_level: string; estimated_cost: string | number; due_at?: string }
interface Approval { id: number; work_item_id: number; risk_level: string; status: string; requested_action: string; expires_at?: string }
interface StudioMember { id: string; name: string; type: "chief" | "worker" | "critic" | "reviewer" | "checker"; chat_agent_id?: string; default_model?: string }
interface StudioDetail { id: string; name: string; description?: string; agents: StudioMember[] }
interface ConnectorDevice { id: string; name: string; online: boolean; status: string }
interface CompanyData {
  company: Company | null
  bootstrap_required?: boolean
  objectives?: Objective[]
  work_items?: WorkItem[]
  approvals?: Approval[]
  budget?: { daily_limit: string | number; monthly_limit: string | number; reserved: string | number; consumed: string | number; monthly_reserved: string | number }
  balance_guard?: { current: string | number; floor: string | number }
  health?: { active_objectives: number; active_work_items: number; blocked_work_items: number; pending_approvals: number }
}

const companyKey = (studioID: string) => ["personal-company", studioID] as const
const personalCompanyURL = (path: string, studioID: string) => `${path}${path.includes("?") ? "&" : "?"}studio_id=${encodeURIComponent(studioID)}`
const PersonalCompanyStudioContext = createContext("")
const tabs = ["概览", "目标", "工作", "审批", "团队", "运行环境"] as const
type Tab = typeof tabs[number]

export default function PersonalCompany() {
  const { groupID = "" } = useParams()
  const client = useQueryClient()
  const { success, error } = useToast()
  const [tab, setTab] = useState<Tab>("概览")
  const [companyName, setCompanyName] = useState("")
  const [mission, setMission] = useState("")
  const [balanceFloor, setBalanceFloor] = useState("0")
  const [objectiveTitle, setObjectiveTitle] = useState("")
  const [workTitle, setWorkTitle] = useState("")
  const [definitionOfDone, setDefinitionOfDone] = useState("")
  const [riskLevel, setRiskLevel] = useState("r0")
  const balanceNoticeKey = useRef("")

  const companyQuery = useQuery<CompanyData>({ queryKey: companyKey(groupID), enabled: Boolean(groupID), refetchInterval: 10000, queryFn: async () => (await api.get(personalCompanyURL("/user/personal-company", groupID))).data })
  const refresh = () => void client.invalidateQueries({ queryKey: companyKey(groupID) })
  const bootstrap = useMutation({
    mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/bootstrap", groupID), { name: companyName, mission, balance_floor: balanceFloor, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", autonomy_level: "r0" }),
    onSuccess: () => { success("工作室运营已启用"); refresh() }, onError: (value: unknown) => error(message(value, "启用失败")),
  })
  const changeState = useMutation({
    mutationFn: async (action: "pause" | "resume") => api.post(personalCompanyURL(`/user/personal-company/${action}`, groupID)),
    onSuccess: () => refresh(), onError: (value: unknown) => error(message(value, "更新状态失败")),
  })
  const createObjective = useMutation({
    mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/objectives", groupID), { title: objectiveTitle }),
    onSuccess: () => { setObjectiveTitle(""); success("目标已创建"); refresh() }, onError: (value: unknown) => error(message(value, "创建目标失败")),
  })
  const createWork = useMutation({
    mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/work-items", groupID), { title: workTitle, definition_of_done: definitionOfDone, risk_level: riskLevel }),
    onSuccess: () => { setWorkTitle(""); setDefinitionOfDone(""); success(riskLevel === "r3" ? "工作项已提交，正在等待审批" : "工作项已创建"); refresh() }, onError: (value: unknown) => error(message(value, "创建工作项失败")),
  })
  const decideApproval = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: "approved" | "rejected" }) => api.post(personalCompanyURL(`/user/personal-company/approvals/${id}/decide`, groupID), { decision }),
    onSuccess: () => { success("审批已记录"); refresh() }, onError: (value: unknown) => error(message(value, "审批失败")),
  })
  const cancelWork = useMutation({
    mutationFn: async (id: number) => api.post(personalCompanyURL(`/user/personal-company/work-items/${id}/cancel`, groupID)),
    onSuccess: () => { success("工作项已取消"); refresh() }, onError: (value: unknown) => error(message(value, "取消失败")),
  })
  const queueWork = useMutation({
    mutationFn: async (id: number) => api.post(personalCompanyURL(`/user/personal-company/work-items/${id}/queue`, groupID)),
    onSuccess: () => { success("工作项已加入执行队列"); refresh() }, onError: (value: unknown) => error(message(value, "加入队列失败")),
  })
  const runWork = useMutation({
    mutationFn: async (id: number) => api.post(personalCompanyURL(`/user/personal-company/work-items/${id}/run`, groupID)),
    onSuccess: () => { success("已创建真实 Agent 运行"); refresh() }, onError: (value: unknown) => error(message(value, "启动工作失败")),
  })
  const updateRuntime = useMutation({
    mutationFn: async (input: { connector_device_id: string; connector_workspace_path: string; connector_command_prefixes: string[] }) => api.put(personalCompanyURL("/user/personal-company/runtime", groupID), input),
    onSuccess: () => { success("工作室连接器已保存"); refresh() }, onError: (value: unknown) => error(message(value, "保存连接器失败")),
  })
  useEffect(() => {
    const balance = companyQuery.data?.balance_guard
    if (!balance || Number(balance.current) > Number(balance.floor)) return
    const key = `${groupID}:${balance.current}:${balance.floor}`
    if (balanceNoticeKey.current === key) return
    balanceNoticeKey.current = key
    error(`工作室已因余额下限停止：当前 ${formatBudget(balance.current)}，下限 ${formatBudget(balance.floor)}`)
  }, [companyQuery.data?.balance_guard, error, groupID])

  if (companyQuery.isLoading) return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载公司状态</div>
  if (companyQuery.isError) return <LoadError onRetry={() => void companyQuery.refetch()} />
  if (!companyQuery.data?.company) return <BootstrapForm companyName={companyName} mission={mission} balanceFloor={balanceFloor} onCompanyName={setCompanyName} onMission={setMission} onBalanceFloor={setBalanceFloor} onSubmit={() => bootstrap.mutate()} pending={bootstrap.isPending} />

  const data = companyQuery.data
  const company = data.company as Company
  const objectives = data.objectives || []
  const workItems = data.work_items || []
  const approvals = data.approvals || []
  return <PersonalCompanyStudioContext.Provider value={groupID}><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><BriefcaseBusiness className="h-6 w-6 text-primary" /><h1 className="text-2xl font-semibold">工作室运营</h1><StateBadge state={company.state} /></div><p className="mt-1 text-sm text-muted-foreground">当前工作室：{groupID}。</p></div>
      <div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" title="刷新" onClick={refresh} disabled={companyQuery.isFetching}><RefreshCw className={`h-4 w-4 ${companyQuery.isFetching ? "animate-spin" : ""}`} /></Button>{company.state === "operating" ? <Button variant="outline" onClick={() => changeState.mutate("pause")} disabled={changeState.isPending}><CirclePause className="mr-2 h-4 w-4" />暂停</Button> : <Button onClick={() => changeState.mutate("resume")} disabled={changeState.isPending}><Play className="mr-2 h-4 w-4" />恢复运行</Button>}</div>
    </header>
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="个人公司导航">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item}{item === "审批" && approvals.length > 0 ? <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">{approvals.length}</span> : null}</button>)}</nav>
    {tab === "概览" && <Overview data={data} onShowApprovals={() => setTab("审批")} />}
    {tab === "目标" && <Objectives objectives={objectives} title={objectiveTitle} onTitle={setObjectiveTitle} onSubmit={() => createObjective.mutate()} pending={createObjective.isPending} />}
    {tab === "工作" && <WorkBoard workItems={workItems} title={workTitle} definitionOfDone={definitionOfDone} riskLevel={riskLevel} onTitle={setWorkTitle} onDefinition={setDefinitionOfDone} onRisk={setRiskLevel} onSubmit={() => createWork.mutate()} pending={createWork.isPending} onCancel={(id) => cancelWork.mutate(id)} onQueue={(id) => queueWork.mutate(id)} queuePending={queueWork.isPending} onRun={(id) => runWork.mutate(id)} runPending={runWork.isPending} />}
    {tab === "审批" && <Approvals approvals={approvals} pending={decideApproval.isPending} onDecide={(id, decision) => decideApproval.mutate({ id, decision })} />}
    {tab === "团队" && <StudioTeam />}
    {tab === "运行环境" && <StudioRuntime company={company} pending={updateRuntime.isPending} onSave={(input) => updateRuntime.mutate(input)} />}
  </div></PersonalCompanyStudioContext.Provider>
}

function BootstrapForm({ companyName, mission, balanceFloor, onCompanyName, onMission, onBalanceFloor, onSubmit, pending }: { companyName: string; mission: string; balanceFloor: string; onCompanyName: (value: string) => void; onMission: (value: string) => void; onBalanceFloor: (value: string) => void; onSubmit: () => void; pending: boolean }) {
  return <div className="mx-auto max-w-2xl py-8"><div className="border-b pb-5"><div className="flex items-center gap-2"><BriefcaseBusiness className="h-7 w-7 text-primary" /><h1 className="text-2xl font-semibold">启用工作室运营</h1></div><p className="mt-2 text-sm text-muted-foreground">为这个工作室定义目标边界。系统默认只允许 R0 工作，任何高影响行动都必须经过你的审批。</p></div><div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-medium">运营名称<Input value={companyName} onChange={(event) => onCompanyName(event.target.value)} placeholder="例如：WindyPear 产品工作室" maxLength={160} /></label><label className="grid gap-2 text-sm font-medium">当前使命<textarea value={mission} onChange={(event) => onMission(event.target.value)} placeholder="例如：在可控成本下持续交付产品改进" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={4000} /></label><label className="grid gap-2 text-sm font-medium">余额运行下限<Input type="number" min="0" step="0.000001" value={balanceFloor} onChange={(event) => onBalanceFloor(event.target.value)} /><span className="text-xs font-normal text-muted-foreground">余额到达此值时，工作室自动停止创建新会话并提醒你。</span></label><div className="flex justify-end"><Button disabled={!companyName.trim() || !mission.trim() || !balanceFloor.trim() || Number(balanceFloor) < 0 || pending} onClick={onSubmit}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}启用运营</Button></div></div></div>
}

function Overview({ data, onShowApprovals }: { data: CompanyData; onShowApprovals: () => void }) {
  const health = data.health || { active_objectives: 0, active_work_items: 0, blocked_work_items: 0, pending_approvals: 0 }
  const budget = data.budget || { daily_limit: 0, monthly_limit: 0, reserved: 0, consumed: 0, monthly_reserved: 0 }
  const balance = data.balance_guard
  return <div className="space-y-5">{balance && Number(balance.current) <= Number(balance.floor) && <div className="flex gap-3 border border-amber-500/40 bg-amber-500/5 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><div className="text-sm font-medium">余额低于工作室运行下限，已自动停止新会话</div><div className="mt-1 text-xs text-muted-foreground">当前余额 {formatBudget(balance.current)}，下限 {formatBudget(balance.floor)}。补充余额或调整运营设置后再恢复。</div></div></div>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Target} label="活跃目标" value={health.active_objectives} /><Metric icon={ClipboardCheck} label="进行中的工作" value={health.active_work_items} /><Metric icon={AlertTriangle} label="阻塞" value={health.blocked_work_items} tone={health.blocked_work_items > 0 ? "danger" : undefined} /><Metric icon={ShieldCheck} label="待你决策" value={health.pending_approvals} tone={health.pending_approvals > 0 ? "warning" : undefined} /></div><div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,.7fr)]"><Card><CardHeader><CardTitle className="text-base">当前工作</CardTitle><CardDescription>每个目标会自动启动工作室会话，并把结果和成本归档到任务账本。</CardDescription></CardHeader><CardContent className="space-y-2">{(data.work_items || []).length === 0 ? <Empty text="还没有工作项。先在“目标”中建立下一步。" /> : data.work_items?.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0"><div className="min-w-0"><div className="truncate text-sm font-medium">{item.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{riskLabel(item.risk_level)} · {statusLabel(item.status)}</div></div><StatusPill status={item.status} /></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">余额与成本</CardTitle><CardDescription>真实会话消耗从现有模型计费账本回写；余额低于运行下限时自动停止。</CardDescription></CardHeader><CardContent className="space-y-3">{balance && <><BudgetLine label="当前余额" value={balance.current} /><BudgetLine label="运行下限" value={balance.floor} /></>}<BudgetLine label="工作室消耗" value={budget.consumed} /></CardContent></Card></div>{health.pending_approvals > 0 && <div className="flex flex-col gap-3 border border-amber-500/40 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><div className="text-sm font-medium">有 {health.pending_approvals} 个高影响行动正在等待你决定</div><div className="mt-1 text-xs text-muted-foreground">R3 任务没有绑定的所有者批准，不会进入执行队列。</div></div></div><Button variant="outline" onClick={onShowApprovals}>查看审批</Button></div>}</div>
}

function Objectives({ objectives, title, onTitle, onSubmit, pending }: { objectives: Objective[]; title: string; onTitle: (value: string) => void; onSubmit: () => void; pending: boolean }) { return <div className="space-y-5"><NewItem label="新目标" placeholder="描述一个可验证的目标" value={title} onChange={onTitle} onSubmit={onSubmit} pending={pending} /><Card><CardHeader><CardTitle className="text-base">目标与计划</CardTitle></CardHeader><CardContent>{objectives.length === 0 ? <Empty text="尚未创建目标。" /> : <div className="divide-y">{objectives.map((objective) => <div key={objective.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{objective.title}</div>{objective.description && <p className="mt-1 text-sm text-muted-foreground">{objective.description}</p>}</div><span className="shrink-0 text-xs text-muted-foreground">优先级 {objective.priority}</span></div>)}</div>}</CardContent></Card></div> }

function WorkBoard({ workItems, title, definitionOfDone, riskLevel, onTitle, onDefinition, onRisk, onSubmit, pending, onCancel, onQueue, queuePending, onRun, runPending }: { workItems: WorkItem[]; title: string; definitionOfDone: string; riskLevel: string; onTitle: (value: string) => void; onDefinition: (value: string) => void; onRisk: (value: string) => void; onSubmit: () => void; pending: boolean; onCancel: (id: number) => void; onQueue: (id: number) => void; queuePending: boolean; onRun: (id: number) => void; runPending: boolean }) {
  const groups = useMemo(() => ([{ label: "计划", values: ["planned", "authorized", "queued"] }, { label: "进行中", values: ["executing", "awaiting_review", "verified"] }, { label: "等待决定", values: ["owner_decision", "blocked", "retryable_failure", "dead_letter"] }, { label: "已结束", values: ["delivered", "cancelled"] }]), [])
  return <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">新建工作项</CardTitle><CardDescription>R3 会自动创建审批单；R4 不会被系统接受。</CardDescription></CardHeader><CardContent><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem_auto]"><Input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="工作标题" maxLength={200} /><Input value={definitionOfDone} onChange={(event) => onDefinition(event.target.value)} placeholder="完成定义与验收证据" /><select value={riskLevel} onChange={(event) => onRisk(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="r0">R0 分析</option><option value="r1">R1 只读</option><option value="r2">R2 可逆</option><option value="r3">R3 需审批</option></select><Button disabled={!title.trim() || !definitionOfDone.trim() || pending} onClick={onSubmit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" />创建</>}</Button></div></CardContent></Card><div className="grid gap-4 xl:grid-cols-4">{groups.map((group) => { const items = workItems.filter((item) => group.values.includes(item.status)); return <section key={group.label} className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-medium">{group.label}</h2><span className="text-xs text-muted-foreground">{items.length}</span></div><div className="space-y-2">{items.length === 0 ? <div className="border border-dashed p-3 text-xs text-muted-foreground">无工作项</div> : items.map((item) => <Card key={item.id} className="shadow-none"><CardContent className="p-4"><div className="flex gap-2"><div className="min-w-0 flex-1"><div className="break-words text-sm font-medium">{item.title}</div><div className="mt-2 flex flex-wrap gap-1.5"><StatusPill status={item.status} /><span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{riskLabel(item.risk_level)}</span></div></div><div className="flex shrink-0 gap-1">{item.status === "queued" && <button onClick={() => onRun(item.id)} disabled={runPending} title="启动真实 Agent 运行" className="h-7 w-7 text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">{runPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</button>}{mayQueue(item.status) && <button onClick={() => onQueue(item.id)} disabled={queuePending} title="加入执行队列" className="h-7 w-7 text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">{queuePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</button>}{!isTerminal(item.status) && <button onClick={() => onCancel(item.id)} title="取消工作项" className="h-7 w-7 text-muted-foreground hover:text-destructive"><XCircle className="h-4 w-4" /></button>}</div></div><p className="mt-3 break-words text-xs text-muted-foreground">验收：{item.definition_of_done}</p></CardContent></Card>)}</div></section>})}</div></div>
}

function Approvals({ approvals, pending, onDecide }: { approvals: Approval[]; pending: boolean; onDecide: (id: number, decision: "approved" | "rejected") => void }) { return <Card><CardHeader><CardTitle className="text-base">审批与安全</CardTitle><CardDescription>批准只授权当前工作项的已绑定参数；它不扩大员工权限。</CardDescription></CardHeader><CardContent>{approvals.length === 0 ? <Empty text="没有等待处理的审批。" /> : <div className="divide-y">{approvals.map((approval) => <div key={approval.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-medium">{approval.requested_action}</div><div className="mt-1 text-xs text-muted-foreground">工作项 #{approval.work_item_id} · {riskLabel(approval.risk_level)}{approval.expires_at ? ` · ${formatDate(approval.expires_at)} 过期` : ""}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => onDecide(approval.id, "rejected")}>拒绝</Button><Button size="sm" disabled={pending} onClick={() => onDecide(approval.id, "approved")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 h-4 w-4" />批准</>}</Button></div></div>)}</div>}</CardContent></Card> }

function StudioTeam() {
  const studioID = useContext(PersonalCompanyStudioContext)
  const query = useQuery<StudioDetail>({ queryKey: ["advanced-chat-studio", studioID], queryFn: async () => (await api.get(`/user/advanced-chat/agent-groups/${encodeURIComponent(studioID)}`)).data })
  if (query.isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">正在加载组织...</div>
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />
  const members = query.data?.agents || []
  return <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">工作室团队</CardTitle><CardDescription>团队就是当前工作室成员。模型、技能、MCP 和协作角色都由工作室配置管理。</CardDescription></CardHeader><CardContent>{members.length === 0 ? <Empty text="当前工作室没有成员。" /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{members.map((member) => <div key={member.id} className="border p-4"><UsersRound className="h-5 w-5 text-primary" /><div className="mt-3 text-sm font-medium">{member.name || member.id}</div><div className="mt-1 text-xs text-muted-foreground">{member.type} · {member.default_model || "使用绑定 Agent 模型"}</div><div className="mt-3 text-xs text-muted-foreground">{member.chat_agent_id ? "已绑定 Agent" : "未绑定 Agent"}</div></div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">AI 成员生成</CardTitle><CardDescription>即将推出：根据目标和当前团队缺口生成候选 Agent 成员，并在工作室编辑器中确认后加入团队。</CardDescription></CardHeader><CardContent><Button variant="outline" disabled>即将推出</Button></CardContent></Card></div>
}

function StudioRuntime({ company, pending, onSave }: { company: Company; pending: boolean; onSave: (input: { connector_device_id: string; connector_workspace_path: string; connector_command_prefixes: string[] }) => void }) {
  const [deviceID, setDeviceID] = useState(company.connector_device_id || "")
  const [workspacePath, setWorkspacePath] = useState(company.connector_workspace_path || "")
  const [prefixes, setPrefixes] = useState(() => decodePrefixes(company.connector_command_prefixes))
  const devices = useQuery<ConnectorDevice[]>({ queryKey: ["advanced-chat-connector-devices"], queryFn: async () => { const response = await api.get("/user/advanced-chat/devices"); return Array.isArray(response.data) ? response.data : [] } })
  const onlineDevices = (devices.data || []).filter((device) => device.online || device.status === "online")
  return <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">工作室连接器</CardTitle><CardDescription>为自动工作会话指定可用的工作目录。模型、成员、Skill 与 MCP 始终使用工作室现有配置；连接器所有工具操作仍需手动批准。</CardDescription></CardHeader><CardContent className="grid gap-4"><label className="grid gap-2 text-sm font-medium">连接器<select value={deviceID} onChange={(event) => setDeviceID(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">不使用连接器（仅模型与 MCP）</option>{onlineDevices.map((device) => <option key={device.id} value={device.id}>{device.name || device.id}</option>)}</select></label>{devices.isLoading && <div className="text-xs text-muted-foreground">正在加载连接器...</div>}{!devices.isLoading && onlineDevices.length === 0 && <div className="text-xs text-muted-foreground">没有在线连接器。请先在 Agent Chat 的设备页面连接本机或 CLI 连接器。</div>}<label className="grid gap-2 text-sm font-medium">工作目录<Input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} disabled={!deviceID} placeholder="例如 D:\\dev\\project" /></label><label className="grid gap-2 text-sm font-medium">允许的命令前缀（每行一个）<textarea value={prefixes} onChange={(event) => setPrefixes(event.target.value)} disabled={!deviceID} placeholder={'例如\ngit status\ngo test'} className="min-h-24 rounded-md border bg-background p-3 font-mono text-sm" /></label><div className="flex justify-end"><Button disabled={pending || (!deviceID && Boolean(workspacePath.trim()))} onClick={() => onSave({ connector_device_id: deviceID, connector_workspace_path: workspacePath, connector_command_prefixes: prefixes.split("\n").map((value) => value.trim()).filter(Boolean) })}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}保存连接器</Button></div></CardContent></Card></div>
}

function NewItem({ label, placeholder, value, onChange, onSubmit, pending }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; onSubmit: () => void; pending: boolean }) { return <Card><CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-2 sm:flex-row"><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={200} /><Button className="shrink-0" disabled={!value.trim() || pending} onClick={onSubmit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" />创建</>}</Button></div></CardContent></Card> }
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: number; tone?: "danger" | "warning" }) { return <div className="border p-4"><Icon className={`h-5 w-5 ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-primary"}`} /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div> }
function BudgetLine({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{formatBudget(value)}</span></div> }
function StatusPill({ status }: { status: WorkStatus }) { return <span className={`rounded px-1.5 py-0.5 text-xs ${status === "blocked" || status === "owner_decision" || status === "retryable_failure" || status === "dead_letter" ? "bg-amber-500/15 text-amber-700" : status === "cancelled" ? "bg-muted text-muted-foreground" : status === "delivered" ? "bg-emerald-500/15 text-emerald-700" : "bg-blue-500/15 text-blue-700"}`}>{statusLabel(status)}</span> }
function Empty({ text }: { text: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div> }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">无法加载个人公司数据<Button variant="outline" size="sm" onClick={onRetry}>重试</Button></div> }
function StateBadge({ state }: { state: CompanyState }) { const label: Record<CompanyState, string> = { draft: "草稿", bootstrap: "初始化", operating: "运行中", attention_required: "需要关注", safe_mode: "安全模式", paused: "已暂停", archived: "已归档" }; return <span className={`rounded px-2 py-0.5 text-xs font-medium ${state === "operating" ? "bg-emerald-500/15 text-emerald-700" : state === "paused" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-700"}`}>{label[state]}</span> }
function statusLabel(value: string) { const labels: Record<string, string> = { planned: "已计划", owner_decision: "等待决定", authorized: "已授权", queued: "已排队", executing: "执行中", awaiting_review: "待复核", verified: "已验证", delivered: "已交付", blocked: "受阻", retryable_failure: "可重试失败", dead_letter: "需人工处理", cancelled: "已取消" }; return labels[value] || value }
function riskLabel(value: string) { return value.toUpperCase() }
function isTerminal(status: WorkStatus) { return status === "cancelled" || status === "delivered" }
function mayQueue(status: WorkStatus) { return status === "planned" || status === "authorized" }
function formatBudget(value: string | number) { const numberValue = typeof value === "string" ? Number(value) : value; return Number.isFinite(numberValue) ? numberValue.toLocaleString("zh-CN", { maximumFractionDigits: 4 }) : String(value) }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date) }
function decodePrefixes(value?: string) { try { const parsed: unknown = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").join("\n") : "" } catch { return "" } }
function message(value: unknown, fallback: string) { const candidate = value as { response?: { data?: { error?: string } } }; return candidate.response?.data?.error || fallback }
