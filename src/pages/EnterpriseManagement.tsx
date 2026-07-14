import { useState } from "react"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, Coins, Cpu, ShieldCheck, UsersRound, Workflow } from "lucide-react"
import api from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Organization { id: number; name: string; slug: string; status: string }
interface Member { id: number; user_id: number; role: string; status: string; user?: { username?: string; email?: string } }
interface Task { id: number; status: string }
interface Role { id: number; name: string; slug: string; builtin: boolean }

export default function EnterpriseManagement() {
	const [activeTab, setActiveTab] = useState<EnterpriseTab>("organization")
  const organization = useQuery<{ organization: Organization }>({ queryKey: ["enterprise-organization"], queryFn: async () => (await api.get("/user/enterprise/organization")).data })
  const members = useQuery<{ members: Member[] }>({ queryKey: ["enterprise-members"], queryFn: async () => (await api.get("/user/enterprise/members")).data })
  const roles = useQuery<{ roles: Role[] }>({ queryKey: ["enterprise-roles"], queryFn: async () => (await api.get("/user/enterprise/roles")).data })
  const tasks = useQuery<{ tasks: Task[] }>({ queryKey: ["enterprise-tasks"], queryFn: async () => (await api.get("/user/enterprise/tasks")).data })
  const memberList = members.data?.members || []
  const taskList = tasks.data?.tasks || []
  const org = organization.data?.organization
  const cards = [
    { title: "成员与部门", description: "成员、部门结构、岗位和汇报关系", value: memberList.length, detail: `${memberList.filter((item) => item.status === "active").length} 名在职成员`, icon: UsersRound },
    { title: "任务中心", description: "任务分派、负责人、SLA 和交付物", value: taskList.length, detail: `${taskList.filter((item) => item.status === "running").length} 项执行中`, icon: Workflow },
    { title: "设备与连接器", description: "企业设备池、员工连接器和任务级授权", value: "-", detail: "设备分配策略待配置", icon: Cpu },
    { title: "额度中心", description: "组织、部门、员工和任务的预算账本", value: "-", detail: "额度账户待配置", icon: Coins },
    { title: "安全与权限", description: "角色、权限、审批和访问策略", value: roles.data?.roles.length || 0, detail: "预置及自定义角色", icon: ShieldCheck },
  ]
  const tabs: { id: EnterpriseTab; label: string }[] = [{ id: "organization", label: "组织" }, { id: "members", label: "成员与部门" }, { id: "tasks", label: "任务" }, { id: "devices", label: "设备与连接器" }, { id: "quota", label: "额度" }, { id: "security", label: "安全权限" }]
  return <div className="space-y-5">
    <div><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><h1 className="text-2xl font-semibold">企业管理</h1></div><p className="mt-1 text-sm text-muted-foreground">{org ? `${org.name} · ${org.status === "active" ? "运行中" : org.status}` : "加载企业配置…"}</p></div>
    <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${activeTab === tab.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>)}</div>
    {activeTab === "organization" && <Section title="组织配置" description="管理企业基本信息、运行状态、Workspace 与数据分类边界。"><div className="grid gap-4 sm:grid-cols-3"><Metric label="企业名称" value={org?.name || "-"} /><Metric label="企业标识" value={org?.slug || "-"} /><Metric label="状态" value={org?.status || "-"} /></div></Section>}
    {activeTab === "members" && <Section title="成员与部门" description="成员、部门树、负责人、岗位与汇报关系。"><div className="space-y-2">{memberList.length ? memberList.map((member) => <Row key={member.id} title={member.user?.username || member.user?.email || `员工 #${member.user_id}`} detail={`${member.role} · ${member.status}`} />) : <Empty text="尚无可查看的成员数据。" />}</div></Section>}
    {activeTab === "tasks" && <Section title="任务与审批" description="任务模板、分派、负责人、参与人、SLA 和交付物。"><div className="grid gap-4 sm:grid-cols-3"><Metric label="当前可见任务" value={String(taskList.length)} /><Metric label="执行中" value={String(taskList.filter((task) => task.status === "running").length)} /><Metric label="预置流程" value="待配置" /></div></Section>}
    {activeTab === "devices" && <Section title="设备与连接器" description="企业设备池、员工自有连接器、任务级授权、工具白名单与自动回收。"><ConfigItem title="下一步配置" text="设备池和授权分配 API 已在后端就绪；管理页面将接入设备登记、部门/员工/任务授权和有效期管理。" /></Section>}
    {activeTab === "quota" && <Section title="额度与成本" description="组织→部门→员工→任务的额度分配、预留、消耗和释放。"><ConfigItem title="下一步配置" text="额度账本和预留服务已就绪；管理页面将接入预算账户、分配额度、消耗流水和超额告警。" /></Section>}
    {activeTab === "security" && <Section title="安全与权限" description="角色、权限、绑定、审批与细粒度数据访问策略。"><div className="space-y-2">{roles.data?.roles.length ? roles.data.roles.map((role) => <Row key={role.id} title={role.name} detail={`${role.slug}${role.builtin ? " · 预置角色" : " · 自定义角色"}`} />) : <Empty text="暂无可查看的角色数据。" />}</div></Section>}
    <div className="hidden">{cards.length}</div>
  </div>
}

function ConfigItem({ title, text }: { title: string; text: string }) { return <div className="rounded-md border bg-muted/20 p-4"><div className="font-medium">{title}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div> }
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle><p className="text-sm text-muted-foreground">{description}</p></CardHeader><CardContent>{children}</CardContent></Card> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md border p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate text-lg font-semibold">{value}</div></div> }
function Row({ title, detail }: { title: string; detail: string }) { return <div className="flex items-center justify-between rounded-md border p-3"><span className="font-medium">{title}</span><span className="text-xs text-muted-foreground">{detail}</span></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</div> }
type EnterpriseTab = "organization" | "members" | "tasks" | "devices" | "quota" | "security"
