// 让 tsc 加载 @tanstack/react-start 对 router-core 的类型增强
// （FilebaseRouteOptionsInterface 上的 `server` 字段由 start-client-core 的
// serverRoute.ts `declare module '@tanstack/router-core'` 注入）。
// 没有这一行，bare `tsc --noEmit` 看不到 createFileRoute({ server }) 的合法性。
import type {} from '@tanstack/react-start'
