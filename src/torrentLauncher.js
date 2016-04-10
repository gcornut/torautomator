var api = require('tvshowtime-api')
var Promise = require('promise')
var kickass = require('kickass-torrent')
var fn = require('fn.js')
var HashMap = require('hashmap')
var Transmission = require('transmission')
var scheduler = require('fuzzy-scheduler')
var moment = require('moment')

var map = fn.curry(fn.map)
var filter = fn.curry(fn.filter)
var episodeRepository = new HashMap()

var properties = require("../properties.json")
function checkProperty(property) {
  if (!properties[property])
    throw new Error("Missing property '"+property+"'")
}
checkProperty('transmission-daemon-host')
checkProperty('tvshowtime-api-token')

var transmission = new Transmission({host: properties['transmission-daemon-host']})
var tv = new api(properties['tvshowtime-api-token'])

function zeroPad(number) {
  return ("0" + number).slice(-2)
}

function containsIgnoreCase(string1, string2) {
  return string1.toLowerCase().indexOf(string2.toLowerCase()) > -1
}

function log() {
  fn.apply(console.log, ["[TORRENT LAUNCHER]"].concat(fn.toArray(arguments)))
}

module.exports = function(torrentRepository) {

  var torrentNameMatches = fn.curry(function torrentNameMatches(showTitle, num, torrentName) {
    return containsIgnoreCase(torrentName, num) &&
      showTitle.replace(/'(\w+)?/g, "").split(" ").every(function(word) {
        return containsIgnoreCase(torrentName, word)
      })
  })

  var findBy = fn.curry(function find(predicate, prop, collection) {
    return collection.find(function(element) {
      return predicate(element[prop])
    })
  })

  function searchTorrentInTransmission(showTitle, num) {
    var getTorrents = Promise.denodeify(transmission.get.bind(transmission))
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
    var searchTitle = showTitle + " " + num;
    log("Searching " + searchTitle);
    return Promise.denodeify(kickass)({q: searchTitle})
      .then(fn.prop('list'))
      .then(findBy(torrentNameMatches(showTitle, num), 'title'))
      .then(function(torrent) {
        if(!torrent) throw new Error("No suitable torrent found for " + searchTitle)
        log("Found KickAss torrent '" + torrent.title + "'")
        return torrent.hash
      })
  }

  function launchTorrent(torrentHash) {
    var magnet = "magnet:?xt=urn:btih:"+torrentHash
    var addUrl = Promise.denodeify(transmission.addUrl.bind(transmission))
    return addUrl(magnet, {})
  }

  function updateToWatch() {
    return new Promise(function(resolve, reject) {
        tv.getToWatch({page: 0, limit: 100}, resolve)
      })
      .then(function(list) {
        log("Updating from TVShowTime...")
        return Promise.all(list.episodes.map(function(episode) {
          if (episodeRepository.has(episode.id)) return

          var show = episode.show
          var num = "S" + zeroPad(episode.season_number) + "E" + zeroPad(episode.number)
          var name = show.name.trim()

          episode.fileBaseName = [
            name,
            num,
            episode.name.trim()
          ].join(".").replace(/'/g, "").replace(/\s/g, ".")

          log("New episode "+ name + " " + num)
          return searchTorrentInTransmission(name, num)
            .then(function (torrentHash) {
              if (!torrentHash) {
                return searchTorrentInKickAss(name, num)
                  .then(launchTorrent)
                  .then(function(torrent) {
                      log("Added torrent " + name + " " + num)
                      return torrent.hashString
                  })
              }
              return torrentHash
            })
            .then(function(torrentHash) {
              episodeRepository.set(episode.id, episode)
              torrentRepository.set(torrentHash.toUpperCase(), episode)
            })
            .catch(console.error)
        }))
      })
  }

  function updateAndSchedule() {
    updateToWatch().then(function () {
      var now = moment()
      var then = moment(now).add(3, 'h')
      scheduler.do(updateAndSchedule).between(now, then).done()
    })
  }
  updateAndSchedule()
}
