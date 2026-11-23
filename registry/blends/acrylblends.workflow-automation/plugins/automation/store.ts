/**
 * Where the app keeps its state: small ports, so the domain never touches the disk itself. The app uses {@link jsonFileStore} and
 * {@link encryptedSecretStore} under its data home; tests pass {@link memoryStore} and {@link memorySecrets}.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface Store<S> {
  /** The saved state, or undefined when nothing was saved yet. */
  load(): Promise<S | undefined>
  save(state: S): Promise<void>
}

export function memoryStore<S>(initial?: S): Store<S> & { readonly state: S | undefined } {
  let state: S | undefined = initial === undefined ? undefined : structuredClone(initial)
  return {
    get state() { return state },
    load: async () => (state === undefined ? undefined : structuredClone(state)),
    async save(next) { state = structuredClone(next) },
  }
}

/**
 * A store in one JSON file, written whole through a temporary file and a rename, so a crash mid-write leaves the last good state. A file that is not
 * this app's state (another version, broken JSON) is refused with its path, never silently replaced.
 */
export function jsonFileStore<S extends { version: number }>(file: string, label: string, version: number): Store<S> {
  return {
    async load() {
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (cause) {
        throw new Error(`${file} is not valid JSON; fix or move it and start again`, { cause })
      }
      if (typeof parsed !== 'object' || parsed === null || (parsed as { version?: unknown }).version !== version)
        throw new Error(`${file} is not a ${label} state of version ${version}; move it away to start again`)
      return parsed as S
    },
    async save(state) {
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`)
      await rename(temporary, file)
    },
  }
}

/**
 * The secret values of connections (API keys, tokens, passwords), by connection id. The one place they live: a workflow, an export, a run record and
 * an agent tool only ever see a connection's id, name and masked value (the spec, 11.1).
 *
 * ACRYL has no shared secret service yet (checked 2026-11-23: no provider of `secrets`/`vault` in acryldev/acryl). Until it has one, this port is
 * implemented by {@link encryptedSecretStore}; an OS-keychain implementation of the same port replaces it without touching the domain.
 */
export interface SecretStore {
  get(id: string): Promise<unknown>
  set(id: string, value: unknown): Promise<void>
  delete(id: string): Promise<void>
}

export function memorySecrets(): SecretStore & { readonly values: Map<string, unknown> } {
  const values = new Map<string, unknown>()
  return { values, get: async (id) => values.get(id), set: async (id, value) => { values.set(id, value) }, delete: async (id) => { values.delete(id) } }
}

/**
 * Secrets in one file encrypted with AES-256-GCM; the key is a second file. Both are readable by their owner only (0600). This keeps secrets out of
 * the app's JSON state, its exports and its backups-by-copy of that state; it does not protect against someone who can read the owner's files, which
 * an OS keychain would (the port above).
 */
export function encryptedSecretStore(file: string, keyFile: string): SecretStore {
  let cache: Map<string, unknown> | undefined
  const key = async (): Promise<Buffer> => {
    try {
      const existing = await readFile(keyFile)
      if (existing.length === 32) return existing
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const fresh = randomBytes(32)
    await mkdir(dirname(keyFile), { recursive: true })
    await writeFile(keyFile, fresh, { mode: 0o600 })
    await chmod(keyFile, 0o600)
    return fresh
  }
  const read = async (): Promise<Map<string, unknown>> => {
    if (cache !== undefined) return cache
    let blob: Buffer
    try {
      blob = await readFile(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return (cache = new Map())
      throw error
    }
    const decipher = createDecipheriv('aes-256-gcm', await key(), blob.subarray(0, 12))
    decipher.setAuthTag(blob.subarray(12, 28))
    const text = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8')
    return (cache = new Map(Object.entries(JSON.parse(text) as Record<string, unknown>)))
  }
  const write = async (values: Map<string, unknown>): Promise<void> => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', await key(), iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(Object.fromEntries(values)), 'utf8'), cipher.final()])
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 })
    await rename(temporary, file)
    await chmod(file, 0o600)
    cache = values
  }
  return {
    get: async (id) => (await read()).get(id),
    async set(id, value) { const values = new Map(await read()); values.set(id, value); await write(values) },
    async delete(id) { const values = new Map(await read()); values.delete(id); await write(values) },
  }
}
