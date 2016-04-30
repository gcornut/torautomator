'use strict'

// Utils
const { prop, curry } = require('fn.js')
const { map, filter, findBy, zeroPad, containsIgnoreCase, catchOnly, logger, denodeify } = require('./utils.js')
const log = logger("[TORRENT LAUNCHER]")

// Configuration
const config = require('./config')

// Transmission
const Transmission = require('transmission')
const transmission = new Transmission({
  host: config.get('transmission-daemon-host'),
  port: config.getNum('transmission-daemon-port')
})
const getTransmissionTorrents = denodeify(transmission.get.bind(transmission))
const addTransmissionTorrent = denodeify(transmission.addUrl.bind(transmission))

// KickAssTorrent
const kickassSearch = denodeify(require('kickass-torrent'))

//TVShowTime
const TVSTAPI = require('tvshowtime-api')
const tvst = new TVSTAPI(config.get('tvshowtime-api-token'))
const getTvShowTimeToWatch = () => new Promise((resolve, _) =>
  tvst.getToWatch({page: 0, limit: 100}, resolve)
)

const torrentNameMatches = curry((showName, num, torrentName) =>
    showName.replace(/'(\w+)?/g, "")
        .split(" ")
        .concat([num])
        .every(containsIgnoreCase(torrentName))
)

function NoTorrentFoundError(message) {
  this.message = (message || "")
}
NoTorrentFoundError.prototype = new Error()

function searchTorrentInTransmission(showName, num) {
  return getTransmissionTorrents()
    .then(prop('torrents'))
    .then(findBy('name', torrentNameMatches(showName, num)))
    .then(torrent => {
      if (!torrent)
        throw new NoTorrentFoundError("No torrent " + showName + " " + num + " in Transmission")
      log("Found Transmission torrent '" + torrent.name + "'")
      return torrent.hashString
    })
}

function searchTorrentInKickAss(showName, num) {
  const searchTitle = showName + " " + num
  log("Searching " + searchTitle)
  return kickassSearch({q: searchTitle})
    .then(prop('list'))
    .then(findBy('title', torrentNameMatches(showName, num)))
    .then(torrent => {
      if(!torrent)
        throw new NoTorrentFoundError("No suitable torrent found for " + searchTitle)
      log("Found KickAss torrent '" + torrent.title + "'")
      return torrent.hash
    })
}

function launchTorrent(torrentHash) {
  const magnet = "magnet:?xt=urn:btih:" + torrentHash
  return addTransmissionTorrent(magnet, {})
    .then(torrent => {
      log("Added torrent " + torrent.name)
      return torrent.hashString
    })
}

module.exports = () => {
  const scheduler = require('fuzzy-scheduler')
  const moment = require('moment')

  function searchLaunchTorrent(episode, showName, num) {
    return searchTorrentInKickAss(showName, num)
      .then(launchTorrent)
      //.then(torrentHash => torrentRepository.set(torrentHash.toUpperCase(), episode))
      .catch(console.error)
  }

  function updateToWatch() {
    return getTvShowTimeToWatch().then(list => {
        log("Updating from TVShowTime...")
        list.episodes.map(episode => {
          const num = "S" + zeroPad(episode.season_number) + "E" + zeroPad(episode.number)
          const showName = episode.show.name.trim()

          searchTorrentInTransmission(showName, num)
            .catch(catchOnly(NoTorrentFoundError, null))
            .then(() => {
              // Torrent not found in transmission, search in KickAssTorrent (delayed)
              log("New episode "+ showName + " " + num + " will be searched in about 1 to 2h")
              scheduler.do(() => searchLaunchTorrent(episode, showName, num))
                .between(
                  moment().add(1, 'h'),
                  moment().add(1, 'h').add(50, 'm')
                ).done()
            })
            .catch(console.error)
        })
      })
  }

  function updateAndSchedule() {
    updateToWatch()
    // Schedule next update sometime between 2 and
    scheduler.do(updateAndSchedule)
      .between(
        moment().add(2, 'h'),
        moment().add(4, 'h')
      ).done()
  }
  updateAndSchedule()
}
