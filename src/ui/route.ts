import { useEffect, useState } from 'react'

/**
 * Two screens share the one static site: the play-along (the default) and the
 * bar bench at #bench. A hash keeps both linkable and bookmarkable without any
 * server-side routing on the host.
 */
export type Route = 'play' | 'bench'

export function routeFromHash(hash: string): Route {
  return hash.replace(/^#/, '') === 'bench' ? 'bench' : 'play'
}

export function hashForRoute(route: Route): string {
  return route === 'bench' ? '#bench' : ''
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function goTo(route: Route): void {
  const hash = hashForRoute(route)
  if (hash) window.location.hash = hash
  else history.replaceState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
