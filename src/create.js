import { State } from './State'

export function create(initialState, middleware) {
  const state$ = new State(initialState, null, true)

  if (typeof middleware === 'function') {
    state$.registerMiddleware([middleware])
  } else if (Array.isArray(middleware) && middleware.length > 0) {
    state$.registerMiddleware(middleware)
  }
}
