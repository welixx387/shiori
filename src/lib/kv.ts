/**
 * Простое хранилище «ключ → значение» для локального режима.
 * IndexedDB (вмещает сотни мегабайт текста), а если она недоступна —
 * localStorage, а если и он недоступен (приватный режим, песочница) — память.
 */

const DB_NAME = 'shiori'
const STORE = 'kv'
const LS_PREFIX = 'shiori-kv:'

type Backend = {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
}

function idbBackend(): Promise<Backend> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      const tx = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) =>
        new Promise<T>((res, rej) => {
          const t = db.transaction(STORE, mode)
          const r = fn(t.objectStore(STORE))
          t.oncomplete = () => res(r.result as T)
          t.onerror = () => rej(t.error)
          t.onabort = () => rej(t.error)
        })
      resolve({
        get: (key) => tx('readonly', (s) => s.get(key)),
        set: (key, value) => tx('readwrite', (s) => s.put(value, key)),
        del: (key) => tx('readwrite', (s) => s.delete(key)),
      })
    }
  })
}

function localStorageBackend(): Backend {
  localStorage.setItem(LS_PREFIX + '__probe', '1')
  localStorage.removeItem(LS_PREFIX + '__probe')
  return {
    async get(key) {
      const raw = localStorage.getItem(LS_PREFIX + key)
      return raw === null ? undefined : JSON.parse(raw)
    },
    async set(key, value) {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
    },
    async del(key) {
      localStorage.removeItem(LS_PREFIX + key)
    },
  }
}

function memoryBackend(): Backend {
  const map = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return structuredClone(map.get(key)) as T | undefined
    },
    async set(key, value) {
      map.set(key, structuredClone(value))
    },
    async del(key) {
      map.delete(key)
    },
  }
}

let backendPromise: Promise<Backend> | null = null
export let storageKind: 'indexeddb' | 'localstorage' | 'memory' = 'memory'

function backend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        const b = await idbBackend()
        // Проверочная запись: в некоторых песочницах IndexedDB открывается, но не пишет.
        await b.set('__probe', 1)
        storageKind = 'indexeddb'
        return b
      } catch {
        try {
          const b = localStorageBackend()
          storageKind = 'localstorage'
          return b
        } catch {
          storageKind = 'memory'
          return memoryBackend()
        }
      }
    })()
  }
  return backendPromise
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await backend()).get<T>(key)
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  return (await backend()).set(key, value)
}

export async function kvDel(key: string): Promise<void> {
  return (await backend()).del(key)
}

/** Безопасные обёртки над localStorage для мелких настроек. */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* хранилище недоступно — просто не запоминаем */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ничего */
    }
  },
}

/** То же для sessionStorage — в песочницах и приватных окнах он может быть недоступен. */
export const safeSession = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value)
    } catch {
      /* без sessionStorage просто не запоминаем */
    }
  },
  remove(key: string) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      /* ничего */
    }
  },
}
