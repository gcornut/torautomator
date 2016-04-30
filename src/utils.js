'use strict'
const { curry, prop, compose, apply } = require('fn.js')

module.exports = {
  map: curry((f, coll) => coll.map(f)),

  filter: curry((p, coll) => coll.filter(p)),

  findBy: curry((property, predicate, collection) =>
    collection.find(compose(predicate, prop(property)))
  ),

  zeroPad: number => ("0" + number).slice(-2),

  containsIgnoreCase: curry((a, b) =>
    a.toLowerCase().includes(b.toLowerCase())
  ),

  catchOnly: curry((ErrorType, callback, error) => {
    if (error instanceof ErrorType) return callback ? callback() : null
    else throw error
  }),

  logger: prefix => (...args) => {
    apply(console.log, [prefix].concat(args))
  },

  denodeify: fun => (...args) => new Promise((resolve, reject) => {
    apply(fun, args.concat((err, res) => {
      if (err) reject(err)
      else resolve(res)
    }))
  })
}
