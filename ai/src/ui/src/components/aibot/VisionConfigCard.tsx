// ui/src/components/aibot/VisionConfigCard.tsx
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AIBotItem } from "@/data/aibots"
import type { VisionConfig } from "@/data/vision-config"
import { Eye, Settings } from "lucide-react"

interface VisionConfigCardProps {
  config: VisionConfig
  bots: AIBotItem[]
  onEdit: () => void
  t: (key: string) => string
}

export function VisionConfigCard({ config, bots, onEdit, t }: VisionConfigCardProps) {
  const availableModelIds = new Set(
    bots.flatMap((bot) => bot.models?.map((m) => m.value) ?? [])
  )
  const filtered = config.supportedModels.filter((m) => availableModelIds.has(m.id))
  const displayModels = filtered.slice(0, 3)
  const extraCount = filtered.length - 3

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            <CardTitle className="text-base">{t("vision.title")}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Settings />
            {t("vision.edit")}
          </Button>
        </div>
        <CardDescription>{t("vision.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("vision.enabled")}:</span>
          <Badge variant={config.enabled ? "default" : "secondary"}>
            {config.enabled ? t("vision.statusEnabled") : t("vision.statusDisabled")}
          </Badge>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">{t("vision.supportedModels")}:</span>
            {displayModels.map((model) => (
              <Badge key={model.id} variant="outline" className="text-xs">
                {model.name}
              </Badge>
            ))}
            {extraCount > 0 && (
              <Badge variant="outline" className="text-xs">
                +{extraCount}
              </Badge>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("vision.imageLimit")}:</span>
          <span>
            {config.maxImageSize}px / {config.maxFileSize}MB / {config.compressionQuality}%
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
