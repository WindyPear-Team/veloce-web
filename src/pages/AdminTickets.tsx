import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LifeBuoy, Loader2, RefreshCw, Send } from "lucide-react"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

type TicketStatus = "open" | "pending" | "answered" | "closed"
type TicketPriority = "low" | "normal" | "high" | "urgent"
interface TicketUser { id: number; username: string; email: string }
interface TicketMessage { id: number; is_staff: boolean; content: string; created_at: string; author: TicketUser }
interface Ticket { id: number; subject: string; category: string; priority: TicketPriority; status: TicketStatus; created_at: string; updated_at: string; requester: TicketUser; messages?: TicketMessage[] }
interface TicketsResponse { tickets: Ticket[] }
interface TicketResponse { ticket: Ticket }

const listKey = ["admin-tickets"] as const

export default function AdminTickets() {
  const client = useQueryClient()
  const { success, error } = useToast()
  const [selectedID, setSelectedID] = useState<number | null>(null)
  const [reply, setReply] = useState("")
  const tickets = useQuery<TicketsResponse>({ queryKey: listKey, queryFn: async () => (await api.get("/admin/tickets")).data })
  useEffect(() => { if (selectedID === null && tickets.data?.tickets[0]) setSelectedID(tickets.data.tickets[0].id) }, [selectedID, tickets.data?.tickets])
  const detail = useQuery<TicketResponse>({ queryKey: ["admin-ticket", selectedID], queryFn: async () => (await api.get(`/admin/tickets/${selectedID}`)).data, enabled: selectedID !== null })
  const invalidate = () => { void client.invalidateQueries({ queryKey: listKey }); if (selectedID !== null) void client.invalidateQueries({ queryKey: ["admin-ticket", selectedID] }) }
  const update = useMutation({
    mutationFn: async (payload: { status?: TicketStatus; priority?: TicketPriority }) => api.patch(`/admin/tickets/${selectedID}`, payload),
    onSuccess: () => { invalidate(); success("工单已更新") }, onError: (value: unknown) => error(errorMessage(value, "更新工单失败")),
  })
  const addReply = useMutation({
    mutationFn: async () => api.post(`/admin/tickets/${selectedID}/messages`, { content: reply }),
    onSuccess: () => { setReply(""); invalidate(); success("回复已发送") }, onError: (value: unknown) => error(errorMessage(value, "发送回复失败")),
  })
  const allTickets = tickets.data?.tickets || []
  const stats = useMemo(() => ({ pending: allTickets.filter((ticket) => ticket.status === "open" || ticket.status === "pending").length, answered: allTickets.filter((ticket) => ticket.status === "answered").length, closed: allTickets.filter((ticket) => ticket.status === "closed").length }), [allTickets])
  const selected = detail.data?.ticket

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><LifeBuoy className="size-5 text-primary" /><h1 className="text-2xl font-semibold">工单管理</h1></div><p className="mt-1 text-sm text-muted-foreground">处理用户的支持请求与问题反馈。</p></div><Button variant="outline" onClick={() => void tickets.refetch()} disabled={tickets.isFetching}>{tickets.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}刷新</Button></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="待处理" value={stats.pending} /><Metric label="已回复" value={stats.answered} /><Metric label="已关闭" value={stats.closed} /></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.65fr)]">
      <Card><CardHeader><CardTitle className="text-base">全部工单</CardTitle></CardHeader><CardContent className="space-y-2">{tickets.isLoading ? <Loading /> : allTickets.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">暂无工单</p> : allTickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => setSelectedID(ticket.id)} className={cn("w-full rounded-lg border p-3 text-left transition-colors", selectedID === ticket.id ? "border-primary bg-primary/5" : "hover:bg-muted/50")}><div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate font-medium">{ticket.subject}</span><StatusBadge status={ticket.status} /></div><p className="mt-1 truncate text-xs text-muted-foreground">{userName(ticket.requester)}</p><div className="mt-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>{categoryLabel(ticket.category)}</span><span>{formatDate(ticket.updated_at)}</span></div></button>)}</CardContent></Card>
      <Card className="min-h-125">{!selectedID ? <CardContent className="flex min-h-125 items-center justify-center text-sm text-muted-foreground">选择一张工单查看详情</CardContent> : detail.isLoading ? <CardContent className="flex min-h-125 items-center justify-center"><Loading /></CardContent> : selected ? <><CardHeader className="border-b"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="break-words">{selected.subject}</CardTitle><StatusBadge status={selected.status} /><PriorityBadge priority={selected.priority} /></div><p className="mt-1 text-sm text-muted-foreground">#{selected.id} · {categoryLabel(selected.category)} · {userName(selected.requester)} · {formatDate(selected.created_at)}</p></div><div className="flex shrink-0 gap-2"><Select value={selected.status} onValueChange={(value) => update.mutate({ status: value as TicketStatus })} disabled={update.isPending}><SelectTrigger className="w-25"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">待处理</SelectItem><SelectItem value="pending">处理中</SelectItem><SelectItem value="answered">已回复</SelectItem><SelectItem value="closed">已关闭</SelectItem></SelectContent></Select><Select value={selected.priority} onValueChange={(value) => update.mutate({ priority: value as TicketPriority })} disabled={update.isPending}><SelectTrigger className="w-20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">低</SelectItem><SelectItem value="normal">普通</SelectItem><SelectItem value="high">高</SelectItem><SelectItem value="urgent">紧急</SelectItem></SelectContent></Select></div></div></CardHeader><CardContent className="flex min-h-100 flex-col gap-4"><div className="flex-1 space-y-4">{selected.messages?.map((message) => <article key={message.id} className={cn("max-w-[90%] rounded-lg border px-3 py-2.5", message.is_staff ? "mr-auto bg-primary/5" : "ml-auto bg-muted/60")}><div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{message.is_staff ? "客服" : userName(message.author)}</span><time>{formatDate(message.created_at)}</time></div><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p></article>)}</div>{selected.status !== "closed" && <div className="border-t pt-4"><Textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} className="min-h-24" placeholder="输入回复内容..." /><div className="mt-3 flex justify-end"><Button disabled={!reply.trim() || addReply.isPending} onClick={() => addReply.mutate()}>{addReply.isPending ? <Loader2 className="animate-spin" /> : <Send />}发送回复</Button></div></div>}</CardContent></> : <CardContent className="flex min-h-125 items-center justify-center text-sm text-muted-foreground">无法加载工单详情</CardContent>}</Card>
    </div>
  </div>
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div> }
function Loading() { return <Loader2 className="size-5 animate-spin text-muted-foreground" /> }
function StatusBadge({ status }: { status: TicketStatus }) { const labels: Record<TicketStatus, string> = { open: "待处理", pending: "处理中", answered: "已回复", closed: "已关闭" }; const classes: Record<TicketStatus, string> = { open: "bg-blue-500/10 text-blue-700", pending: "bg-amber-500/10 text-amber-700", answered: "bg-emerald-500/10 text-emerald-700", closed: "bg-muted text-muted-foreground" }; return <Badge className={cn("border-0", classes[status])}>{labels[status]}</Badge> }
function PriorityBadge({ priority }: { priority: TicketPriority }) { const labels: Record<TicketPriority, string> = { low: "低", normal: "普通", high: "高", urgent: "紧急" }; return <span className="text-xs font-medium">{labels[priority]}优先级</span> }
function categoryLabel(value: string) { return ({ general: "一般咨询", technical: "技术问题", account: "账号问题", billing: "账单与充值", suggestion: "功能建议" } as Record<string, string>)[value] || "一般咨询" }
function userName(user: TicketUser) { return user.username || user.email || `用户 #${user.id}` }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date) }
function errorMessage(value: unknown, fallback: string) { const candidate = value as { response?: { data?: { error?: string } } }; return candidate.response?.data?.error || fallback }
