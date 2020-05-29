<img src="images/immerx-logo.svg" height="70px"/>

<br/>

**Reactive** and **fractal** state management with [Immer](https://github.com/immerjs/immer)

<br/>

**Table of contents**:

- [`Install`](#install)
- [`Create`](#create)
- [`Observe`](#observe)
- [`Update`](#update)
- [`Compose`](#compose)
- [`Combine and compute`](#combine-and-compute)
- [`Middleware`](#middleware)
- [`React bindings`](#use-with-react)

<br/>

### `Install`

```sh
npm install immerx
```

**Immer** `>= v6.0.0` is a [peer dependency](https://nodejs.org/es/blog/npm/peer-dependencies/) so make sure it's installed.

<br/>

### `Create`

```js
import create from 'immerx'

const state$ = create({ count: 0 })
```

Pretty simple - we create a new state by importing `create` and call it with an _initial state_ value.

<br/>

### `Observe`

```js
import create from 'immerx'

const state$ = create({ count: 0 })
state$.subscribe({
  next: v => console.log(`Count is: ${v}`),
})
// > Count is: 0
```

Our `state$` is an [observable](https://github.com/tc39/proposal-observable) which we can subscribe to and get notified on every state change.

<br/>

### `Update`

The following examples assume that you already know about [Immer](https://github.com/immerjs/immer), what [drafts & producers](https://immerjs.github.io/immer/docs/produce) are and how to use them.

```js
import create from 'immerx'

const state$ = create({ count: 0 })
state$.subscribe({
  next: v => console.log(`Count is: ${v}`),
})
// > Count is: 0

state$.update(draft => void draft.count++)
// > Count is: 1
```

[![Edit immerx-simple-counter](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/immerx-simple-counter-wrpqb?fontsize=14&hidenavigation=1&theme=dark)

Our `state$` exposes an `update` method that takes a [curried producer](https://immerjs.github.io/immer/docs/curried-produce) in order to update the underlying state object.

<br/>

### `Compose`

In addition to being reactive, `state$` is also [fractal](https://staltz.com/unidirectional-user-interface-architectures.html), which allows as to create and compose smaller and isolated pieces of state where consumers will be notified only for relevant changes. Updates are also isolated so the consumer doesn't need to know anything about the "global" state:

```js
import create from 'immerx'

const state$ = create({ parent: { child: 'foo' } })

const parentState$ = state$.isolate('parent')
const childState$ = parentState$.isolate('child')

parentState$.subscribe({
  next: v => console.log('parent state: ', v),
})
// > parent state: { child: "foo" }

childState$.subscribe({
  next: v => console.log('child state: ', v),
})
// > child state: foo

state$.update(draft => void (draft.otherParent = {}))
/* nothing logged after this update */

parentState$.update(parentDraft => void (parentDraft.sibling = 'bar'))
// > parent state: { child: "foo", sibling: "bar" }

childState$.update(() => 'baz')
// > parent state: { child: "baz", sibling: "bar" }
// > child state: "baz"
```

[![Edit immerx-fractal-example](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/falling-pine-ndiue?fontsize=14&hidenavigation=1&theme=dark)

<br/>

### `Combine and compute`

More often than we'd like, our consumers need to combine and/or compute different pieces of state, sometimes including parts of its parent state. This type of isolation can be achieved through [`lenses`](https://medium.com/javascript-scene/lenses-b85976cb0534).

> Lenses allow you to abstract state shape behind getters and setters.

```js
import create from 'immerx'

const INITIAL_STATE = {
  user: { name: 'John', remainingTodos: [1, 2] },
  todos: ['Learn JS', 'Try immerx', 'Read a book', 'Buy milk'],
}
const state$ = create(INITIAL_STATE)

const user$ = state$.isolate({
  get: state => ({
    ...state.user,
    remainingTodos: state.user.remainingTodos.map(idx => state.todos[idx]),
  }),
  set: (stateDraft, userState) => {
    const idxs = userState.remainingTodos.map(t => {
      const idx = stateDraft.todos.indexOf(t)
      return idx > -1 ? idx : stateDraft.todos.push(t) - 1
    })

    stateDraft.user = { ...userState, remainingTodos: idxs }
  },
})

user$.subscribe({
  next: console.log,
})
// > { name: "John", remainingTodos: [ "Try immerx", "Read a book" ] }

user$.update(userDraft => void userDraft.remainingTodos.push('Say hello'))
// > { name: "John", remainingTodos: [ "Try immerx", "Read a book", "Say hello" ] }

user$.update(userDraft => void userDraft.remainingTodos.splice(1, 1))
// > { name: "John", remainingTodos: [ "Try immerx", "Say hello" ] }
```

[![Edit immerx-combine-and-compute](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/immerx-combine-and-compute-evqvu?fontsize=14&hidenavigation=1&theme=dark)

Let's quickly explain what's going on here:

Obviously, it's a very simple _todos_ app where the state seems to have a normalized shape. We use a lens to provide our consumer with an isolated piece of the state (`user$`) where the `getter` returns the `user` object but also expands `user.remainingTodos`.

```js
get: state => ({
  ...state.user,
  remainingTodos: state.user.remainingTodos.map(idx => state.todos[idx]),
})
```

The consumer can manipulate the `remainingTodos` without having any idea that a `todos` list exists in the parent state and that `user.remainingTodos` is actually a list of pointers to entries inside `todos`.

It can safely push the todo text inside the `remainingTodos`:

```js
user$.update(userDraft => void userDraft.remainingTodos.push('Say hello'))
```

The lens' `setter` will take care of updating the parent state while keeping it normalized.

```js
set: (stateDraft, userState) => {
  const idxs = userState.remainingTodos.map(t => {
    const idx = stateDraft.todos.indexOf(t)
    return idx > -1 ? idx : stateDraft.todos.push(t) - 1
  })
  stateDraft.user.remainingTodos = idxs
}
```

<br/>

### `Middleware`

Middleware implementations are based around immer [patches](https://immerjs.github.io/immer/docs/patches). We can register functions (middleware) with **immerx** and they will receive a reference to the `state$` and then be invoked with every patch. Based on how and where something was updated in our state, our middleware can perform side-effect and/or update the state.

The middleware signature is very simple:

```js
function middleware(state$) {
  return ({ patches, inversePatches }, state) => {
    /**
     * This function is called for every state update.
     *
     * It receives the list of patches/inversePatches
     * and is closed over the state$ so we can use state$.update()
     * to update the state in response
     */
  }
}
```

We can now pass our middleware to `create` and it'll be registered with **immerx**

```js
import create from 'immerx'

import initialState from './state'
import middleware from './middleware'

create(initialState, [middleware])
```

Check out [immerx-middleware](https://github.com/monojack/immerx-middleware) - an observable based middleware.

<br/>

### `Use with React`

Check out the React bindings at [immerx-react](https://github.com/monojack/immerx-react)
