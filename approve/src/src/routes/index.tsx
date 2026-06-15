import { createFileRoute } from '@tanstack/react-router'
import { StartLauncher } from '#/components/views/start-launcher'

// 「发起申请」：分类模板宫格（落地页）。
export const Route = createFileRoute('/')({ component: StartLauncher })
