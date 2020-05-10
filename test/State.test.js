import test from 'ava'
import { from, noop } from 'rxjs'
import { map, first, filter, pairwise } from 'rxjs/operators'

import { State, isObservable } from '../'

test('`new State()` returns an observable', t => {
  const state$ = new State({ foo: 1 })
  t.true(isObservable(state$))
})

test('`state$` emits synchronously', t => {
  t.plan(1)
  const state$ = new State({ foo: 1 })

  from(state$)
    .pipe(first())
    .subscribe({
      next: v => t.deepEqual(v, { foo: 1 }),
    })

  state$.update(() => ({ bar: 2 }))
})

test('new subscribers are not notified if no initial state provided but will be notified as soon as there is new state', t => {
  t.plan(2)
  const state$ = new State()

  from(state$)
    .pipe(first())
    .subscribe({
      next: v => t.deepEqual(v, { foo: 1 }),
    }) // nothing yet

  // emits new value and the above subscriber is notified
  state$.update(() => ({ foo: 1 }))

  // new subscriber is immediately notified with current state
  from(state$)
    .pipe(first())
    .subscribe({
      next: v => t.deepEqual(v, { foo: 1 }),
    })
})

test('`state$` emits current state for all new subscribers', t => {
  t.plan(2)
  const state$ = new State({ foo: 1 })

  from(state$)
    .pipe(first())
    .subscribe({
      next: v => t.deepEqual(v, { foo: 1 }),
    })

  from(state$)
    .pipe(first())
    .subscribe({
      next: v => t.deepEqual(v, { foo: 1 }),
    })
})

test('subscribers are removed when they unsubscribe', t => {
  const state$ = new State({ foo: 1 })

  const sub = from(state$).subscribe({})

  t.is(state$._subscribers.size, 1)
  sub.unsubscribe()
  t.is(state$._subscribers.size, 0)
})

test('you can access the current state through a `state$.value` getter', t => {
  const state$ = new State({ foo: 1 })

  t.deepEqual(state$.value, { foo: 1 })
})

test("you can't overwrite the current state", t => {
  const state$ = new State({ foo: 1 })

  t.throws(
    () => {
      state$.value = { foo: 2 }
    },
    {
      message: 'Cannot set property value of #<State> which has only a getter',
    },
  )

  t.deepEqual(state$.value, { foo: 1 })
})

const initialState = {
  foo: {
    bar: { a: 1 },
  },
  baz: { b: 2 },
}

test('`state$.update()` correctly updates the state', t => {
  t.plan(5)
  const state$ = new State(initialState)

  t.is(state$.value, initialState)
  from(state$)
    .pipe(first())
    .subscribe({
      next: v => t.is(v, initialState),
    })

  state$.update(draft => void (draft.baz.b = 3))
  from(state$)
    .pipe(first())
    .subscribe({
      next: v => {
        t.is(v.foo, initialState.foo)
        t.not(v.baz, initialState.baz)
        t.deepEqual(v.baz, { b: 3 })
      },
    })
})

test('`state$.isolate()` returns a new observable `subState$`', t => {
  const state$ = new State(initialState)

  const subState$ = state$.isolate('foo')
  t.true(isObservable(subState$))
})

test('`state$.isolate()` returns a `subState$` that only emits when data in that sub-state is updated', t => {
  t.plan(1)

  const state$ = new State(initialState)
  const subState$ = state$.isolate('foo')

  // this should only emit once ( t.plan(1) ), no matter how many times we update `state.baz`
  from(subState$).subscribe({
    next: v => t.is(v, initialState.foo),
  })

  state$.update(draft => void (draft.baz.b = 3))
  state$.update(draft => void (draft.baz.b = 4))
  state$.update(draft => void (draft.baz.b = 5))
})

test('subscribers to the new `subState$` are added to the state$ subscriber list and unsubscribe correctly', t => {
  const state$ = new State(initialState)
  const subState$ = state$.isolate('foo')
  const subscription = from(subState$).subscribe({})

  t.is(subState$._subscribers.size, 0)
  t.is(state$._subscribers.size, 1)

  subscription.unsubscribe()
  t.is(subState$._subscribers.size, 0)
  t.is(state$._subscribers.size, 0)
})

test('`state$.isolate()` returns a `subState$` that when subscribed to returns a subscription', t => {
  const state$ = new State(initialState)
  const subState$ = state$.isolate('foo')

  t.is(subState$._subscribers.size, 0)
  t.is(state$._subscribers.size, 0)

  // this should only emit once ( t.plan(1) ), no matter how many times we update `state.baz`
  const subscription1 = from(subState$).subscribe({})
  const subscription2 = from(subState$).subscribe({})

  t.is(subState$._subscribers.size, 0)
  t.is(state$._subscribers.size, 2)

  subscription1.unsubscribe()
  t.is(subState$._subscribers.size, 0)
  t.is(state$._subscribers.size, 1)

  subscription2.unsubscribe()
  t.is(state$._subscribers.size, 0)
  t.is(subState$._subscribers.size, 0)
})

