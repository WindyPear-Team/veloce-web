import { createContext, useContext, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowRightLeft, BriefcaseBusiness, CheckCircle2, CirclePause, ClipboardCheck, Loader2, Plus, Play, RefreshCw, ShieldCheck, Target, UserPlus, UsersRound, XCircle } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"

type CompanyState = "draft" | "bootstrap" | "operating" | "attention_required" | "safe_mode" | "paused" | "archived"
type WorkStatus = "planned" | "owner_decision" | "authorized" | "queued" | "executing" | "awaiting_review" | "verified" | "delivered" | "blocked" | "retryable_failure" | "dead_letter" | "cancelled"

interface Company { id: number; name: string; state: CompanyState; timezone: string; autonomy_level: string; daily_budget: string | number; monthly_budget: string | number; agent_group_id?: string }
interface Objective { id: number; title: string; description: string; status: string; priority: number; target_date?: string }
interface WorkItem { id: number; objective_id?: number; title: string; description: string; definition_of_done: string; status: WorkStatus; priority: number; risk_level: string; estimated_cost: string | number; due_at?: string }
interface Approval { id: number; work_item_id: number; risk_level: string; status: string; requested_action: string; expires_at?: string }
interface Employee { id: number; name: string; role: string; status: string; version: number; advanced_chat_agent_id?: string; max_risk_level: string }
interface AdvancedChatAgent { id: string; name: string; default_model: string }
interface ConnectorDevice { id: string; name: string; status: string }
interface RoleTemplate { id: number; name: string; template_key: string; definition_of_done: string; max_risk_level: string }
interface RecruitmentPlan { id: number; title: string; capability_gap: string; expected_benefit: string; max_risk_level: string; status: string; employee_id?: number }
interface CompanyData {
  company: Company | null
  bootstrap_required?: boolean
  objectives?: Objective[]
  work_items?: WorkItem[]
  approvals?: Approval[]
  budget?: { daily_limit: string | number; monthly_limit: string | number; reserved: string | number; consumed: string | number; monthly_reserved: string | number }
  health?: { active_objectives: number; active_work_items: number; blocked_work_items: number; pending_approvals: number }
}

const companyKey = (studioID: string) => ["personal-company", studioID] as const
const personalCompanyURL = (path: string, studioID: string) => `${path}${path.includes("?") ? "&" : "?"}studio_id=${encodeURIComponent(studioID)}`
const PersonalCompanyStudioContext = createContext("")
const tabs = ["概览", "目标", "工作", "审批", "组织"] as const
type Tab = typeof tabs[number]

export default function PersonalCompany() {
  const { groupID = "" } = useParams()
  const client = useQueryClient()
  const { success, error } = useToast()
  const [tab, setTab] = useState<Tab>("概览")
  const [companyName, setCompanyName] = useState("")
  const [mission, setMission] = useState("")
  const [objectiveTitle, setObjectiveTitle] = useState("")
  const [workTitle, setWorkTitle] = useState("")
  const [definitionOfDone, setDefinitionOfDone] = useState("")
  const [riskLevel, setRiskLevel] = useState("r0")

  const companyQuery = useQuery<CompanyData>({ queryKey: companyKey(groupID), enabled: Boolean(groupID), queryFn: async () => (await api.get(personalCompanyURL("/user/personal-company", groupID))).data })
  const refresh = () => void client.invalidateQueries({ queryKey: companyKey(groupID) })
  const bootstrap = useMutation({
    mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/bootstrap", groupID), { name: companyName, mission, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", autonomy_level: "r0" }),
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

  if (companyQuery.isLoading) return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载公司状态</div>
  if (companyQuery.isError) return <LoadError onRetry={() => void companyQuery.refetch()} />
  if (!companyQuery.data?.company) return <BootstrapForm companyName={companyName} mission={mission} onCompanyName={setCompanyName} onMission={setMission} onSubmit={() => bootstrap.mutate()} pending={bootstrap.isPending} />

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
    {tab === "组织" && <Organization />}
  </div></PersonalCompanyStudioContext.Provider>
}

