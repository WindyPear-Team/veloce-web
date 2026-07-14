import { useQuery } from "@tanstack/react-query"
import { Building2, Coins, Cpu, ShieldCheck, UsersRound, Workflow } from "lucide-react"
import api from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Organization { id: number; name: string; slug: string; status: string }
interface Member { id: number; user_id: number; role: string; status: string; user?: { username?: string; email?: string } }
interface Task { id: number; status: string }
interface Role { id: number; name: string; slug: string; builtin: boolean }

export default function EnterpriseManagement() {
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
  return <div className="space-y-5">
    <div><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><h1 className="text-2xl font-semibold">企业管理</h1></div><p className="mt-1 text-sm text-muted-foreground">{org ? `${org.name} · ${org.status === "active" ? "运行中" : org.status}` : "加载企业配置…"}</p></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map((item) => <Card key={item.title}><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-base">{item.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{item.description}</p></div><item.icon className="h-5 w-5 text-primary" /></CardHeader><CardContent><div className="text-2xl font-semibold">{item.value}</div><div className="mt-1 text-xs text-muted-foreground">{item.detail}</div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">企业模式专有配置</CardTitle></CardHeader><CardContent><div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3"><ConfigItem title="组织与部门" text="部门树、负责人、成员状态和资源归属。" /><ConfigItem title="任务与审批" text="任务模板、分派规则、SLA、审批节点和交付物。" /><ConfigItem title="设备与连接器" text="企业设备、个人连接器、工具白名单和授权有效期。" /><ConfigItem title="额度与成本" text="部门预算、员工额度、任务预留和消耗告警。" /><ConfigItem title="权限与策略" text="角色、细粒度授权、数据分类和风险策略。" /><ConfigItem title="知识与应用" text="部门知识库、Agent 发布范围和应用模板。" /></div></CardContent></Card>
  </div>
}

function ConfigItem({ title, text }: { title: string; text: string }) { return <div className="rounded-md border bg-muted/20 p-4"><div className="font-medium">{title}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div> }
