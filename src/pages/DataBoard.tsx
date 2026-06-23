import { BarChart3, Filter, LineChart, PieChart, RefreshCw } from "lucide-react"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import type { PublicSettings } from "@/lib/public-settings"
import { withPublicSettingsDefaults } from "@/lib/public-settings"

interface TokenLog {
  id: number
  created_at: string
  api_key_id?: number | null
  user_channel_id?: number | null
  channel_id?: number | null
  cost: string | number
  model_name: string
  input_tokens: number
  output_tokens: number
}

interface APIKeyOption {
  id: number
  name: string
  key_prefix: string
}

interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

interface DataBoardLogResult {
  items: TokenLog[]
  total: number
  truncated: boolean
}

type TimeGranularity = "hour" | "day" | "week" | "month"
type MetricKey = "cost" | "requests" | "tokens"
type RangePreset = "24h" | "7d" | "30d" | "12m" | "all"

interface DataBoardFilters {
  startTime: string
  endTime: string
  granularity: TimeGranularity
  metric: MetricKey
  apiKeyID: string
  modelName: string
}

interface TimeBucket {
  start: Date
  key: string
  label: string
  value: number
  cost: number
  requests: number
  tokens: number
}

interface HourMetric {
  hour: number
  value: number
}

interface ModelTrend {
  buckets: ModelBucket[]
  models: string[]
}

interface ModelBucket {
  key: string
  label: string
  counts: Record<string, number>
  total: number
}

interface TokenUsage {
  input: number
  output: number
}

interface SummaryMetric {
  title: string
  value: string
}

const pageSize = 100
const maxLoadedLogs = 5000
const maxFilledBuckets = 400

