import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { AIBotItem } from "@/data/aibots"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n-context"

interface BotCardProps {
  bot: AIBotItem
  onStartChat: (bot: AIBotItem) => void
  onOpenSettings: (bot: AIBotItem) => void
  onShowDescription: (bot: AIBotItem) => void
  chatLoading: boolean
  isAdmin: boolean
}

export const BotCard = ({
  bot,
  chatLoading,
  isAdmin,
  onOpenSettings,
  onShowDescription,
  onStartChat,
}: BotCardProps) => {
  const { t } = useI18n()
  const { tagLabel, tags } = bot
  const extraTagCount = tags.length > 1 ? tags.length - 1 : 0

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <img
          src={bot.src}
          alt={bot.label}
          className="h-14 w-14 shrink-0 rounded-full object-contain"
        />
        <div className="flex flex-1 flex-col gap-2">
          <CardTitle className="text-base font-semibold">{bot.label}</CardTitle>
          {tagLabel && (
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="cursor-pointer rounded-full px-3 py-1 text-xs font-medium"
                onClick={() => onOpenSettings(bot)}
              >
                {tagLabel}
              </Badge>
              {extraTagCount > 0 && (
                <Badge
                  variant="outline"
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  onClick={() => onOpenSettings(bot)}
                >
                  +{extraTagCount}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <p
          className={cn(
            "line-clamp-3 text-sm text-muted-foreground",
            "hover:text-foreground cursor-pointer transition-colors"
          )}
          onClick={() => onShowDescription(bot)}
        >
          {bot.desc}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button className="flex-1" disabled={chatLoading} onClick={() => onStartChat(bot)}>
          {chatLoading ? t("botCard.connecting") : t("botCard.startChat")}
        </Button>
        {isAdmin && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenSettings(bot)}
          >
            {t("botCard.settings")}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