function BootstrapForm({ companyName, mission, onCompanyName, onMission, onSubmit, pending }: { companyName: string; mission: string; onCompanyName: (value: string) => void; onMission: (value: string) => void; onSubmit: () => void; pending: boolean }) {
  return <div className="mx-auto max-w-2xl py-8"><div className="border-b pb-5"><div className="flex items-center gap-2"><BriefcaseBusiness className="h-7 w-7 text-primary" /><h1 className="text-2xl font-semibold">启用工作室运营</h1></div><p className="mt-2 text-sm text-muted-foreground">为这个工作室定义目标边界。系统默认只允许 R0 工作，任何高影响行动都必须经过你的审批。</p></div><div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm font-medium">运营名称<Input value={companyName} onChange={(event) => onCompanyName(event.target.value)} placeholder="例如：WindyPear 产品工作室" maxLength={160} /></label><label className="grid gap-2 text-sm font-medium">当前使命<textarea value={mission} onChange={(event) => onMission(event.target.value)} placeholder="例如：在可控成本下持续交付产品改进" className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" maxLength={4000} /></label><div className="flex justify-end"><Button disabled={!companyName.trim() || !mission.trim() || pending} onClick={onSubmit}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}启用运营</Button></div></div></div>
}

function Overview({ data, onShowApprovals }: { data: CompanyData; onShowApprovals: () => void }) {
  const health = data.health || { active_objectives: 0, active_work_items: 0, blocked_work_items: 0, pending_approvals: 0 }
  const budget = data.budget || { daily_limit: 0, monthly_limit: 0, reserved: 0, consumed: 0, monthly_reserved: 0 }
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Target} label="活跃目标" value={health.active_objectives} /><Metric icon={ClipboardCheck} label="进行中的工作" value={health.active_work_items} /><Metric icon={AlertTriangle} label="阻塞" value={health.blocked_work_items} tone={health.blocked_work_items > 0 ? "danger" : undefined} /><Metric icon={ShieldCheck} label="待你决策" value={health.pending_approvals} tone={health.pending_approvals > 0 ? "warning" : undefined} /></div><div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,.7fr)]"><Card><CardHeader><CardTitle className="text-base">当前工作</CardTitle><CardDescription>每项工作必须有完成定义、预算和风险等级。</CardDescription></CardHeader><CardContent className="space-y-2">{(data.work_items || []).length === 0 ? <Empty text="还没有工作项。先在“目标”或“工作”中建立下一步。" /> : data.work_items?.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0"><div className="min-w-0"><div className="truncate text-sm font-medium">{item.title}</div><div className="mt-0.5 text-xs text-muted-foreground">{riskLabel(item.risk_level)} · {statusLabel(item.status)}</div></div><StatusPill status={item.status} /></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">预算账本</CardTitle><CardDescription>预留在创建工作项时发生，实际消耗由执行尝试记录。</CardDescription></CardHeader><CardContent className="space-y-3"><BudgetLine label="日预算" value={budget.daily_limit} /><BudgetLine label="月预算" value={budget.monthly_limit} /><BudgetLine label="已预留" value={budget.reserved} /><BudgetLine label="已消耗" value={budget.consumed} /></CardContent></Card></div>{health.pending_approvals > 0 && <div className="flex flex-col gap-3 border border-amber-500/40 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><div className="text-sm font-medium">有 {health.pending_approvals} 个高影响行动正在等待你决定</div><div className="mt-1 text-xs text-muted-foreground">R3 任务没有绑定的所有者批准，不会进入执行队列。</div></div></div><Button variant="outline" onClick={onShowApprovals}>查看审批</Button></div>}</div>
}

