'use client'

import { useEffect, useRef, useState } from 'react'

export function ProductVideo() {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [isOpen])

  function close() {
    video.current?.pause()
    dialog.current?.close()
    setIsOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  return (
    <>
      <button
        ref={trigger}
        className="product-video-trigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setFailed(false)
          setIsOpen(true)
          dialog.current?.showModal()
        }}
      >
        <span className="product-video-play" aria-hidden="true">▶</span>
        <span>看看 retniw 怎么用</span>
        <span className="product-video-duration">1:03</span>
      </button>
      <dialog
        ref={dialog}
        className="product-video-dialog"
        aria-labelledby="product-video-title"
        onCancel={(event) => { event.preventDefault(); close() }}
        onClose={close}
        onClick={(event) => { if (event.target === event.currentTarget) close() }}
      >
        <div className="product-video-content">
          <header className="product-video-header">
            <h2 id="product-video-title">看看 retniw 怎么用</h2>
            <button type="button" className="product-video-close" onClick={close} autoFocus aria-label="关闭视频">✕</button>
          </header>
          {isOpen ? (
            <video
              ref={video}
              src="/media/retniw-intro.mp4"
              poster="/media/retniw-intro-poster.jpg"
              controls
              autoPlay
              playsInline
              preload="metadata"
              aria-label="retniw 产品介绍，含背景音乐与画面字幕"
              onError={() => setFailed(true)}
            />
          ) : null}
          {failed ? <p className="product-video-error" role="alert">视频暂时无法播放，可以<a href="/media/retniw-intro.mp4">直接打开视频</a>。</p> : null}
        </div>
      </dialog>
    </>
  )
}
