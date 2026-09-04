export type CaptureItem = {
  clientRequestId: string
  content: string
  inputMode: 'text'
  state: 'draft' | 'pending'
  updatedAt: string
}

export type ThoughtOutboxItem = {
  userId: string
  thoughtId: string
  entryId: string
  clientRequestId: string
  content: string
  entryType: 'user' | 'import'
  sourceLabel: string | null
  createsThought: boolean
  state: 'draft' | 'pending' | 'failed'
  createdAt: string
  updatedAt: string
}

const databaseName = 'retniw'
const storeName = 'capture_items'
const thoughtStoreName = 'thought_outbox'
const thoughtOutboxLockPrefix = 'retniw:thought-outbox'
export const thoughtOutboxDiscardEvent = 'retniw:thought-outbox-discard'
const thoughtOutboxDiscardStoragePrefix = 'retniw:thought-outbox-discarded'
const maxRememberedDiscardedThoughts = 256

export function thoughtOutboxDiscardStorageKey(userId: string) {
  return `${thoughtOutboxDiscardStoragePrefix}:${userId}`
}

export function listDiscardedThoughtIds(userId: string) {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(thoughtOutboxDiscardStorageKey(userId)) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

export function isThoughtOutboxDiscarded(userId: string, thoughtId: string) {
  return listDiscardedThoughtIds(userId).includes(thoughtId)
}

function rememberDiscardedThought(userId: string, thoughtId: string) {
  if (typeof window === 'undefined') return
  try {
    const remembered = listDiscardedThoughtIds(userId).filter((id) => id !== thoughtId)
    window.localStorage.setItem(
      thoughtOutboxDiscardStorageKey(userId),
      JSON.stringify([...remembered, thoughtId].slice(-maxRememberedDiscardedThoughts)),
    )
  } catch {
    // The in-window event and server response still prevent unsafe retries.
  }
}

export function withThoughtOutboxLock<T>(userId: string, run: () => Promise<T>) {
  if (typeof navigator === 'undefined' || !navigator.locks) return run()
  return navigator.locks.request(`${thoughtOutboxLockPrefix}:${userId}`, run)
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 3)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'clientRequestId' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      const thoughtStore = database.objectStoreNames.contains(thoughtStoreName)
        ? request.transaction!.objectStore(thoughtStoreName)
        : database.createObjectStore(thoughtStoreName, { keyPath: 'entryId' })
      if (!thoughtStore.indexNames.contains('createdAt')) thoughtStore.createIndex('createdAt', 'createdAt')
      if (!thoughtStore.indexNames.contains('thoughtId')) thoughtStore.createIndex('thoughtId', 'thoughtId')
      if (!thoughtStore.indexNames.contains('userId')) thoughtStore.createIndex('userId', 'userId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transact<T>(
  targetStore: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void) => void,
) {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(targetStore, mode)
        let result!: T
        let callbackError: unknown
        transaction.onerror = () => undefined
        transaction.onabort = () => {
          database.close()
          reject(callbackError ?? transaction.error ?? new Error('IndexedDB transaction aborted'))
        }
        transaction.oncomplete = () => {
          database.close()
          resolve(result)
        }
        try {
          run(transaction.objectStore(targetStore), (value) => { result = value })
        } catch (error) {
          callbackError = error
          transaction.abort()
        }
      }),
  )
}

export function listCaptureItems() {
  return transact<CaptureItem[]>(storeName, 'readonly', (store, resolve) => {
    const request = store.getAll()
    request.onsuccess = () =>
      resolve(
        (request.result as CaptureItem[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      )
  })
}

export function putCaptureItem(item: CaptureItem) {
  return transact<void>(storeName, 'readwrite', (store, resolve) => {
    const request = store.put(item)
    request.onsuccess = () => resolve()
  })
}

export function deleteCaptureItem(clientRequestId: string) {
  return transact<void>(storeName, 'readwrite', (store, resolve) => {
    const request = store.delete(clientRequestId)
    request.onsuccess = () => resolve()
  })
}

export function listThoughtOutboxItems() {
  return transact<ThoughtOutboxItem[]>(thoughtStoreName, 'readonly', (store, resolve) => {
    const request = store.getAll()
    request.onsuccess = () =>
      resolve(
        (request.result as ThoughtOutboxItem[]).sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) || left.entryId.localeCompare(right.entryId),
        ),
      )
  })
}

export function putThoughtOutboxItem(item: ThoughtOutboxItem) {
  return transact<void>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const request = store.put(item)
    request.onsuccess = () => resolve()
  })
}

export function putThoughtOutboxDraft(item: ThoughtOutboxItem) {
  return transact<boolean>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const read = store.get(item.entryId)
    read.onsuccess = () => {
      const existing = read.result as ThoughtOutboxItem | undefined
      if (
        existing &&
        (
          existing.userId !== item.userId ||
          existing.state !== 'draft' ||
          existing.updatedAt > item.updatedAt
        )
      ) return resolve(false)
      const write = store.put({ ...item, state: 'draft' })
      write.onsuccess = () => resolve(true)
    }
  })
}

export function enqueueThoughtOutboxItem(item: ThoughtOutboxItem) {
  return transact<boolean>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const read = store.get(item.entryId)
    read.onsuccess = () => {
      const existing = read.result as ThoughtOutboxItem | undefined
      if (existing && (existing.userId !== item.userId || existing.state !== 'draft')) return resolve(false)
      const write = store.put({ ...item, state: 'pending' })
      write.onsuccess = () => resolve(true)
    }
  })
}

export function deleteThoughtOutboxItem(userId: string, entryId: string) {
  return transact<boolean>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const read = store.get(entryId)
    read.onsuccess = () => {
      const existing = read.result as ThoughtOutboxItem | undefined
      if (!existing || existing.userId !== userId) return resolve(false)
      const request = store.delete(entryId)
      request.onsuccess = () => resolve(true)
    }
  })
}

export function deleteThoughtOutboxDraft(userId: string, entryId: string) {
  return transact<boolean>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const read = store.get(entryId)
    read.onsuccess = () => {
      const existing = read.result as ThoughtOutboxItem | undefined
      if (!existing || existing.userId !== userId || existing.state !== 'draft') {
        return resolve(false)
      }
      const request = store.delete(entryId)
      request.onsuccess = () => resolve(true)
    }
  })
}

export function claimLegacyThoughtOutboxItems(userId: string) {
  return transact<void>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return resolve()
      const item = cursor.value as ThoughtOutboxItem
      if (typeof item.userId !== 'string') cursor.update({ ...item, userId })
      cursor.continue()
    }
  })
}

export function discardThoughtOutboxItems(userId: string, thoughtId: string) {
  rememberDiscardedThought(userId, thoughtId)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(thoughtOutboxDiscardEvent, { detail: { userId, thoughtId } }))
  }
  return transact<void>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const request = store.index('thoughtId').openCursor(IDBKeyRange.only(thoughtId))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return resolve()
      if ((cursor.value as ThoughtOutboxItem).userId === userId) store.delete(cursor.primaryKey)
      cursor.continue()
    }
  })
}
