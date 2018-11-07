'use strict'

const fn = require('ramda')

const trace = e => {console.log(e); return e;}

// Extend Ramda with custom functions
module.exports = fn.merge(fn, {
  trace,

  findBy: fn.curry((property, predicate, collection) =>
    collection.find(fn.compose(predicate, fn.prop(property)))
  ),

  zeroPad: number => ("0" + number).slice(-2),

  containsIgnoreCase: fn.curry((a, b) =>
    (a.toLowerCase()).includes(b.toLowerCase())
  ),

  catchOnly: fn.curry((ErrorType, callback, error) => {
    if (error instanceof ErrorType) return callback ? callback() : null
    else throw error
  }),

  denodeify: (fun) => (...args) => new Promise((resolve, reject) => {
    fun(...args, (err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  }),

  denodeify2: (fun) => (...args) => new Promise((resolve, reject) => {
    fun(...args, (err, res) => {
      if (err) resolve([err, null])
      else resolve([null, res])
    })
  })
})
