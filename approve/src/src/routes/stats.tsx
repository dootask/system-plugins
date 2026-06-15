import { createFileRoute } from '@tanstack/react-router'
import { StatsView } from '#/components/views/stats-view'

// 数据统计。
export const Route = createFileRoute('/stats')({ component: StatsView })
