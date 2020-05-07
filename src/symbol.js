export const observable = (() =>
  (typeof Symbol === 'function' && Symbol.observable) || '@@observable')()
