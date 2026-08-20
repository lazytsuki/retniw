'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      if ('caches' in window) {
        void caches.keys().then((keys) =>
          Promise.all(keys.filter((key) => key.startsWith('retniw-')).map((key) => caches.delete(key))),
        )
      }
      return
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The application remains usable online when registration fails.
    })
  }, [])

  return null
}
