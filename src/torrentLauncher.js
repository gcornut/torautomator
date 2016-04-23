'use strict'
const api = require('tvshowtime-api')
const Promise = require('promise')
const kickass = require('kickass-torrent')
const fn = require('fn.js')
const HashMap = require('hashmap')
const Transmission = require('transmission')
const scheduler = require('fuzzy-scheduler')
const moment = require('moment')

// Utils
const map = fn.curry(fn.map)
const filter = fn.curry(fn.filter)
const findBy = (predicate, prop) => collection =>
  collection.find(fn.compose(predicate, fn.prop(prop)))
const zeroPad = number => ("0" + number).slice(-2)
const containsIgnoreCase = a => b =>
  a.toLowerCase().indexOf(b.toLowerCase()) > -1
function log(...args) {
  fn.apply(console.log, ["[TORRENT LAUNCHER]"].concat(args))
}

const config = require('./config')
const transmission = new Transmission({
  host: config.get('transmission-daemon-host'),
  port: config.getNum('transmission-daemon-port')
})
const tvst = new api(config.get('tvshowtime-api-token'))

module.exports = function(torrentRepository) {
  const episodeRepository = new HashMap()

  const torrentNameMatches = (showTitle, num) => torrentName =>
    containsIgnoreCase(torrentName)(num) &&
      showTitle.replace(/'(\w+)?/g, "")
        .split(" ")
        .every(containsIgnoreCase(torrentName))

  function searchTorrentInTransmission(showTitle, num) {
    const getTorrents = Promise.denodeify(transmission.get.bind(transmission))
    return getTorrents()
      .then(fn.prop('torrents'))
      .then(findBy(torrentNameMatches(showTitle, num), 'name'))
      .then(torrent => {
        if(torrent) {
          log("Found transmission torrent '" + torrent.name + "'")
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
      .then(torrent => {
        if(!torrent) throw new Error("No suitable torrent found for " + searchTitle)
        log("Found KickAss torrent '" + torrent.title + "'")
        return torrent.hash
      })
  }

  function launchTorrent(torrentHash) {
    const magnet = "magnet:?xt=urn:btih:" + torrentHash
    const addUrl = Promise.denodeify(transmission.addUrl.bind(transmission))
    return addUrl(magnet, {})
  }

  function updateToWatch() {
    return new Promise(
        (resolve, _) => tvst.getToWatch({page: 0, limit: 100}, resolve)
      ).then(list => {
        log("Updating from TVShowTime...")
        const promises = list.episodes.map(episode => {
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
            .then(torrentHash => {
              if (!torrentHash) {
                return searchTorrentInKickAss(name, num)
                  .then(launchTorrent)
                  .then(torrent => {
                      log("Added torrent " + name + " " + num)
                      return torrent.hashString
                  })
              }
              return torrentHash
            })
            .then(torrentHash => {
              episodeRepository.set(episode.id, episode)
              torrentRepository.set(torrentHash.toUpperCase(), episode)
            })
            .catch(console.error)
        })
        return Promise.all(promises)
      })
  }

  function updateAndSchedule() {
    updateToWatch().then(
      // Schedule next update sometime between 1 and 3h
      () => scheduler.do(updateAndSchedule)
        .between(
          moment().add(1, 'h'),
          moment().add(3, 'h')
        ).done()
    )
  }
  updateAndSchedule()
}