function Objectives({ objectives, title, onTitle, onSubmit, pending }: { objectives: Objective[]; title: string; onTitle: (value: string) => void; onSubmit: () => void; pending: boolean }) { return <div className="space-y-5"><NewItem label="新目标" placeholder="描述一个可验证的目标" value={title} onChange={onTitle} onSubmit={onSubmit} pending={pending} /><Card><CardHeader><CardTitle className="text-base">目标与计划</CardTitle></CardHeader><CardContent>{objectives.length === 0 ? <Empty text="尚未创建目标。" /> : <div className="divide-y">{objectives.map((objective) => <div key={objective.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{objective.title}</div>{objective.description && <p className="mt-1 text-sm text-muted-foreground">{objective.description}</p>}</div><span className="shrink-0 text-xs text-muted-foreground">优先级 {objective.priority}</span></div>)}</div>}</CardContent></Card></div> }

function WorkBoard({ workItems, title, definitionOfDone, riskLevel, onTitle, onDefinition, onRisk, onSubmit, pending, onCancel, onQueue, queuePending, onRun, runPending }: { workItems: WorkItem[]; title: string; definitionOfDone: string; riskLevel: string; onTitle: (value: string) => void; onDefinition: (value: string) => void; onRisk: (value: string) => void; onSubmit: () => void; pending: boolean; onCancel: (id: number) => void; onQueue: (id: number) => void; queuePending: boolean; onRun: (id: number) => void; runPending: boolean }) {
  const studioID = useContext(PersonalCompanyStudioContext)
  const client = useQueryClient()
  const { success, error } = useToast()
  const [handoffWorkItem, setHandoffWorkItem] = useState<WorkItem | null>(null)
  const [toEmployeeID, setToEmployeeID] = useState("")
  const [completionSummary, setCompletionSummary] = useState("")
  const [evidence, setEvidence] = useState("[]")
  const [risks, setRisks] = useState("[]")
  const [nextSteps, setNextSteps] = useState("")
  const orgQuery = useQuery<{ employees: Employee[] }>({ queryKey: ["personal-company-org", studioID], queryFn: async () => (await api.get(personalCompanyURL("/user/personal-company/org-chart", studioID))).data })
  const handoff = useMutation({
    mutationFn: async () => api.post(personalCompanyURL(`/user/personal-company/work-items/${handoffWorkItem?.id}/handoffs`, studioID), { to_employee_id: Number(toEmployeeID), completion_summary: completionSummary, evidence, risks, next_steps: nextSteps }),
    onSuccess: () => { success("交接包已创建，等待接收方明确决定"); setHandoffWorkItem(null); setToEmployeeID(""); setCompletionSummary(""); setEvidence("[]"); setRisks("[]"); setNextSteps(""); void client.invalidateQueries({ queryKey: companyKey(studioID) }) },
    onError: (value: unknown) => error(message(value, "创建交接包失败")),
  })
  const eligibleEmployees = (orgQuery.data?.employees || []).filter((employee) => employee.status === "active" || employee.status === "probation")
  const groups = useMemo(() => ([{ label: "计划", values: ["planned", "authorized", "queued"] }, { label: "进行中", values: ["executing", "awaiting_review", "verified"] }, { label: "等待决定", values: ["owner_decision", "blocked", "retryable_failure", "dead_letter"] }, { label: "已结束", values: ["delivered", "cancelled"] }]), [])
  return <div className="space-y-5"><Card><CardHeader><CardTitle className="text-base">新建工作项</CardTitle><CardDescription>R3 会自动创建审批单；R4 不会被系统接受。</CardDescription></CardHeader><CardContent><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem_auto]"><Input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="工作标题" maxLength={200} /><Input value={definitionOfDone} onChange={(event) => onDefinition(event.target.value)} placeholder="完成定义与验收证据" /><select value={riskLevel} onChange={(event) => onRisk(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="r0">R0 分析</option><option value="r1">R1 只读</option><option value="r2">R2 可逆</option><option value="r3">R3 需审批</option></select><Button disabled={!title.trim() || !definitionOfDone.trim() || pending} onClick={onSubmit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" />创建</>}</Button></div></CardContent></Card><div className="grid gap-4 xl:grid-cols-4">{groups.map((group) => { const items = workItems.filter((item) => group.values.includes(item.status)); return <section key={group.label} className="min-w-0"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-medium">{group.label}</h2><span className="text-xs text-muted-foreground">{items.length}</span></div><div className="space-y-2">{items.length === 0 ? <div className="border border-dashed p-3 text-xs text-muted-foreground">无工作项</div> : items.map((item) => <Card key={item.id} className="shadow-none"><CardContent className="p-4"><div className="flex gap-2"><div className="min-w-0 flex-1"><div className="break-words text-sm font-medium">{item.title}</div><div className="mt-2 flex flex-wrap gap-1.5"><StatusPill status={item.status} /><span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{riskLabel(item.risk_level)}</span></div></div><div className="flex shrink-0 gap-1">{mayHandoff(item.status) && <button onClick={() => setHandoffWorkItem(item)} title="创建交接包" className="h-7 w-7 text-muted-foreground hover:text-primary"><ArrowRightLeft className="h-4 w-4" /></button>}{item.status === "queued" && <button onClick={() => onRun(item.id)} disabled={runPending} title="启动真实 Agent 运行" className="h-7 w-7 text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">{runPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</button>}{mayQueue(item.status) && <button onClick={() => onQueue(item.id)} disabled={queuePending} title="加入执行队列" className="h-7 w-7 text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">{queuePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</button>}{!isTerminal(item.status) && <button onClick={() => onCancel(item.id)} title="取消工作项" className="h-7 w-7 text-muted-foreground hover:text-destructive"><XCircle className="h-4 w-4" /></button>}</div></div><p className="mt-3 break-words text-xs text-muted-foreground">验收：{item.definition_of_done}</p></CardContent></Card>)}</div></section>})}</div><Dialog open={handoffWorkItem !== null} onOpenChange={(open) => { if (!open && !handoff.isPending) setHandoffWorkItem(null) }}><DialogContent><DialogHeader><DialogTitle>创建结构化交接</DialogTitle><DialogDescription>{handoffWorkItem?.title || ""}</DialogDescription></DialogHeader><div className="grid gap-3"><select value={toEmployeeID} onChange={(event) => setToEmployeeID(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">选择接收员工</option>{eligibleEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.role})</option>)}</select><textarea value={completionSummary} onChange={(event) => setCompletionSummary(event.target.value)} placeholder="已完成内容与关键结论" className="min-h-20 resize-y rounded-md border bg-background p-3 text-sm" maxLength={4000} /><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder='证据 JSON，例如 ["https://..."]' className="min-h-16 resize-y rounded-md border bg-background p-3 font-mono text-xs" maxLength={8000} /><textarea value={risks} onChange={(event) => setRisks(event.target.value)} placeholder='风险 JSON，例如 ["待核实的假设"]' className="min-h-16 resize-y rounded-md border bg-background p-3 font-mono text-xs" maxLength={8000} /><textarea value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} placeholder="接收方下一步和开放问题" className="min-h-20 resize-y rounded-md border bg-background p-3 text-sm" maxLength={4000} /></div><DialogFooter><Button disabled={!toEmployeeID || !completionSummary.trim() || !nextSteps.trim() || handoff.isPending} onClick={() => handoff.mutate()}>{handoff.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "发送交接包"}</Button></DialogFooter></DialogContent></Dialog></div>
}

