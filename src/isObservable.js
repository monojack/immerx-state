import { observable as Symbol_observable } from './symbol'

export function isObservable(obj) {
  return (
    !!obj &&
    typeof obj[Symbol_observable] === 'function' &&
    typeof obj.subscribe === 'function'
  )
}
