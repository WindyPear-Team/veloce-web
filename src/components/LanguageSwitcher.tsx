import { Check, ChevronDown, Globe2, Languages } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { Language } from "@/lib/i18n"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface LanguageOption {
  value: Language
  labelKey: "language.chinese" | "language.english" | "language.japanese"
  descriptionKey: "language.chineseDescription" | "language.englishDescription" | "language.japaneseDescription"
}

const languageOptions: LanguageOption[] = [
  { value: "zh", labelKey: "language.chinese", descriptionKey: "language.chineseDescription" },
  { value: "en", labelKey: "language.english", descriptionKey: "language.englishDescription" },
  { value: "ja", labelKey: "language.japanese", descriptionKey: "language.japaneseDescription" },
]

export function LanguageSwitcher({
  className,
  triggerClassName,
  menuClassName,
  placement = "bottom",
  showLabel = true,
  compact = false,
}: {
  className?: string
  triggerClassName?: string
  menuClassName?: string
  placement?: "top" | "bottom"
  showLabel?: boolean
  compact?: boolean
}) {
  const { language, setLanguage, t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const currentOption = languageOptions.find((option) => option.value === language) || languageOptions[0]

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const selectLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "default"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          compact
            ? ""
            : "h-10 w-full justify-between rounded-2xl px-3",
          triggerClassName
        )}
        onClick={() => setOpen((current) => !current)}
      >
        {compact ? (
          <Languages size={17} />
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <Globe2 size={16} className="shrink-0 text-muted-foreground" />
              {showLabel && (
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{t("language.current")}: </span>
                  <span className="font-medium">{t(currentOption.labelKey)}</span>
                </span>
              )}
              {!showLabel && <span className="font-medium">{t(currentOption.labelKey)}</span>}
            </span>
            <ChevronDown size={16} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={t("language.select")}
          className={cn(
            "absolute left-0 z-50 w-full min-w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
            menuClassName
          )}
        >
          {languageOptions.map((option) => {
            const selected = option.value === language
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={cn(
                  "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "bg-muted"
                )}
                onClick={() => selectLanguage(option.value)}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {selected && <Check size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t(option.labelKey)}</span>
                  <span className="block text-xs text-muted-foreground">{t(option.descriptionKey)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
