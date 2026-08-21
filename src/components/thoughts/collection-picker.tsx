'use client'

import { useState } from 'react'
import type { ThoughtCollection } from '@/src/server/repositories/collection-repository'

type CollectionPickerProps = {
  collections: ThoughtCollection[]
  currentId: string | null
  onChoose: (collectionId: string | null) => Promise<void>
  onCreate: (name: string) => Promise<ThoughtCollection>
}

export function CollectionPicker({ collections, currentId, onChoose, onCreate }: CollectionPickerProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function createAndChoose() {
    const nextName = name.trim()
    if (!nextName) return
    setCreating(true)
    setError('')
    try {
      const collection = await onCreate(nextName)
      await onChoose(collection.id)
    } catch {
      setError('没有完成，可以重试。')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="collection-picker" role="dialog" aria-label="移入合集">
      <p>移入</p>
      <button type="button" aria-pressed={currentId === null} onClick={() => void onChoose(null)}>
        不放入合集
      </button>
      {collections.map((collection) => (
        <button
          type="button"
          aria-pressed={currentId === collection.id}
          key={collection.id}
          onClick={() => void onChoose(collection.id)}
        >
          {collection.name}
        </button>
      ))}
      <div className="collection-picker__create">
        <input
          aria-label="新合集名称"
          maxLength={80}
          placeholder="新建合集"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void createAndChoose()
            }
          }}
        />
        <button type="button" disabled={creating || !name.trim()} onClick={() => void createAndChoose()}>
          {creating ? '正在新建' : '新建'}
        </button>
      </div>
      {error && <p className="collection-picker__error" role="alert">{error}</p>}
    </div>
  )
}
