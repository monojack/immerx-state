import { State } from './State'

export function create(initialState) {
  return new State(initialState, null, true)
}
