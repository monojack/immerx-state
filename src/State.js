import { enablePatches, produce } from 'immer'

import { observable as Symbol_observable } from './symbol'
import { shallowEqual } from './shallowEqual'

const hiddenState = new WeakMap()

function makeGetter(lens) {
  if (typeof lens === 'string' || typeof lens === 'number') {
    return function lensGet(state) {
      if (typeof state === 'undefined') {
        return void 0
      } else {
        return state[lens]
      }
    }
  } else {
    return lens.get
  }
}

function makeSetter(lens) {
  if (typeof lens === 'string' || typeof lens === 'number') {
    return function lensSet(state, childState) {
      if (typeof state === 'undefined') {
        return { [lens]: childState }
      } else {
        state[lens] = childState
      }
    }
  } else {
    return lens.set
  }
}

export class State {
  constructor(a, b, ep = false) {
    if (typeof a === 'function' && typeof b !== 'function') {
      hiddenState.set(this, b)
      this.subscribe = a
    } else {
      hiddenState.set(this, a)
      b && (this.subscribe = b)
    }

    ep && enablePatches()

    this._patchesEnabled = ep
    this._closed = false
    this._subscribers = new Set()
    this._middlewares = new Set()
  }

  update(cb) {
    const _state = hiddenState.get(this)

    if (this._patchesEnabled) {
      var patches, inversePatches
      var nextState = produce(_state, cb, (p, ip) => {
        patches = p
        inversePatches = ip
      })
    } else {
      nextState = produce(_state, cb)
    }

    hiddenState.set(this, nextState)
    if (this.source) {
      this.source.update(sourceDraft => this.setter(sourceDraft, nextState))
    } else {
      this.next(nextState, { patches, inversePatches })
      return { state: nextState, patches, inversePatches }
    }
  }

  next(nextState, patches) {
    this._subscribers.forEach(subscriber => {
      subscriber?.next?.(nextState, patches)
    })

    hiddenState.set(this, nextState)
    this._middlewares.forEach(middleware => {
      middleware.call(this, patches, nextState)
    })
  }

  error(error) {
    this._subscribers.forEach(subscriber => {
      subscriber?.error?.(error)
    })
    this._closed = true
    this._subscribers.clear()
  }

  complete() {
    this._subscribers.forEach(subscriber => {
      subscriber?.complete?.()
    })
    this._closed = true
    this._subscribers.clear()
  }

  subscribe(subscriber) {
    if (this.closed) {
      subscriber.complete()
      return () => {}
    }

    const _state = hiddenState.get(this)
    typeof _state !== 'undefined' && subscriber.next(_state)
    this._subscribers.add(subscriber)
    return {
      unsubscribe: () => this._subscribers.delete(subscriber),
    }
  }

  isolate(lens) {
    if (
      lens == null ||
      (typeof lens === 'object' && !lens.get) ||
      (typeof lens === 'string' && lens.trim() === '')
    ) {
      return this
    }

    const source = this
    const get = makeGetter(lens)
    const set = makeSetter(lens)

    const _initState = get(hiddenState.get(source))

    const subState$ = new State(
      _initState,
      function (subscriber) {
        let _prevState

        return source.subscribe({
          next: n => {
            const _nextState = get(n)
            if (!shallowEqual(_nextState, _prevState)) {
              _prevState = _nextState
              subscriber.next(_nextState)
            }
          },
          error: e => subscriber.error(e),
          complete: () => subscriber.complete(),
        })
      },
      source._patchesEnabled,
    )
    subState$.getter = get
    subState$.setter = set
    subState$.source = source

    return subState$
  }

  applyMiddleware(middleware) {
    this.enablePatches()
    this._middlewares.add(middleware)
  }

  enablePatches(epics) {
    enablePatches()
    this._patchesEnabled = true
  }

  tag(str) {
    this.tag = str
  }

  get value() {
    return hiddenState.get(this)
  }

  [Symbol_observable]() {
    return this
  }
}

export default State
