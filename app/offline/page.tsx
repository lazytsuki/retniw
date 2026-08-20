import { RetniwSymbol } from '@/src/components/app-header'

export default function OfflinePage() {
  return (
    <main className="shell">
      <section className="panel panel--compact" aria-labelledby="offline-title">
        <p className="login-brand"><RetniwSymbol /><span>retniw</span></p>
        <h1 id="offline-title">网络不可用</h1>
        <p className="muted">草稿保存在这台设备上，联网后可继续。</p>
      </section>
    </main>
  )
}