function Approvals({ approvals, pending, onDecide }: { approvals: Approval[]; pending: boolean; onDecide: (id: number, decision: "approved" | "rejected") => void }) { return <Card><CardHeader><CardTitle className="text-base">审批与安全</CardTitle><CardDescription>批准只授权当前工作项的已绑定参数；它不扩大员工权限。</CardDescription></CardHeader><CardContent>{approvals.length === 0 ? <Empty text="没有等待处理的审批。" /> : <div className="divide-y">{approvals.map((approval) => <div key={approval.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-medium">{approval.requested_action}</div><div className="mt-1 text-xs text-muted-foreground">工作项 #{approval.work_item_id} · {riskLabel(approval.risk_level)}{approval.expires_at ? ` · ${formatDate(approval.expires_at)} 过期` : ""}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => onDecide(approval.id, "rejected")}>拒绝</Button><Button size="sm" disabled={pending} onClick={() => onDecide(approval.id, "approved")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 h-4 w-4" />批准</>}</Button></div></div>)}</div>}</CardContent></Card> }

function Organization() {
  const studioID = useContext(PersonalCompanyStudioContext)
  const client = useQueryClient()
  const { success, error } = useToast()
  const [title, setTitle] = useState("")
  const [capabilityGap, setCapabilityGap] = useState("")
  const [riskLevel, setRiskLevel] = useState("r0")
  const [bindingEmployee, setBindingEmployee] = useState<Employee | null>(null)
  const [agentID, setAgentID] = useState("")
  const [connectorID, setConnectorID] = useState("")
  const [workspacePath, setWorkspacePath] = useState("")
  const query = useQuery<{ employees: Employee[]; role_templates: RoleTemplate[]; recruitment_plans: RecruitmentPlan[] }>({ queryKey: ["personal-company-org", studioID], queryFn: async () => (await api.get(personalCompanyURL("/user/personal-company/org-chart", studioID))).data })
  const agentsQuery = useQuery<AdvancedChatAgent[]>({ queryKey: ["advanced-chat-agents"], queryFn: async () => (await api.get("/user/advanced-chat/agents")).data })
  const devicesQuery = useQuery<ConnectorDevice[]>({ queryKey: ["advanced-chat-devices"], queryFn: async () => (await api.get("/user/advanced-chat/devices")).data })
  const refresh = () => void client.invalidateQueries({ queryKey: ["personal-company-org", studioID] })
  const createPlan = useMutation({ mutationFn: async () => api.post(personalCompanyURL("/user/personal-company/staffing/recruitment-plans", studioID), { title, capability_gap: capabilityGap, max_risk_level: riskLevel }), onSuccess: () => { setTitle(""); setCapabilityGap(""); success("招聘计划已创建，等待你的明确批准"); refresh() }, onError: (value: unknown) => error(message(value, "创建招聘计划失败")) })
  const approvePlan = useMutation({ mutationFn: async (id: number) => api.post(personalCompanyURL(`/user/personal-company/staffing/recruitment-plans/${id}/approve`, studioID)), onSuccess: () => { success("已创建试岗员工"); refresh() }, onError: (value: unknown) => error(message(value, "批准招聘计划失败")) })
  const bindRuntime = useMutation({ mutationFn: async () => api.post(personalCompanyURL(`/user/personal-company/employees/${bindingEmployee?.id}/runtime-binding`, studioID), { advanced_chat_agent_id: agentID, connector_device_id: connectorID, connector_workspace_path: workspacePath }), onSuccess: () => { success("员工已绑定既有 Agent 与模型"); setBindingEmployee(null); setAgentID(""); setConnectorID(""); setWorkspacePath(""); refresh() }, onError: (value: unknown) => error(message(value, "绑定运行时失败")) })
  if (query.isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">正在加载组织...</div>
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />
  const employees = query.data?.employees || []
  const templates = query.data?.role_templates || []
  const plans = query.data?.recruitment_plans || []
  return <div className="space-y-5">
    <Card><CardHeader><CardTitle className="text-base">最小执行团队</CardTitle><CardDescription>员工是受版本和权限约束的服务实体，不是用户账号。为员工绑定已有 Advanced Chat Agent 后，会直接使用该代理已配置的模型、技能与 MCP。</CardDescription></CardHeader><CardContent>{employees.length === 0 ? <Empty text="尚未建立岗位。" /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{employees.map((employee) => <div key={employee.id} className="border p-4"><UsersRound className="h-5 w-5 text-primary" /><div className="mt-3 text-sm font-medium">{employee.name}</div><div className="mt-1 text-xs text-muted-foreground">{employee.role} · v{employee.version}</div><div className="mt-2 text-xs text-muted-foreground">{employee.advanced_chat_agent_id ? `Agent 已绑定` : "尚未绑定 Agent"}</div><div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="rounded bg-muted px-1.5 py-0.5">{employee.status === "probation" ? "试岗" : employee.status}</span><Button size="sm" variant="outline" onClick={() => setBindingEmployee(employee)}>绑定运行时</Button></div></div>)}</div>}</CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-2"><section className="border p-5"><div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /><h2 className="text-base font-semibold">能力缺口与招聘</h2></div><p className="mt-1 text-sm text-muted-foreground">计划不会自动招人。批准后只创建低风险试岗版本。</p><div className="mt-4 grid gap-3"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="候选岗位名称" maxLength={200} /><Input value={capabilityGap} onChange={(event) => setCapabilityGap(event.target.value)} placeholder="要补足的能力缺口" maxLength={1000} /><div className="flex flex-col gap-2 sm:flex-row"><select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)} className="h-10 min-w-32 rounded-md border bg-background px-3 text-sm"><option value="r0">R0 本地分析</option><option value="r1">R1 只读</option></select><Button className="sm:ml-auto" disabled={!title.trim() || !capabilityGap.trim() || createPlan.isPending} onClick={() => createPlan.mutate()}>{createPlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" />提出招聘计划</>}</Button></div></div></section><section className="border p-5"><h2 className="text-base font-semibold">岗位模板</h2><p className="mt-1 text-sm text-muted-foreground">模板定义职责、交付和风险上限，不等于工具授权。</p><div className="mt-4 space-y-2">{templates.length === 0 ? <div className="text-sm text-muted-foreground">尚无岗位模板。</div> : templates.map((template) => <div key={template.id} className="flex items-start justify-between gap-3 border-b py-2 last:border-0"><div className="min-w-0"><div className="text-sm font-medium">{template.name}</div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.definition_of_done}</p></div><span className="shrink-0 text-xs text-muted-foreground">{template.max_risk_level.toUpperCase()}</span></div>)}</div></section></div>
    <section className="border p-5"><h2 className="text-base font-semibold">招聘计划</h2><div className="mt-3 divide-y">{plans.length === 0 ? <div className="py-6 text-sm text-muted-foreground">没有招聘计划。</div> : plans.map((plan) => <div key={plan.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="text-sm font-medium">{plan.title}</div><p className="mt-1 break-words text-xs text-muted-foreground">{plan.capability_gap} · {plan.max_risk_level.toUpperCase()}</p></div><div className="flex shrink-0 items-center gap-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{recruitmentStatusLabel(plan.status)}</span>{plan.status === "proposed" && <Button size="sm" disabled={approvePlan.isPending} onClick={() => approvePlan.mutate(plan.id)}>{approvePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "批准试岗"}</Button>}</div></div>)}</div></section>
    <Dialog open={bindingEmployee !== null} onOpenChange={(open) => { if (!open && !bindRuntime.isPending) setBindingEmployee(null) }}><DialogContent><DialogHeader><DialogTitle>绑定员工运行时</DialogTitle><DialogDescription>{bindingEmployee?.name || ""} 将使用所选现有 Agent 的默认模型和既有能力配置。连接器操作仍走手动审批。</DialogDescription></DialogHeader><div className="grid gap-3"><select value={agentID} onChange={(event) => setAgentID(event.target.value)} disabled={agentsQuery.isLoading || agentsQuery.isError} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">{agentsQuery.isLoading ? "正在加载已有 Agent..." : agentsQuery.isError ? "加载 Agent 失败" : "选择已有 Agent"}</option>{(agentsQuery.data || []).filter((agent) => agent.default_model).map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.default_model}</option>)}</select>{!agentsQuery.isLoading && !agentsQuery.isError && (agentsQuery.data || []).filter((agent) => agent.default_model).length === 0 && <p className="text-xs text-muted-foreground">未找到配置了默认模型的 Agent。请先在 Advanced Chat 创建或配置 Agent。</p>}<select value={connectorID} onChange={(event) => setConnectorID(event.target.value)} disabled={devicesQuery.isLoading || devicesQuery.isError} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">{devicesQuery.isLoading ? "正在加载连接器..." : devicesQuery.isError ? "加载连接器失败" : "不使用连接器"}</option>{(devicesQuery.data || []).filter((device) => device.status === "online").map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select>{connectorID && <Input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} placeholder="连接器工作区绝对路径" />}</div><DialogFooter><Button disabled={!agentID || bindRuntime.isPending} onClick={() => bindRuntime.mutate()}>{bindRuntime.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "绑定"}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function NewItem({ label, placeholder, value, onChange, onSubmit, pending }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; onSubmit: () => void; pending: boolean }) { return <Card><CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-2 sm:flex-row"><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={200} /><Button className="shrink-0" disabled={!value.trim() || pending} onClick={onSubmit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" />创建</>}</Button></div></CardContent></Card> }
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Target; label: string; value: number; tone?: "danger" | "warning" }) { return <div className="border p-4"><Icon className={`h-5 w-5 ${tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-primary"}`} /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div> }
function BudgetLine({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium">{formatBudget(value)}</span></div> }
function StatusPill({ status }: { status: WorkStatus }) { return <span className={`rounded px-1.5 py-0.5 text-xs ${status === "blocked" || status === "owner_decision" || status === "retryable_failure" || status === "dead_letter" ? "bg-amber-500/15 text-amber-700" : status === "cancelled" ? "bg-muted text-muted-foreground" : status === "delivered" ? "bg-emerald-500/15 text-emerald-700" : "bg-blue-500/15 text-blue-700"}`}>{statusLabel(status)}</span> }
function Empty({ text }: { text: string }) { return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div> }
function LoadError({ onRetry }: { onRetry: () => void }) { return <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">无法加载个人公司数据<Button variant="outline" size="sm" onClick={onRetry}>重试</Button></div> }
function StateBadge({ state }: { state: CompanyState }) { const label: Record<CompanyState, string> = { draft: "草稿", bootstrap: "初始化", operating: "运行中", attention_required: "需要关注", safe_mode: "安全模式", paused: "已暂停", archived: "已归档" }; return <span className={`rounded px-2 py-0.5 text-xs font-medium ${state === "operating" ? "bg-emerald-500/15 text-emerald-700" : state === "paused" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-700"}`}>{label[state]}</span> }
function statusLabel(value: string) { const labels: Record<string, string> = { planned: "已计划", owner_decision: "等待决定", authorized: "已授权", queued: "已排队", executing: "执行中", awaiting_review: "待复核", verified: "已验证", delivered: "已交付", blocked: "受阻", retryable_failure: "可重试失败", dead_letter: "需人工处理", cancelled: "已取消" }; return labels[value] || value }
function recruitmentStatusLabel(value: string) { const labels: Record<string, string> = { proposed: "待批准", approved: "已批准", rejected: "已拒绝", hired: "已录用" }; return labels[value] || value }
function riskLabel(value: string) { return value.toUpperCase() }
function isTerminal(status: WorkStatus) { return status === "cancelled" || status === "delivered" }
function mayQueue(status: WorkStatus) { return status === "planned" || status === "authorized" }
function mayHandoff(status: WorkStatus) { return status === "executing" || status === "awaiting_review" || status === "verified" || status === "blocked" }
function formatBudget(value: string | number) { const numberValue = typeof value === "string" ? Number(value) : value; return Number.isFinite(numberValue) ? numberValue.toLocaleString("zh-CN", { maximumFractionDigits: 4 }) : String(value) }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date) }
function message(value: unknown, fallback: string) { const candidate = value as { response?: { data?: { error?: string } } }; return candidate.response?.data?.error || fallback }
