export type CaptureItem = {
  clientRequestId: string
  content: string
  inputMode: 'text'
  state: 'draft' | 'pending'
  updatedAt: string
}

export type ThoughtOutboxItem = {
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

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'clientRequestId' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!database.objectStoreNames.contains(thoughtStoreName)) {
        const store = database.createObjectStore(thoughtStoreName, { keyPath: 'entryId' })
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('thoughtId', 'thoughtId')
      }
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
        transaction.onerror = () => reject(transaction.error)
        transaction.oncomplete = () => database.close()
        run(transaction.objectStore(targetStore), resolve)
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

export function deleteThoughtOutboxItem(entryId: string) {
  return transact<void>(thoughtStoreName, 'readwrite', (store, resolve) => {
    const request = store.delete(entryId)
    request.onsuccess = () => resolve()
  })
}
