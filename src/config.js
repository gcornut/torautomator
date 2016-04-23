const fn = require('fn.js')
const path = require('path')
const config = require('../config.json')

const get = type => property => {
  const value = config[property]
  const realType = type === "path" ? "string" : type
  if (!value || value === "")
    throw new Error("Missing property '" + property + "'")
  if (typeof value !== realType)
    throw new Error("Property '" + property + "' should be of type '" + realType + "'")
  if (type === "path")
    return path.resolve(value.replace(/^~\//g, process.env.HOME + '/'))
  return value
}

module.exports = {
  get: get("string"),
  getPath: get("path"),
  getNum: get("number")
}
