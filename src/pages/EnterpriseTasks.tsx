import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, Loader2, Plus, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

type TaskStatus = "draft" | "assigned" | "running" | "blocked" | "review" | "completed" | "cancelled"

interface EnterpriseTask { id: number; title: string; description: string; status: TaskStatus; priority: number; created_at: string; updated_at: string }
interface TasksResponse { tasks: EnterpriseTask[] }

const taskKey = ["enterprise-tasks"] as const

export default function EnterpriseTasks() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const client = useQueryClient()
  const { success, error } = useToast()
  const { data, isFetching, refetch } = useQuery<TasksResponse>({ queryKey: taskKey, queryFn: async () => (await api.get("/user/enterprise/tasks")).data })
  const create = useMutation({
    mutationFn: async () => api.post("/user/enterprise/tasks", { title, description }),
    onSuccess: () => { setTitle(""); setDescription(""); void client.invalidateQueries({ queryKey: taskKey }); success("任务已创建") },
    onError: (value: unknown) => error(message(value, "创建任务失败")),
  })
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: TaskStatus }) => api.patch(`/user/enterprise/tasks/${id}/status`, { status }),
    onSuccess: () => void client.invalidateQueries({ queryKey: taskKey }),
    onError: (value: unknown) => error(message(value, "更新任务失败")),
  })
  const tasks = data?.tasks || []
  const active = tasks.filter((task) => task.status === "assigned" || task.status === "running" || task.status === "blocked").length

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /><h1 className="text-2xl font-semibold">任务</h1></div><p className="mt-1 text-sm text-muted-foreground">查看、创建并跟进分配给你的企业任务。</p></div>
      <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>{isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}刷新</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="全部任务" value={tasks.length} /><Metric label="进行中" value={active} /><Metric label="已完成" value={tasks.filter((task) => task.status === "completed").length} /></div>
    <Card><CardHeader><CardTitle className="text-base">新建任务</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="任务标题" maxLength={200} /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="任务说明（可选）" /><Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}创建</Button></div></CardContent></Card>
    {tasks.length === 0 ? <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">还没有任务。创建一个任务，或等待管理者分派。</CardContent></Card> : <div className="space-y-3">{tasks.map((task) => <Card key={task.id}><CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><Link to={`/dashboard/tasks/${task.id}`} className="truncate font-medium hover:underline">{task.title}</Link><Status status={task.status} /></div>{task.description && <p className="mt-1 break-words text-sm text-muted-foreground">{task.description}</p>}<p className="mt-2 text-xs text-muted-foreground">更新于 {formatDate(task.updated_at)}</p></div><div className="flex shrink-0 gap-2">{task.status === "assigned" && <Button size="sm" onClick={() => updateStatus.mutate({ id: task.id, status: "running" })}>开始</Button>}{task.status === "running" && <Button size="sm" onClick={() => updateStatus.mutate({ id: task.id, status: "completed" })}>提交完成</Button>}{task.status === "blocked" && <Button size="sm" onClick={() => updateStatus.mutate({ id: task.id, status: "running" })}>继续</Button>}</div></CardContent></Card>)}</div>}
  </div>
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div> }
function Status({ status }: { status: TaskStatus }) { const labels: Record<TaskStatus, string> = { draft: "草稿", assigned: "待处理", running: "进行中", blocked: "受阻", review: "待负责人确认", completed: "已完成", cancelled: "已取消" }; const colors: Record<TaskStatus, string> = { draft: "bg-muted text-muted-foreground", assigned: "bg-blue-500/10 text-blue-700", running: "bg-amber-500/10 text-amber-700", blocked: "bg-red-500/10 text-red-700", review: "bg-violet-500/10 text-violet-700", completed: "bg-emerald-500/10 text-emerald-700", cancelled: "bg-muted text-muted-foreground" }; return <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status]}`}>{labels[status]}</span> }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date) }
function message(value: unknown, fallback: string) { const candidate = value as { response?: { data?: { error?: string } } }; return candidate.response?.data?.error || fallback }
