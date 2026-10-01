// ui/src/components/aibot/PreferencesCard.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SlidersHorizontal } from "lucide-react"

interface PreferencesCardProps {
  floatButtonVisible: boolean
  loading: boolean
  onFloatButtonChange: (visible: boolean) => void
  t: (key: string) => string
}

export function PreferencesCard({ floatButtonVisible, loading, onFloatButtonChange, t }: PreferencesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          <CardTitle className="text-base">{t("preferences.title")}</CardTitle>
        </div>
        <CardDescription>{t("preferences.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="float-button-visible">{t("preferences.floatButton")}</Label>
            <p className="text-xs text-muted-foreground">{t("preferences.floatButtonTip")}</p>
          </div>
          <Switch
            id="float-button-visible"
            checked={floatButtonVisible}
            disabled={loading}
            onCheckedChange={onFloatButtonChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}
