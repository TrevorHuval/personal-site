/**
 * Everything the server reads from its environment, in one place, so the rest
 * of the code takes a plain object and tests can build one without touching
 * `process.env`.
 */

const MB = 1024 * 1024

export function loadConfig(env = process.env) {
  const publicOrigin = (env.PUBLIC_ORIGIN ?? 'https://trevorhuval.com').replace(/\/+$/, '')
  const origins = new Set([publicOrigin])

  // Caddy serves both names, so a session started on either must be accepted.
  const host = new URL(publicOrigin)
  if (!host.hostname.startsWith('www.') && host.hostname.includes('.')) {
    origins.add(`${host.protocol}//www.${host.host}`)
  }
  for (const extra of (env.ALLOWED_ORIGINS ?? '').split(',')) {
    if (extra.trim() !== '') origins.add(extra.trim().replace(/\/+$/, ''))
  }

  return {
    port: Number(env.PORT ?? 8080),
    dataDir: env.DATA_DIR ?? '/data',
    origins,
    passwordHash: env.ADMIN_PASSWORD_HASH ?? '',
    sessionSecret: env.SESSION_SECRET ?? '',
    sessionTtlMs: Number(env.SESSION_HOURS ?? 12) * 60 * 60 * 1000,
    /** Off only for plain-http local development. */
    secureCookies: env.INSECURE_COOKIES !== '1',
    /** Behind Caddy the socket peer is always the proxy; the client is in X-Forwarded-For. */
    trustProxy: env.TRUST_PROXY !== '0',
    maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 25) * MB,
  }
}
