/**
 * `server-only` throws on import outside a React Server Component build. Under Vitest we
 * are deliberately unit-testing server modules in isolation, so it is aliased to this
 * no-op. The real guard still applies in the Next build, which is where it matters.
 */
export {};
