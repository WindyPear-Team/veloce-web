import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { PackageOpen, Sparkles, Trash2, Upload } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageInlineSlot, PageTitleSlot } from "@/components/layout/PageTitleSlot"
import { useToast } from "@/components/ui/toast"
import { useI18n } from "@/lib/i18n"

interface PackagedSkill {
  id: string
  package_id: string
  name: string
  description: string
  source: string
  skill_path: string
  root_path: string
  enabled: boolean
  size: number
  hash: string
  created_at: string
  updated_at: string
}

interface SkillPackage {
  id: string
  name: string
  source_name: string
  size: number
  file_count: number
  hash: string
  status: string
  error_text?: string
  skills: PackagedSkill[]
  created_at: string
  updated_at: string
}

const skillsQueryKey = ["advanced-chat-skills"] as const
const skillPackagesQueryKey = ["advanced-chat-skill-packages"] as const

export default function Skills() {
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingPackageID, setDeletingPackageID] = useState("")

  const { data: packages = [] } = useQuery<SkillPackage[]>({
    queryKey: skillPackagesQueryKey,
    queryFn: async () => {
      const res = await api.get("/user/advanced-chat/skill-packages")
      const raw = isRecord(res.data) && Array.isArray(res.data.packages) ? res.data.packages : []
      return raw.map(normalizeSkillPackage).filter((item): item is SkillPackage => Boolean(item))
    },
  })

  const uploadPackage = async (file: File | undefined) => {
    if (!file) {
      return
    }
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".zip") && !lower.endsWith(".tar.gz") && !lower.endsWith(".tgz")) {
      error("请上传 zip、tar.gz 或 tgz 格式的 Skill 包")
      return
    }
    const form = new FormData()
    form.append("file", file)
    setUploading(true)
    try {
      await api.post("/user/advanced-chat/skill-packages", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: skillPackagesQueryKey }),
        queryClient.invalidateQueries({ queryKey: skillsQueryKey }),
      ])
      success("Skill 包已上传")
    } catch (err) {
      error(apiErrorMessage(err, "Skill 包上传失败"))
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const deletePackage = async (item: SkillPackage) => {
    setDeletingPackageID(item.id)
    try {
      await api.delete(`/user/advanced-chat/skill-packages/${encodeURIComponent(item.id)}`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: skillPackagesQueryKey }),
        queryClient.invalidateQueries({ queryKey: skillsQueryKey }),
      ])
      success("Skill 包已删除")
    } catch (err) {
      error(apiErrorMessage(err, "Skill 包删除失败"))
    } finally {
      setDeletingPackageID("")
    }
  }

  const skills = packages.flatMap((item) => item.skills || [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.skills")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">上传标准 Skill 包，系统会按需读取 SKILL.md 和资源文件。</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.tgz,.tar.gz,application/zip,application/gzip"
            className="hidden"
            onChange={(event) => uploadPackage(event.target.files?.[0])}
          />
          <Button className="gap-2" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            {uploading ? "上传中" : "上传 Skill 包"}
          </Button>
        </div>
      </div>

      <PageTitleSlot />

      <Card>
        <CardHeader>
          <CardTitle>Skill 包</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {packages.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">还没有上传 Skill 包</div>
          ) : (
            packages.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <PackageOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{item.name}</span>
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{item.status}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {item.source_name} · {formatBytes(item.size)} · {item.file_count} files
                    </div>
                    {item.error_text && <div className="mt-2 text-xs text-destructive">{item.error_text}</div>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingPackageID === item.id}
                    onClick={() => deletePackage(item)}
                    title={t("common.delete")}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                {item.skills.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {item.skills.map((skill) => (
                      <div key={skill.id} className="rounded-md border bg-muted/30 p-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">{skill.name}</span>
                        </div>
                        {skill.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.description}</div>}
                        <div className="mt-2 truncate text-[11px] text-muted-foreground">{skill.skill_path}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("advancedChat.skills.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {skills.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t("advancedChat.skills.empty")}</div>
          ) : (
            skills.map((skill) => (
              <div key={skill.id} className="rounded-md border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{skill.name}</span>
                </div>
                {skill.description && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.description}</div>}
                <div className="mt-2 truncate text-[11px] text-muted-foreground">{skill.id}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <PageInlineSlot slotKey="primary" />
      <PageInlineSlot slotKey="secondary" />
    </div>
  )
}

function normalizeSkillPackage(value: unknown): SkillPackage | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: typeof value.name === "string" ? value.name : "",
    source_name: typeof value.source_name === "string" ? value.source_name : "",
    size: numberFromUnknown(value.size),
    file_count: numberFromUnknown(value.file_count),
    hash: typeof value.hash === "string" ? value.hash : "",
    status: typeof value.status === "string" ? value.status : "",
    error_text: typeof value.error_text === "string" ? value.error_text : "",
    skills: Array.isArray(value.skills) ? value.skills.map(normalizePackagedSkill).filter((skill): skill is PackagedSkill => Boolean(skill)) : [],
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function normalizePackagedSkill(value: unknown): PackagedSkill | null {
  if (!isRecord(value)) {
    return null
  }
  const id = stringFromUnknown(value.id)
  if (!id) {
    return null
  }
  return {
    id,
    package_id: stringFromUnknown(value.package_id) || "",
    name: typeof value.name === "string" ? value.name : "",
    description: typeof value.description === "string" ? value.description : "",
    source: typeof value.source === "string" ? value.source : "uploaded",
    skill_path: typeof value.skill_path === "string" ? value.skill_path : "",
    root_path: typeof value.root_path === "string" ? value.root_path : "",
    enabled: value.enabled !== false,
    size: numberFromUnknown(value.size),
    hash: typeof value.hash === "string" ? value.hash : "",
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
  }
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err)) {
    const response = err.response
    if (isRecord(response)) {
      const data = response.data
      if (isRecord(data)) {
        if (typeof data.error === "string" && data.error) {
          return data.error
        }
        if (typeof data.message === "string" && data.message) {
          return data.message
        }
      }
    }
  }
  return err instanceof Error && err.message ? err.message : fallback
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
