import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Download, Search, Sparkles, UserRound } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"

interface CommunityCharacter {
  id: string
  name: string
  summary: string
  image_url: string
  author: string
  author_level?: number
  prompt?: string
  featured: boolean
  created_at: string
}

interface CommunityCharactersResponse {
  items?: unknown
}

const communityCharactersQueryKey = (query: string) => ["community-characters", query] as const

export default function Community() {
  const { id } = useParams()
  return id ? <CommunityCharacterDetail id={id} /> : <CommunityCharacterList />
}

function CommunityCharacterList() {
  const [query, setQuery] = useState("")
  const charactersQuery = useQuery<CommunityCharacter[]>({
    queryKey: communityCharactersQueryKey(query),
    queryFn: async () => normalizeCharacterList((await api.get("/community/characters", { params: { limit: 24, offset: 0, q: query.trim() || undefined } })).data),
  })
  const characters = charactersQuery.data || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1"><h1 className="text-2xl font-semibold">社区</h1><p className="text-sm text-muted-foreground">探索最新发布的 AI 角色。</p></div>
        <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索角色" className="h-9 pl-9" /></div>
      </div>

      {charactersQuery.isError ? <CommunityState title="社区暂时不可用" description="无法获取角色列表，请稍后重试。" /> : charactersQuery.isLoading ? <CommunityState title="正在加载角色" description="" /> : characters.length === 0 ? <CommunityState title={query ? "没有匹配的角色" : "暂时还没有公开角色"} description={query ? "换一个关键词试试。" : "稍后再来看看。"} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{characters.map((character) => <CommunityCharacterCard key={character.id} character={character} />)}</div>}
    </div>
  )
}

function CommunityCharacterCard({ character }: { character: CommunityCharacter }) {
  return (
    <Link to={`/chat/community/${encodeURIComponent(character.id)}`} className="group block">
      <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:bg-muted/30">
        <CardHeader className="gap-4"><CharacterCover character={character} /><div className="min-w-0 space-y-2"><div className="flex items-center gap-2"><CardTitle className="truncate text-base">{character.name}</CardTitle>{character.featured && <Badge variant="secondary" className="gap-1"><Sparkles size={12} />精选</Badge>}</div><CardDescription className="line-clamp-2 min-h-10">{character.summary || "这位创作者还没有留下简介。"}</CardDescription></div></CardHeader>
        <CardFooter className="justify-between text-xs text-muted-foreground"><span className="truncate">{character.author || "匿名创作者"}</span><span>{formatDate(character.created_at)}</span></CardFooter>
      </Card>
    </Link>
  )
}

function CommunityCharacterDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { error, success } = useToast()
  const [isImporting, setIsImporting] = useState(false)
  const characterQuery = useQuery<CommunityCharacter>({
    queryKey: ["community-character", id],
    queryFn: async () => {
      const character = normalizeCharacter((await api.get(`/community/characters/${encodeURIComponent(id)}`)).data)
      if (!character) throw new Error("角色数据无效")
      return character
    },
  })
  const character = characterQuery.data

  const importCharacter = async () => {
    if (!character?.prompt || isImporting) return
    setIsImporting(true)
    try {
      const response = await api.post("/user/advanced-chat/agents", {
        name: character.name,
        prompt: character.prompt,
        default_model: "",
        user_channel_id: 0,
        stream: false,
        skill_ids: [],
        mcp_server_ids: [],
        knowledge_base_ids: [],
      })
      const agentID = stringValue(response.data?.id)
      if (!agentID) throw new Error("代理创建结果无效")
      queryClient.removeQueries({ queryKey: ["advanced-chat-agents"] })
      success("角色已导入代理")
      navigate(`/chat?agent_id=${encodeURIComponent(agentID)}`)
    } catch (err) {
      error(apiErrorMessage(err, "导入角色失败"))
    } finally {
      setIsImporting(false)
    }
  }

  if (characterQuery.isLoading) return <CommunityState title="正在加载角色" description="" />
  if (characterQuery.isError || !character) return <div className="space-y-4"><Button variant="ghost" className="gap-2" onClick={() => navigate("/chat/community")}><ArrowLeft size={16} />返回社区</Button><CommunityState title="无法打开角色" description="该角色可能已下架，或社区暂时不可用。" /></div>

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" className="gap-2" onClick={() => navigate("/chat/community")}><ArrowLeft size={16} />返回社区</Button>
      <Card>
        <CardHeader className="gap-5 sm:flex-row sm:items-start"><CharacterCover character={character} large /><div className="min-w-0 flex-1 space-y-3"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-2xl">{character.name}</CardTitle>{character.featured && <Badge className="gap-1"><Sparkles size={12} />精选</Badge>}</div><CardDescription className="whitespace-pre-wrap leading-6">{character.summary || "这位创作者还没有留下简介。"}</CardDescription><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound size={14} />{character.author || "匿名创作者"}</span>{character.author_level ? <Badge variant="outline">Lv.{character.author_level}</Badge> : null}<span>{formatDate(character.created_at)}</span></div></div></CardHeader>
        <CardContent className="space-y-3"><h2 className="text-sm font-medium">角色提示词</h2><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-sans text-sm leading-6 text-foreground">{character.prompt || "提示词暂不可用。"}</pre></CardContent>
        <CardFooter><Button className="gap-2" disabled={!character.prompt || isImporting} onClick={importCharacter}><Download size={16} />{isImporting ? "正在导入" : "导入角色"}</Button></CardFooter>
      </Card>
    </div>
  )
}

function CharacterCover({ character, large = false }: { character: CommunityCharacter; large?: boolean }) {
  const sizeClass = large ? "size-32 text-4xl" : "aspect-[16/9] w-full text-3xl"
  if (character.image_url) return <img src={character.image_url} alt={`${character.name} 封面`} className={`${sizeClass} shrink-0 rounded-md border object-cover`} />
  return <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md border bg-muted font-semibold text-muted-foreground`}>{character.name.slice(0, 1).toUpperCase() || "角"}</div>
}

function CommunityState({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed px-4 text-center"><p className="font-medium">{title}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
}

function normalizeCharacterList(value: unknown): CommunityCharacter[] {
  const response = isRecord(value) ? value as CommunityCharactersResponse : {}
  return Array.isArray(response.items) ? response.items.map(normalizeCharacter).filter((item): item is CommunityCharacter => Boolean(item)) : []
}

function normalizeCharacter(value: unknown): CommunityCharacter | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  const name = stringValue(value.name)
  if (!id || !name) return null
  return { id, name, summary: stringValue(value.summary), image_url: stringValue(value.image_url), author: stringValue(value.author), author_level: numberValue(value.author_level), prompt: stringValue(value.prompt) || undefined, featured: value.featured === true, created_at: stringValue(value.created_at) }
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN")
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""
}

function numberValue(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (isRecord(err) && isRecord(err.response) && isRecord(err.response.data)) {
    const message = stringValue(err.response.data.error) || stringValue(err.response.data.message)
    if (message) return message
  }
  return err instanceof Error && err.message ? err.message : fallback
}
