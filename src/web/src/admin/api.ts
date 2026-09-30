import type { CollectionName } from '../content'
import type { Photo } from '../content/types'

const API = '/api/cms'

export class ApiError extends Error {
  readonly status: number
  /** Seconds, when the server rate-limited the request. */
  readonly retryAfter: number | null

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

/** The half of a photo entry the server generates from an upload. */
export type GeneratedPhoto = Pick<
  Photo,
  'id' | 'src' | 'srcAvif' | 'thumbnail' | 'thumbnailAvif' | 'width' | 'height'
>

async function request<T>(method: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    // Same-origin, so the browser attaches the Origin header the server checks
    // and the SameSite=Strict session cookie.
    response = await fetch(API + path, { method, credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  const body: unknown = isJson ? await response.json().catch(() => null) : null

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `The server answered ${response.status}.`
    const retry = Number(response.headers.get('retry-after'))
    throw new ApiError(response.status, message, Number.isFinite(retry) && retry > 0 ? retry : null)
  }
  return body as T
}

const json = (value: unknown): RequestInit => ({
  body: JSON.stringify(value),
  headers: { 'Content-Type': 'application/json' },
})

export async function isSignedIn(): Promise<boolean> {
  try {
    return (await request<{ authenticated: boolean }>('GET', '/session')).authenticated
  } catch {
    return false
  }
}

export const signIn = (password: string) => request<unknown>('POST', '/session', json({ password }))

export const signOut = () => request<unknown>('DELETE', '/session')

export async function saveCollection(name: CollectionName, value: unknown, revision: string): Promise<string> {
  const init = json(value)
  const result = await request<{ revision: string }>('PUT', `/content/${name}`, {
    ...init,
    headers: { ...init.headers, 'If-Match': revision },
  })
  return result.revision
}

export async function resetCollection(name: CollectionName, revision: string): Promise<void> {
  await request<unknown>('DELETE', `/content/${name}`, { headers: { 'If-Match': revision } })
}

export function uploadPhoto(file: File): Promise<GeneratedPhoto> {
  return request<GeneratedPhoto>('POST', `/photos?name=${encodeURIComponent(file.name)}`, {
    body: file,
    headers: { 'Content-Type': file.type.startsWith('image/') ? file.type : 'image/jpeg' },
  })
}
