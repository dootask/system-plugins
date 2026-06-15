import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { KeepAliveViews } from '#/components/keep-alive'

import appCss from '../styles.css?url'

// 首屏渲染前同步定主题，避免黑色背景闪烁。优先级：URL ?theme=（主程序 iframe 传入的权威值）> localStorage > 系统配色。
const THEME_INIT_SCRIPT = `(function(){try{var qp=new URLSearchParams(window.location.search).get('theme');var stored=window.localStorage.getItem('theme');var mode=(qp==='light'||qp==='dark'||qp==='auto')?qp:((stored==='light'||stored==='dark'||stored==='auto')?stored:'auto');var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '审批中心' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <AppShell>
          <KeepAliveViews />
          {children}
        </AppShell>
        <Scripts />
      </body>
    </html>
  )
}
