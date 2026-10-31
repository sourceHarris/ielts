import type { PracticeConfig, PracticeWork, PrivateAttempt } from './privatePractice.ts'
import { markPrivatePractice } from './privatePractice.ts'

const databaseName = 'practice-room-private-practice-v1'
type Store = 'configs' | 'work' | 'attempts' | 'media'
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      for (const store of ['configs', 'work', 'attempts', 'media']) request.result.createObjectStore(store, { keyPath: 'id' })
    }
    request.onerror = () => reject(Error('Private practice storage is unavailable.'))
    request.onblocked = () => { blocked = true; reject(Error('Close older practice tabs and retry.')) }
    request.onsuccess = () => { if (blocked) { request.result.close(); return }; request.result.onversionchange = () => request.result.close(); resolve(request.result) }
  })
}

export async function localData<T>(store: Store, action: 'get' | 'all' | 'put' | 'add', value?: unknown): Promise<T> {
  const database = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(store, action === 'get' || action === 'all' ? 'readonly' : 'readwrite')
      const object = transaction.objectStore(store)
      const request = action === 'get' ? object.get(value as string) : action === 'all' ? object.getAll()
        : action === 'add' ? object.add(value) : object.put(value)
      transaction.oncomplete = () => resolve(request.result as T)
      transaction.onabort = () => reject(Error('The change was not saved. Keep this page open and retry.'))
    })
  } finally { database.close() }
}

export async function completePractice(config: PracticeConfig, work: PracticeWork): Promise<PrivateAttempt> {
  if (!work.startedAt || !work.submittedAt) throw Error('The attempt is not complete.')
  const attempt: PrivateAttempt = structuredClone({ schemaVersion: 1, gradingVersion: 'private-objective-v1', id: `${config.id}:${work.startedAt}`, config, work,
    resultSnapshot: config.skill === 'reading' || config.skill === 'listening' ? markPrivatePractice(config, work.answers) : null })
  const database = await open()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(['attempts', 'work'], 'readwrite')
      const store = transaction.objectStore('attempts')
      const request = store.get(attempt.id)
      let saved = attempt
      request.onsuccess = () => {
        if (request.result) {
          const previous = request.result as PrivateAttempt
          const comparable = (item: PrivateAttempt) => JSON.stringify({ config: item.config, ...item.work, submittedAt: null })
          if (comparable(previous) !== comparable(attempt)) { transaction.abort(); return }
          saved = previous
        } else store.add(attempt)
        transaction.objectStore('work').put(saved.work)
      }
      transaction.oncomplete = () => resolve(saved)
      transaction.onabort = () => reject(Error('The attempt was not archived. Storage failed or another tab submitted a different result.'))
    })
  } finally { database.close() }
}
