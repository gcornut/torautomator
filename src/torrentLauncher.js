const api = require('tvshowtime-api')
const Promise = require('promise')
const kickass = require('kickass-torrent')
const fn = require('fn.js')
const HashMap = require('hashmap')
const Transmission = require('transmission')
const scheduler = require('fuzzy-scheduler')
const moment = require('moment')

const map = fn.curry(fn.map)
const filter = fn.curry(fn.filter)
const episodeRepository = new HashMap()

const properties = require('./properties')
const transmission = new Transmission({host: properties.get('transmission-daemon-host')})
const tv = new api(properties.get(['tvshowtime-api-token']))

const zeroPad =
  (number) => ("0" + number).slice(-2)
const containsIgnoreCase =
  (a, b) => a.toLowerCase().indexOf(b.toLowerCase()) > -1

function log(...args) {
  fn.apply(console.log, ["[TORRENT LAUNCHER]"].concat(args))
}

module.exports = function(torrentRepository) {

  const torrentNameMatches = fn.curry((showTitle, num, torrentName) =>
    containsIgnoreCase(torrentName, num) &&
      showTitle.replace(/'(\w+)?/g, "").split(" ")
        .every((word) => containsIgnoreCase(torrentName, word))
  )

  const findBy = fn.curry((predicate, prop, collection) =>
    collection.find(fn.compose(predicate, fn.prop(prop)))
  )

  function searchTorrentInTransmission(showTitle, num) {
    const getTorrents = Promise.denodeify(transmission.get.bind(transmission))
    return getTorrents()
      .then(fn.prop('torrents'))
      .then(findBy(torrentNameMatches(showTitle, num), 'name'))
      .then(function (torrent) {
        if(torrent) {
          log("Found transmission torrent '"+torrent.name+"'")
          return torrent.hashString
        }
      })
  }

  function searchTorrentInKickAss(showTitle, num) {
    const searchTitle = showTitle + " " + num
    log("Searching " + searchTitle)
    const kickassSearch = Promise.denodeify(kickass)
    return kickassSearch({q: searchTitle})
      .then(fn.prop('list'))
      .then(findBy(torrentNameMatches(showTitle, num), 'title'))
      .then((torrent) => {
        if(!torrent) throw new Error("No suitable torrent found for " + searchTitle)
        log("Found KickAss torrent '" + torrent.title + "'")
        return torrent.hash
      })
  }

  function launchTorrent(torrentHash) {
    const magnet = "magnet:?xt=urn:btih:"+torrentHash
    const addUrl = Promise.denodeify(transmission.addUrl.bind(transmission))
    return addUrl(magnet, {})
  }

  function updateToWatch() {
    return new Promise(
        (resolve, reject) => tv.getToWatch({page: 0, limit: 100}, resolve)
      ).then((list) => {
        log("Updating from TVShowTime...")
        const promises = list.episodes.map((episode) => {
          if (episodeRepository.has(episode.id)) return

          const show = episode.show
          const num = "S" + zeroPad(episode.season_number) + "E" + zeroPad(episode.number)
          const name = show.name.trim()

          episode.fileBaseName = [
            name,
            num,
            episode.name.trim()
          ].join(".").replace(/'/g, "").replace(/\s/g, ".")

          log("New episode "+ name + " " + num)
          return searchTorrentInTransmission(name, num)
            .then((torrentHash) => {
              if (!torrentHash) {
                return searchTorrentInKickAss(name, num)
                  .then(launchTorrent)
                  .then((torrent) => {
                      log("Added torrent " + name + " " + num)
                      return torrent.hashString
                  })
              }
              return torrentHash
            })
            .then((torrentHash) => {
              episodeRepository.set(episode.id, episode)
              torrentRepository.set(torrentHash.toUpperCase(), episode)
            })
            .catch(console.error)
        })
        return Promise.all(promises)
      })
  }

  function updateAndSchedule() {
    updateToWatch().then(() => {
      const now = moment()
      const then = moment(now).add(3, 'h')
      scheduler.do(updateAndSchedule).between(now, then).done()
    })
  }
  updateAndSchedule()
}
