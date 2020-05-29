const writePackage = require('write-pkg')
const readPackage = require('read-pkg')

const opts = { normalize: false }
const json = readPackage.sync(opts)

writePackage({ ...json, name: `immerx` })
