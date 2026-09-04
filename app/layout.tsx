import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { AuthContextNotice } from '@/src/components/auth-context-notice'
import { ServiceWorkerRegistration } from '@/src/components/pwa/service-worker-registration'
import { OverlayProvider } from '@/src/components/overlay-provider'
import { WorkspaceSidebarProvider } from '@/src/components/workspace-sidebar-provider'
import '@/src/index.css'

export const metadata: Metadata = {
  title: 'retniw',
  description: '记录和继续想法。',
  applicationName: 'retniw',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'retniw',
  },
}

export const viewport: Viewport = {
  themeColor: '#08090b',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">跳到主要内容</a>
        <ServiceWorkerRegistration />
        <AuthContextNotice />
        <WorkspaceSidebarProvider>
          <OverlayProvider>{children}</OverlayProvider>
        </WorkspaceSidebarProvider>
      </body>
    </html>
  )
}
