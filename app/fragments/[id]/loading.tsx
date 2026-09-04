export default function FragmentDetailLoading() {
  return (
    <main className="app-shell detail-shell" id="main-content" tabIndex={-1}>
      <div className="detail-loading" role="status">
        <span className="saving-dot" aria-hidden="true" />
        <p>已保存，正在打开…</p>
      </div>
    </main>
  )
}
