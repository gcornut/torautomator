const path = require('path')
const properties = require('../properties.json')

function get(property) {
  const value = properties[property]
  if (!value) throw new Error("Missing property '"+property+"'")
  return value
}

module.exports = {
  get: get,
  getPath: (property) => path.resolve(get(property).replace(/~/g, process.env.HOME))
}
