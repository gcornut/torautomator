
const fn = require('./fn')
const io = require('./io')

const torrentNameMatches = fn.curry((showName, num, torrentName) =>
    showName
        .replace(/[^a-zA-Z0-9\- ]/g, '') // remove non ascii except spaces
        .split(" ")
        .concat([num])
        .every(fn.containsIgnoreCase(torrentName))
)

function NoTorrentFoundError(message) {
    this.name = 'NoTorrentFoundError'
    this.message = message
    this.stack = (new Error()).stack
}
NoTorrentFoundError.prototype = new Error()

function searchTransmission(showName, num) {
  return io.Transmission.get()
    .then(fn.prop('torrents'))
    .then(fn.findBy('name', torrentNameMatches(showName, num)))
    .then(torrent => {
      if (!torrent)
        throw new NoTorrentFoundError("No torrent " + showName + " " + num + " in Transmission")
      return { hash: torrent.hashString, name: torrent.name }
    })
}

function hashFromMagnet(magnetLink) {
  var m = null
  if ((m = magnetLink.match(/urn:btih:([^&]+)/))) {
    return m[1].toLowerCase()
  }
}

function searchPirateBay(showName, num) {
  const searchTitle = showName + " " + num
  const throwNotFound = () => {
    throw new NoTorrentFoundError("No suitable torrent found for " + searchTitle)
  }
  return io.PirateBay.search(searchTitle, {
    filter: {verified: true}
  }).then(fn.findBy('name', torrentNameMatches(showName, num)))
    .catch(throwNotFound)
    .then(torrent => {
      if (!torrent) throwNotFound()
      return { hash: hashFromMagnet(torrent.magnetLink), name: torrent.name }
    })
}

module.exports = {
  torrentNameMatches,
  hashFromMagnet,
  transmission: searchTransmission,
  pirateBay: searchPirateBay,
  NoTorrentFoundError
}
