import { useQuery } from "@tanstack/react-query"
import { PageComponentSlots } from "@/components/layout/PageComponentSlots"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import api from "@/lib/api"
import { DASHBOARD_PAGE_KEY, defaultDashboardComponents } from "@/lib/page-layouts"
import { useI18n } from "@/lib/i18n"

interface CurrentUser {
  username?: string
}

export default function Dashboard() {
  const { t } = useI18n()
  const { data: user } = useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get("/user/me")
      return res.data
    },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("dashboard.title")}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {t("dashboard.signedInAs")} {user?.username || t("common.user")}
        </div>
      </div>

      <PageTitleSlot />
      <PageComponentSlots pageKey={DASHBOARD_PAGE_KEY} slotKey="main" defaultItems={defaultDashboardComponents} />
      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}
