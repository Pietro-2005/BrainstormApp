/** Ask the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageStatus(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ])
    return { usage, quota, persisted }
  } catch {
    return null
  }
}
