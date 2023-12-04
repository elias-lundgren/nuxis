import { Key, pathToRegexp as ptr } from 'path-to-regexp'

export type MatchFn = (
  path: string
) => { params: Record<string, string>; path: string } | null

const paths: Map<string, MatchFn> = new Map()

/**
 * Creates a function that will match a path against a string.
 * The function is memoized so it can be used in a hash map.
 * i.e the same path will always return the same function.
 */
export function pathToMatch(path: string) {
  if (paths.has(path)) {
    return paths.get(path)!
  }

  const keys: Key[] = []
  const regexp = ptr(path, keys)

  function match(pathname: string) {
    const result = regexp.exec(pathname)

    if (!result) {
      return null
    }

    const params = Object.create(null)

    for (let i = 1; i < result.length; i++) {
      params[keys[i - 1].name] = result[i]
    }

    return { params, path }
  }

  paths.set(path, match)

  return match
}
