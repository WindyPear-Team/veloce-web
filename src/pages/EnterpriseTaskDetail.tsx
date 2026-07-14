import { useMemo, useState } from "react"
import { Link, useLocation, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, FolderKanban, Plus, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"

interface Task { id: number; title: string; description: string; status: string; owner_user_id: number; created_by_user_id: number }
interface Assignment { id: number; user_id: number; role: string }
interface Department { id: number; department_id: number }
interface DeviceAssignment { id: number; device_id: number; status: string; allowed_tools: string }
interface Detail { task: Task; assignments: Assignment[]; departments: Department[]; device_assignments: DeviceAssignment[]; pool?: { id?: number; name?: string; resource_user_id?: number }; quota_account?: { id?: number; limit_amount?: string; reserved_amount?: string; consumed_amount?: string } }
interface Member { id: number; user_id: number; status: string; user?: { username?: string; email?: string } }
interface OrgDepartment { id: number; name: string }

export default function EnterpriseTaskDetail() {
  const { id = "" } = useParams()
  const managed = new URLSearchParams(useLocation().search).get("managed") === "1"
  const client = useQueryClient()
  const { success, error } = useToast()
  const [memberID, setMemberID] = useState("")
  const [departmentID, setDepartmentID] = useState("")
  const base = managed ? `/user/enterprise/managed-tasks/${encodeURIComponent(id)}` : `/user/enterprise/tasks/${encodeURIComponent(id)}`
  const detail = useQuery<Detail>({ queryKey: ["enterprise-task-detail", id, managed], queryFn: async () => (await api.get(base)).data, enabled: Boolean(id) })
  const members = useQuery<{ members: Member[] }>({ queryKey: ["enterprise-members"], queryFn: async () => (await api.get("/user/enterprise/members")).data, enabled: managed })
  const departments = useQuery<{ departments: OrgDepartment[] }>({ queryKey: ["enterprise-departments"], queryFn: async () => (await api.get("/user/enterprise/departments")).data, enabled: managed })
  const refresh = () => client.invalidateQueries({ queryKey: ["enterprise-task-detail", id, managed] })
  const addParticipant = useMutation({ mutationFn: () => api.post(`${base}/participants`, { user_id: Number(memberID), role: "participant" }), onSuccess: () => { setMemberID(""); void refresh(); success("参与人已添加") }, onError: () => error("添加参与人失败") })
  const removeParticipant = useMutation({ mutationFn: (userID: number) => api.delete(`${base}/participants/${userID}`), onSuccess: () => { void refresh(); success("参与人已移除") }, onError: () => error("移除参与人失败") })
  const addDepartment = useMutation({ mutationFn: () => api.post(`${base}/departments`, { department_id: Number(departmentID) }), onSuccess: () => { setDepartmentID(""); void refresh(); success("部门已添加") }, onError: () => error("添加部门失败") })
  const removeDepartment = useMutation({ mutationFn: (value: number) => api.delete(`${base}/departments/${value}`), onSuccess: () => { void refresh(); success("部门已移除") }, onError: () => error("移除部门失败") })
  const task = detail.data?.task
  const memberName = (userID: number) => { const member = members.data?.members.find((item) => item.user_id === userID); return member?.user?.username || member?.user?.email || `员工 #${userID}` }
  const departmentName = (value: number) => departments.data?.departments.find((item) => item.id === value)?.name || `部门 #${value}`
  const availableMembers = useMemo(() => (members.data?.members || []).filter((member) => member.status === "active" && !detail.data?.assignments.some((item) => item.user_id === member.user_id)), [detail.data?.assignments, members.data?.members])
  if (detail.isLoading) return <div className="p-6 text-sm text-muted-foreground">加载任务详情...</div>
  if (!task) return <div className="p-6 text-sm text-destructive">任务不存在或无权访问。</div>
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-3"><div><Link className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" to={managed ? "/dashboard/enterprise" : "/dashboard/tasks"}><ArrowLeft size={16} />返回任务列表</Link><h1 className="text-2xl font-semibold">{task.title}</h1><p className="mt-1 text-sm text-muted-foreground">状态：{task.status} · 负责人：员工 #{task.owner_user_id}</p></div></div>
    {task.description && <Card><CardContent className="p-5 text-sm whitespace-pre-wrap">{task.description}</CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="任务资源池"><div className="flex items-center gap-2 text-sm"><FolderKanban className="h-4 w-4 text-teal-600" />{detail.data?.pool?.name || "任务池尚未初始化"}</div><p className="mt-2 text-xs text-muted-foreground">{task.status === "running" ? "任务进行中，可使用池内会话、文件和已分配设备。" : "任务未进行中，池内资源已锁定。"}</p><p className="mt-2 text-xs text-muted-foreground">额度：{detail.data?.quota_account?.limit_amount || "0"} / 预留 {detail.data?.quota_account?.reserved_amount || "0"} / 消耗 {detail.data?.quota_account?.consumed_amount || "0"}</p></Panel>
      <Panel title="已分配设备">{detail.data?.device_assignments.length ? <div className="space-y-2">{detail.data.device_assignments.map((item) => <div key={item.id} className="text-sm">设备 #{item.device_id} · {item.status}</div>)}</div> : <Empty text="暂无任务设备分配。" />}</Panel>
      <Panel title="参与人">{managed && <div className="mb-3 flex gap-2"><select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={memberID} onChange={(event) => setMemberID(event.target.value)}><option value="">添加员工</option>{availableMembers.map((item) => <option key={item.id} value={item.user_id}>{memberName(item.user_id)}</option>)}</select><Button size="icon" disabled={!memberID || addParticipant.isPending} onClick={() => addParticipant.mutate()} aria-label="添加参与人"><Plus size={16} /></Button></div>}<div className="space-y-2">{detail.data?.assignments.map((item) => <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm"><span>{memberName(item.user_id)} · {item.role}</span>{managed && item.role !== "owner" && <Button size="icon" variant="ghost" onClick={() => removeParticipant.mutate(item.user_id)} aria-label="移除参与人"><Trash2 size={15} /></Button>}</div>)}</div></Panel>
      <Panel title="参与部门">{managed && <div className="mb-3 flex gap-2"><select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={departmentID} onChange={(event) => setDepartmentID(event.target.value)}><option value="">添加部门</option>{(departments.data?.departments || []).filter((item) => !detail.data?.departments.some((entry) => entry.department_id === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button size="icon" disabled={!departmentID || addDepartment.isPending} onClick={() => addDepartment.mutate()} aria-label="添加部门"><Plus size={16} /></Button></div>}<div className="space-y-2">{detail.data?.departments.length ? detail.data.departments.map((item) => <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm"><span>{departmentName(item.department_id)}</span>{managed && <Button size="icon" variant="ghost" onClick={() => removeDepartment.mutate(item.department_id)} aria-label="移除部门"><Trash2 size={15} /></Button>}</div>) : <Empty text="暂无参与部门。" />}</div></Panel>
    </div>
  </div>
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card> }
function Empty({ text }: { text: string }) { return <p className="text-sm text-muted-foreground">{text}</p> }
