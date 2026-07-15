import { useQuery } from "@tanstack/react-query"
import { Building2, ClipboardList, Monitor } from "lucide-react"
import type { ReactNode } from "react"
import { PageComponentSlots } from "@/components/layout/PageComponentSlots"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import api from "@/lib/api"
import { DASHBOARD_PAGE_KEY, defaultDashboardComponents } from "@/lib/page-layouts"
import { useI18n } from "@/lib/i18n"

interface CurrentUser {
  username?: string
}
interface EnterprisePortalResponse { organization: { name: string }; portal: { enabled: boolean; title: string; message: string; widgets: string[] }; summary: { running_tasks: number; assigned_tasks: number; employees: number; departments: number; devices: number } }

export default function Dashboard() {
  const { t } = useI18n()
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })
  const { data: enterprisePortal } = useQuery<EnterprisePortalResponse>({ queryKey: ["enterprise-portal"], queryFn: async () => (await api.get("/user/enterprise/portal")).data, retry: false })
  const portal = enterprisePortal?.portal

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("dashboard.title")}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {t("dashboard.signedInAs")} {user?.username || t("common.user")}
        </div>
      </div>

      <PageTitleSlot />
      {enterprisePortal && portal?.enabled && <section className="rounded-lg border bg-primary/5 p-5"><div className="flex items-start gap-3"><Building2 className="mt-0.5 h-6 w-6 text-primary" /><div><h2 className="text-xl font-semibold">{portal.title || enterprisePortal.organization.name}</h2>{portal.message && <p className="mt-1 text-sm text-muted-foreground">{portal.message}</p>}</div></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{portal.widgets.includes("tasks") && <PortalMetric icon={<ClipboardList className="h-4 w-4" />} label="进行中任务" value={enterprisePortal.summary.running_tasks} detail={`待处理 ${enterprisePortal.summary.assigned_tasks}`} />}{portal.widgets.includes("organization") && <PortalMetric icon={<Building2 className="h-4 w-4" />} label="组织成员" value={enterprisePortal.summary.employees} detail={`${enterprisePortal.summary.departments} 个部门`} />}{portal.widgets.includes("devices") && <PortalMetric icon={<Monitor className="h-4 w-4" />} label="企业设备" value={enterprisePortal.summary.devices} detail="已纳入企业管理" />}</div></section>}
      <PageComponentSlots pageKey={DASHBOARD_PAGE_KEY} slotKey="main" defaultItems={defaultDashboardComponents} />
      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function PortalMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: number; detail: string }) { return <div className="rounded-md border bg-background p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div> }