export default function DataBoard() {
  const { language, t } = useI18n()
  const copy = language === "zh" ? zhCopy : enCopy
  const [filters, setFilters] = useState<DataBoardFilters>(() => defaultFilters())
  const { data: apiKeys = [] } = useQuery<APIKeyOption[]>({
    queryKey: ["api-keys", "data-board-filters"],
    queryFn: async () => {
      const res = await api.get("/user/api-keys")
      return Array.isArray(res.data) ? res.data.map(normalizeAPIKeyOption) : []
    },
  })
  const { data: logResult = emptyLogResult(), isFetching } = useQuery<DataBoardLogResult>({
    queryKey: ["logs", "user", "data-board", "advanced", filters],
    queryFn: () => fetchDataBoardLogs(filters),
  })
  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const res = await api.get("/public/settings")
      return res.data
    },
  })

  const currencyDisplayName = withPublicSettingsDefaults(settings).payment_currency_display_name
  const logs = logResult.items
  const chartRange = useMemo(() => resolveChartRange(logs, filters), [filters, logs])
  const hourlySpend = useMemo(() => buildHourlyMetric(logs, chartRange, filters.metric), [chartRange, filters.metric, logs])
  const timeSeries = useMemo(() => buildTimeSeries(logs, chartRange, filters.granularity, filters.metric), [chartRange, filters.granularity, filters.metric, logs])
  const modelTrend = useMemo(() => buildModelTrend(logs, timeSeries, chartRange, filters.granularity, filters.metric, copy.other), [chartRange, copy.other, filters.granularity, filters.metric, logs, timeSeries])
  const tokenUsage = useMemo(() => buildTokenUsage(logs, chartRange), [chartRange, logs])
  const summary = useMemo(() => buildSummary(logs, chartRange, currencyDisplayName, copy), [chartRange, copy, currencyDisplayName, logs])

  const updateFilter = <K extends keyof DataBoardFilters>(key: K, value: DataBoardFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const applyPreset = (preset: RangePreset) => {
    setFilters((current) => ({ ...current, ...presetRange(preset) }))
  }

  const resetFilters = () => {
    setFilters(defaultFilters())
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t("dataBoard.title")}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{t("dataBoard.subtitle")}</div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{copy.advancedFilters}</CardTitle>
          <Filter className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-4">
            <label className="space-y-2 text-sm">
              <span className="font-medium">{copy.startTime}</span>
              <Input type="datetime-local" value={filters.startTime} onChange={(event) => updateFilter("startTime", event.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{copy.endTime}</span>
              <Input type="datetime-local" value={filters.endTime} onChange={(event) => updateFilter("endTime", event.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{copy.granularity}</span>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={filters.granularity} onChange={(event) => updateFilter("granularity", event.target.value as TimeGranularity)}>
                <option value="hour">{copy.granularityHour}</option>
                <option value="day">{copy.granularityDay}</option>
                <option value="week">{copy.granularityWeek}</option>
                <option value="month">{copy.granularityMonth}</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{copy.metric}</span>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={filters.metric} onChange={(event) => updateFilter("metric", event.target.value as MetricKey)}>
                <option value="cost">{copy.metricCost}</option>
                <option value="requests">{copy.metricRequests}</option>
                <option value="tokens">{copy.metricTokens}</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-2 text-sm">
              <span className="font-medium">{copy.apiKey}</span>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={filters.apiKeyID} onChange={(event) => updateFilter("apiKeyID", event.target.value)}>
                <option value="">{copy.allAPIKeys}</option>
                {apiKeys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.name || copy.apiKeyFallback} {key.key_prefix ? `(${key.key_prefix})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">{copy.modelName}</span>
              <Input value={filters.modelName} placeholder={copy.modelNamePlaceholder} onChange={(event) => updateFilter("modelName", event.target.value)} />
            </label>
            <div className="flex items-end gap-2">
              <Button variant="outline" className="gap-2" onClick={resetFilters}>
                <RefreshCw size={16} />
                {copy.reset}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["24h", "7d", "30d", "12m", "all"] as RangePreset[]).map((preset) => (
              <Button key={preset} variant="outline" size="sm" onClick={() => applyPreset(preset)}>
                {copy.presets[preset]}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{isFetching ? copy.loading : copy.loadedSummary.replace("{loaded}", String(logs.length)).replace("{total}", String(logResult.total))}</span>
            {logResult.truncated && <span>{copy.truncated.replace("{limit}", String(maxLoadedLogs))}</span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{copy.hourlyDistribution}</CardTitle>
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <HourlyMetricChart data={hourlySpend} metric={filters.metric} currencyDisplayName={currencyDisplayName} copy={copy} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{copy.timeSeries}</CardTitle>
            <LineChart className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={timeSeries} metric={filters.metric} currencyDisplayName={currencyDisplayName} copy={copy} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("dashboard.modelTrend")}</CardTitle>
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ModelTrendChart data={modelTrend} metric={filters.metric} currencyDisplayName={currencyDisplayName} copy={copy} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("dashboard.tokenUsage")}</CardTitle>
          <PieChart className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <TokenUsageChart data={tokenUsage} copy={copy} />
        </CardContent>
      </Card>
    </div>
  )
}

function HourlyMetricChart({ data, metric, currencyDisplayName, copy }: { data: HourMetric[]; metric: MetricKey; currencyDisplayName: string; copy: DataBoardCopy }) {
  const maxValue = Math.max(...data.map((item) => item.value), 0)
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex h-40 min-w-[520px] items-end gap-1 rounded-md border p-3">
          {data.map((item) => {
            const height = maxValue > 0 ? Math.max(4, (item.value / maxValue) * 128) : 4
            return (
              <div key={item.hour} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height }}
                  title={`${hourLabel(item.hour)} ${formatMetric(item.value, metric, currencyDisplayName, copy)}`}
                />
                <div className="h-4 text-[10px] text-muted-foreground">
                  {item.hour % 3 === 0 ? String(item.hour).padStart(2, "0") : ""}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
    </div>
  )
}

function TimeSeriesChart({ data, metric, currencyDisplayName, copy }: { data: TimeBucket[]; metric: MetricKey; currencyDisplayName: string; copy: DataBoardCopy }) {
  const maxValue = Math.max(...data.map((item) => item.value), 0)
  const minWidth = Math.max(360, data.length * 44)
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex h-44 items-end gap-2 rounded-md border p-3" style={{ minWidth }}>
          {data.map((item) => {
            const height = maxValue > 0 ? Math.max(4, (item.value / maxValue) * 132) : 4
            return (
              <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="text-[10px] text-muted-foreground">{metric === "requests" ? item.requests : ""}</div>
                <div
                  className="w-full max-w-10 rounded-t bg-green-500/80"
                  style={{ height }}
                  title={`${item.label} ${formatMetric(item.value, metric, currencyDisplayName, copy)} / ${item.requests}`}
                />
                <div className="h-4 max-w-16 truncate text-[10px] text-muted-foreground">{item.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ModelTrendChart({ data, metric, currencyDisplayName, copy }: { data: ModelTrend; metric: MetricKey; currencyDisplayName: string; copy: DataBoardCopy }) {
  const maxTotal = Math.max(...data.buckets.map((item) => item.total), 0)
  const minWidth = Math.max(360, data.buckets.length * 44)
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="flex h-44 items-end gap-2 rounded-md border p-3" style={{ minWidth }}>
          {data.buckets.map((bucket) => {
            const height = maxTotal > 0 ? Math.max(4, (bucket.total / maxTotal) * 132) : 4
            return (
              <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t" style={{ height }}>
                  {data.models.map((modelName, index) => {
                    const count = bucket.counts[modelName] || 0
                    const segmentHeight = bucket.total > 0 ? (count / bucket.total) * height : 0
                    return (
                      <div
                        key={modelName}
                        style={{ height: segmentHeight, backgroundColor: chartColors[index % chartColors.length] }}
                        title={`${modelName}: ${formatMetric(count, metric, currencyDisplayName, copy)}`}
                      />
                    )
                  })}
                </div>
                <div className="h-4 max-w-16 truncate text-[10px] text-muted-foreground">{bucket.label}</div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {data.models.length === 0 ? (
          <span>{copy.noData}</span>
        ) : data.models.map((modelName, index) => (
          <span key={modelName} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
            {modelName}
          </span>
        ))}
      </div>
    </div>
  )
}

function TokenUsageChart({ data, copy }: { data: TokenUsage; copy: DataBoardCopy }) {
  const total = data.input + data.output
  const inputPercent = total > 0 ? (data.input / total) * 100 : 0
  const outputPercent = total > 0 ? (data.output / total) * 100 : 0
  return (
    <div className="space-y-4">
      <div className="flex h-6 overflow-hidden rounded-md border">
        <div className="bg-blue-500" style={{ width: `${inputPercent}%` }} title={`${data.input}`} />
        <div className="bg-amber-500" style={{ width: `${outputPercent}%` }} title={`${data.output}`} />
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{copy.inputTokens}</div>
          <div className="mt-1 text-xl font-semibold">{formatInteger(data.input)}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">{copy.outputTokens}</div>
          <div className="mt-1 text-xl font-semibold">{formatInteger(data.output)}</div>
        </div>
      </div>
    </div>
  )
}

async function fetchDataBoardLogs(filters: DataBoardFilters): Promise<DataBoardLogResult> {
  const first = await api.get("/user/logs", { params: logQueryParams(filters, 1) })
  const firstPage = paginatedResult<TokenLog>(first.data, 1)
  const total = firstPage.total
  const maxRows = Math.min(total || firstPage.items.length, maxLoadedLogs)
  const items = [...firstPage.items]
  let page = firstPage.page + 1

  while (items.length < maxRows) {
    const res = await api.get("/user/logs", { params: logQueryParams(filters, page) })
    const next = paginatedResult<TokenLog>(res.data, page)
    if (next.items.length === 0) {
      break
    }
    items.push(...next.items.slice(0, maxRows - items.length))
    page += 1
  }

  return { items, total, truncated: total > items.length }
}

function logQueryParams(filters: DataBoardFilters, page: number) {
  return {
    page,
    page_size: pageSize,
    ...(filters.startTime ? { start_time: filters.startTime } : {}),
    ...(filters.endTime ? { end_time: filters.endTime } : {}),
    ...(filters.apiKeyID ? { api_key_id: filters.apiKeyID } : {}),
    ...(filters.modelName.trim() ? { model_name: filters.modelName.trim() } : {}),
  }
}

function paginatedResult<T>(data: unknown, page: number): PaginatedResult<T> {
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length, page, page_size: pageSize }
  }
  if (data && typeof data === "object") {
    const item = data as { items?: unknown; total?: unknown; page?: unknown; page_size?: unknown }
    return {
      items: Array.isArray(item.items) ? item.items as T[] : [],
      total: typeof item.total === "number" ? item.total : 0,
      page: typeof item.page === "number" ? item.page : page,
      page_size: typeof item.page_size === "number" ? item.page_size : pageSize,
    }
  }
  return { items: [], total: 0, page, page_size: pageSize }
}

function buildHourlyMetric(logs: TokenLog[], range: ChartRange, metric: MetricKey): HourMetric[] {
  const data = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }))
  for (const log of logs) {
    const date = validDate(log.created_at)
    if (!date || !dateInRange(date, range)) {
      continue
    }
    data[date.getHours()].value += logMetric(log, metric)
  }
  return data
}

function buildTimeSeries(logs: TokenLog[], range: ChartRange, granularity: TimeGranularity, metric: MetricKey): TimeBucket[] {
  const fillEmpty = estimatedBucketCount(range, granularity) <= maxFilledBuckets
  const buckets = new Map<string, TimeBucket>()
  if (fillEmpty) {
    for (let cursor = startOfBucket(range.start, granularity); cursor <= range.end; cursor = addBucket(cursor, granularity)) {
      const key = bucketKey(cursor, granularity)
      buckets.set(key, emptyTimeBucket(cursor, key, granularity))
    }
  }

  for (const log of logs) {
    const date = validDate(log.created_at)
    if (!date || !dateInRange(date, range)) {
      continue
    }
    const start = startOfBucket(date, granularity)
    const key = bucketKey(start, granularity)
    const bucket = buckets.get(key) || emptyTimeBucket(start, key, granularity)
    const cost = Number(log.cost || 0)
    const tokens = logTokens(log)
    bucket.cost += cost
    bucket.requests += 1
    bucket.tokens += tokens
    bucket.value += logMetric(log, metric)
    buckets.set(key, bucket)
  }

  return Array.from(buckets.values()).sort((a, b) => a.start.getTime() - b.start.getTime())
}

function buildModelTrend(logs: TokenLog[], buckets: TimeBucket[], range: ChartRange, granularity: TimeGranularity, metric: MetricKey, otherLabel: string): ModelTrend {
  const totals = new Map<string, number>()
  for (const log of logs) {
    const date = validDate(log.created_at)
    if (!date || !dateInRange(date, range)) {
      continue
    }
    const modelName = log.model_name || "-"
    totals.set(modelName, (totals.get(modelName) || 0) + logMetric(log, metric))
  }

  const models = Array.from(totals.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([modelName]) => modelName)
  if (totals.size > models.length) {
    models.push(otherLabel)
  }
  const modelSet = new Set(models)
  const keyed = new Map(buckets.map((bucket) => [bucket.key, { key: bucket.key, label: bucket.label, counts: {}, total: 0 } as ModelBucket]))

  for (const log of logs) {
    const date = validDate(log.created_at)
    if (!date || !dateInRange(date, range)) {
      continue
    }
    const key = bucketKey(startOfBucket(date, granularity), granularity)
    const bucket = keyed.get(key)
    if (!bucket) {
      continue
    }
    const rawModelName = log.model_name || "-"
    const modelName = modelSet.has(rawModelName) ? rawModelName : otherLabel
    const value = logMetric(log, metric)
    bucket.counts[modelName] = (bucket.counts[modelName] || 0) + value
    bucket.total += value
  }

  return { buckets: Array.from(keyed.values()), models }
}

function buildTokenUsage(logs: TokenLog[], range: ChartRange): TokenUsage {
  return logs.reduce<TokenUsage>((total, log) => {
    const date = validDate(log.created_at)
    if (!date || !dateInRange(date, range)) {
      return total
    }
    return {
      input: total.input + Number(log.input_tokens || 0),
      output: total.output + Number(log.output_tokens || 0),
    }
  }, { input: 0, output: 0 })
}

function buildSummary(logs: TokenLog[], range: ChartRange, currencyDisplayName: string, copy: DataBoardCopy): SummaryMetric[] {
  const scoped = logs.filter((log) => {
    const date = validDate(log.created_at)
    return Boolean(date && dateInRange(date, range))
  })
  const totalCost = scoped.reduce((sum, log) => sum + Number(log.cost || 0), 0)
  const totalTokens = scoped.reduce((sum, log) => sum + logTokens(log), 0)
  const activeModels = new Set(scoped.map((log) => log.model_name || "-")).size
  return [
    { title: copy.summaryRequests, value: formatInteger(scoped.length) },
    { title: copy.summaryCost, value: `${currencyDisplayName}${totalCost.toFixed(4)}` },
    { title: copy.summaryTokens, value: formatInteger(totalTokens) },
    { title: copy.summaryModels, value: formatInteger(activeModels) },
  ]
}

interface ChartRange {
  start: Date
  end: Date
}

function resolveChartRange(logs: TokenLog[], filters: DataBoardFilters): ChartRange {
  const configuredStart = parseLocalInput(filters.startTime)
  const configuredEnd = parseLocalInput(filters.endTime)
  const dates = logs.map((log) => validDate(log.created_at)).filter((date): date is Date => Boolean(date))
  const now = new Date()
  let start = configuredStart || (dates.length > 0 ? new Date(Math.min(...dates.map((date) => date.getTime()))) : startOfDay(addDays(now, -6)))
  let end = configuredEnd || (dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))) : now)
  if (end < start) {
    const nextStart = end
    end = start
    start = nextStart
  }
  return { start, end }
}

function defaultFilters(): DataBoardFilters {
  const now = new Date()
  const start = startOfDay(addDays(now, -6))
  return {
    startTime: toLocalInputValue(start),
    endTime: toLocalInputValue(now),
    granularity: "day",
    metric: "cost",
    apiKeyID: "",
    modelName: "",
  }
}

function presetRange(preset: RangePreset): Partial<DataBoardFilters> {
  const now = new Date()
  if (preset === "all") {
    return { startTime: "", endTime: "", granularity: "month" }
  }
  if (preset === "24h") {
    return { startTime: toLocalInputValue(addHours(now, -24)), endTime: toLocalInputValue(now), granularity: "hour" }
  }
  if (preset === "30d") {
    return { startTime: toLocalInputValue(startOfDay(addDays(now, -29))), endTime: toLocalInputValue(now), granularity: "day" }
  }
  if (preset === "12m") {
    return { startTime: toLocalInputValue(startOfMonth(addMonths(now, -11))), endTime: toLocalInputValue(now), granularity: "month" }
  }
  return { startTime: toLocalInputValue(startOfDay(addDays(now, -6))), endTime: toLocalInputValue(now), granularity: "day" }
}

function logMetric(log: TokenLog, metric: MetricKey) {
  if (metric === "requests") {
    return 1
  }
  if (metric === "tokens") {
    return logTokens(log)
  }
  return Number(log.cost || 0)
}

function logTokens(log: TokenLog) {
  return Number(log.input_tokens || 0) + Number(log.output_tokens || 0)
}

function formatMetric(value: number, metric: MetricKey, currencyDisplayName: string, copy: DataBoardCopy) {
  if (metric === "cost") {
    return `${currencyDisplayName}${value.toFixed(4)}`
  }
  if (metric === "tokens") {
    return `${formatInteger(value)} ${copy.metricTokens}`
  }
  return `${formatInteger(value)} ${copy.metricRequests}`
}

function emptyTimeBucket(start: Date, key: string, granularity: TimeGranularity): TimeBucket {
  return {
    start,
    key,
    label: timeBucketLabel(start, granularity),
    value: 0,
    cost: 0,
    requests: 0,
    tokens: 0,
  }
}

function startOfBucket(date: Date, granularity: TimeGranularity) {
  const next = new Date(date)
  next.setSeconds(0, 0)
  if (granularity === "hour") {
    next.setMinutes(0, 0, 0)
    return next
  }
  if (granularity === "week") {
    next.setHours(0, 0, 0, 0)
    const day = next.getDay() || 7
    next.setDate(next.getDate() - day + 1)
    return next
  }
  if (granularity === "month") {
    next.setDate(1)
    next.setHours(0, 0, 0, 0)
    return next
  }
  next.setHours(0, 0, 0, 0)
  return next
}

function addBucket(date: Date, granularity: TimeGranularity) {
  if (granularity === "hour") {
    return addHours(date, 1)
  }
  if (granularity === "week") {
    return addDays(date, 7)
  }
  if (granularity === "month") {
    return addMonths(date, 1)
  }
  return addDays(date, 1)
}

function bucketKey(date: Date, granularity: TimeGranularity) {
  const start = startOfBucket(date, granularity)
  return `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}-${start.getHours()}`
}

function estimatedBucketCount(range: ChartRange, granularity: TimeGranularity) {
  const ms = Math.max(0, range.end.getTime() - range.start.getTime())
  if (granularity === "hour") {
    return Math.ceil(ms / 3_600_000) + 1
  }
  if (granularity === "week") {
    return Math.ceil(ms / (7 * 86_400_000)) + 1
  }
  if (granularity === "month") {
    return (range.end.getFullYear() - range.start.getFullYear()) * 12 + range.end.getMonth() - range.start.getMonth() + 1
  }
  return Math.ceil(ms / 86_400_000) + 1
}

function timeBucketLabel(date: Date, granularity: TimeGranularity) {
  if (granularity === "hour") {
    return `${shortDateLabel(date)} ${String(date.getHours()).padStart(2, "0")}:00`
  }
  if (granularity === "week") {
    return `W ${shortDateLabel(date)}`
  }
  if (granularity === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
  }
  return shortDateLabel(date)
}

function dateInRange(date: Date, range: ChartRange) {
  return date >= range.start && date <= range.end
}

function validDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseLocalInput(value: string) {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfMonth(date: Date) {
  const next = new Date(date)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

function addHours(date: Date, hours: number) {
  const next = new Date(date)
  next.setHours(next.getHours() + hours)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`
}

function shortDateLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString()
}

function normalizeAPIKeyOption(value: unknown): APIKeyOption {
  const item = value && typeof value === "object" ? value as Partial<APIKeyOption> : {}
  return {
    id: Number(item.id || 0),
    name: typeof item.name === "string" ? item.name : "",
    key_prefix: typeof item.key_prefix === "string" ? item.key_prefix : "",
  }
}

function emptyLogResult(): DataBoardLogResult {
  return { items: [], total: 0, truncated: false }
}

const zhCopy = {
  advancedFilters: "高级筛选",
  startTime: "开始时间",
  endTime: "结束时间",
  granularity: "时间粒度",
  granularityHour: "按小时",
  granularityDay: "按天",
  granularityWeek: "按周",
  granularityMonth: "按月",
  metric: "统计指标",
  metricCost: "消费金额",
  metricRequests: "请求数",
  metricTokens: "Token 数",
  apiKey: "API Key",
  allAPIKeys: "全部 API Key",
  apiKeyFallback: "API Key",
  modelName: "模型",
  modelNamePlaceholder: "按模型名模糊筛选",
  reset: "重置",
  loading: "加载中...",
  loadedSummary: "已加载 {loaded} / {total} 条记录",
  truncated: "仅展示前 {limit} 条，缩短时间范围可获得完整统计",
  presets: {
    "24h": "近 24 小时",
    "7d": "近 7 天",
    "30d": "近 30 天",
    "12m": "近 12 个月",
    all: "全部时间",
  },
  summaryRequests: "请求数",
  summaryCost: "总消费",
  summaryTokens: "总 Token",
  summaryModels: "活跃模型",
  hourlyDistribution: "小时分布",
  timeSeries: "时间序列",
  inputTokens: "输入 Token",
  outputTokens: "输出 Token",
  noData: "暂无数据",
  other: "其他",
}

type DataBoardCopy = typeof zhCopy

const enCopy: DataBoardCopy = {
  advancedFilters: "Advanced filters",
  startTime: "Start time",
  endTime: "End time",
  granularity: "Time granularity",
  granularityHour: "Hourly",
  granularityDay: "Daily",
  granularityWeek: "Weekly",
  granularityMonth: "Monthly",
  metric: "Metric",
  metricCost: "Spend",
  metricRequests: "Requests",
  metricTokens: "Tokens",
  apiKey: "API key",
  allAPIKeys: "All API keys",
  apiKeyFallback: "API key",
  modelName: "Model",
  modelNamePlaceholder: "Filter by model name",
  reset: "Reset",
  loading: "Loading...",
  loadedSummary: "Loaded {loaded} / {total} records",
  truncated: "Showing the first {limit} records only. Narrow the time range for complete stats.",
  presets: {
    "24h": "Last 24h",
    "7d": "Last 7d",
    "30d": "Last 30d",
    "12m": "Last 12m",
    all: "All time",
  },
  summaryRequests: "Requests",
  summaryCost: "Total spend",
  summaryTokens: "Total tokens",
  summaryModels: "Active models",
  hourlyDistribution: "Hourly Distribution",
  timeSeries: "Time Series",
  inputTokens: "Input Tokens",
  outputTokens: "Output Tokens",
  noData: "No data",
  other: "Other",
}

const chartColors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"]