test('`subState$` setters correctly update the parent state', t => {
  const state$ = new State(initialState)

  const subState$ = state$.isolate({
    get: state => state.foo,
    set: (state, childState) => void (state.foo = childState),
  })

  t.is(state$.value, initialState)
  t.is(subState$.value, initialState.foo)

  subState$.update(draft => void (draft.bar = { c: 3 }))

  t.deepEqual(state$.value.foo.bar, { c: 3 })
  t.deepEqual(subState$.value.bar, { c: 3 })
})

test('`subState$` updates notify only once', t => {
  t.plan(2)

  const state$ = new State(initialState)
  const subState$ = state$.isolate({
    get: state => state.foo,
    set: (state, childState) => void (state.foo = childState),
  })

  subState$.subscribe({
    next: () => t.pass(),
  })

  subState$.update(draft => void (draft.bar = { c: 3 }))
})

test('nested `subState$` setters correctly update the parent state', t => {
  const state$ = new State(initialState)
  const subState1$ = state$.isolate('foo')

  const subState2$ = subState1$.isolate({
    get: state => state.bar,
    set: (state, childState) => void (state.bar = childState),
  })

  t.is(state$.value, initialState)
  subState2$.update(draft => void (draft.a = 4))
  t.deepEqual(state$.value.foo.bar, { a: 4 })
  t.deepEqual(subState2$.value, { a: 4 })
})

test('nested `subState$` updates notify only once', t => {
  t.plan(6)
  const state$ = new State(initialState)

  const subState1$ = state$.isolate({
    get: state => state.foo,
    set: (state, childState) => void (state.foo = childState),
  })

  const subState2$ = subState1$.isolate({
    get: state => state.bar,
    set: (state, childState) => void (state.bar = childState),
  })

  const sub = state$.subscribe({
    next: v => t.pass(), // 2 times
  })

  const sub1 = subState1$.subscribe({
    next: v => t.pass(), // 2 times
  })

  const sub2 = subState2$.subscribe({
    next: v => t.pass(), // 2 times
  })

  subState2$.update(draft => void (draft.a = 4))
})

test('nested `subState$` emits for all incoming subscribers', async t => {
  t.plan(7)
  const state$ = new State(initialState)

  const subState$ = state$.isolate({
    get: state => state.foo,
    set: (state, childState) => void (state.foo = childState),
  })

  const sub1 = subState$.subscribe({
    next: v => t.pass(), // 2 times
  })

  await new Promise(resolve => {
    setTimeout(() => {
      const sub2 = subState$.subscribe({
        next: v => t.pass(), // 2 times
      })

      resolve()
    }, 500)
  })

  await new Promise(resolve => {
    setTimeout(() => {
      const sub3 = subState$.subscribe({
        next: v => t.pass(), // 2 times
      })

      resolve()
    }, 1000)
  })

  subState$.update(draft => void (draft.bar.a = 4))
  t.is(state$._subscribers.size, 3)
})

test('subscribers to nested `subState$` are added to the state$ subscriber list and unsubscribe correctly', t => {
  const state$ = new State(initialState)
  const subState1$ = state$.isolate('foo')
  const subState2$ = subState1$.isolate('bar')

  t.is(state$._subscribers.size, 0)
  t.is(subState1$._subscribers.size, 0)
  t.is(subState2$._subscribers.size, 0)

  const sub1 = subState1$.subscribe({ next: noop })
  t.is(state$._subscribers.size, 1)
  t.is(subState1$._subscribers.size, 0)
  t.is(subState2$._subscribers.size, 0)

  const sub2 = subState2$.subscribe({ next: noop })
  t.is(state$._subscribers.size, 2)
  t.is(subState1$._subscribers.size, 0)
  t.is(subState2$._subscribers.size, 0)

  sub1.unsubscribe()
  t.is(state$._subscribers.size, 1)
  t.is(subState1$._subscribers.size, 0)
  t.is(subState2$._subscribers.size, 0)

  sub2.unsubscribe()
  t.is(state$._subscribers.size, 0)
  t.is(subState1$._subscribers.size, 0)
  t.is(subState2$._subscribers.size, 0)
})

test('`state$.isolate()` without a valid lense returns the state$', t => {
  const state$ = new State(initialState)
  const subState1$ = state$.isolate()
  const subState2$ = state$.isolate({})
  const subState3$ = state$.isolate('')

  t.is(state$, subState1$)
  t.is(state$, subState2$)
  t.is(state$, subState3$)
})

test('can enable patches', t => {
  const state$ = new State()
  t.false(state$._patchesEnabled)
  t.notThrows(() => state$.enablePatches())
  t.true(state$._patchesEnabled)

  const patchEnabledState$ = new State(null, null, true)
  t.true(patchEnabledState$._patchesEnabled)
})
