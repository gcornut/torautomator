#!/usr/bin/node
'use strict'

// Configuration
const config = require('./config')

// Utils
const fn = require('./fn')
const io = require('./io')
const log = io.Logger.create(__filename)
const search = require('./search')

function launchTorrent({hash, name}) {
  const magnet = "magnet:?xt=urn:btih:" + hash
  return io.Transmission.addUrl(magnet, {})
    .then(torrent => {
      log("Added torrent " + name)
      return torrent.hashString
    })
}

function searchLaunchTorrent(episode, showName, num) {
  return search.pirateBay(showName, num)
    .then(launchTorrent)
    .catch(console.error)
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function listShowsToWatch() {
    const isToWatch = show => !show.archived &&
        (show.last_seen == null ||
         show.last_seen.season_number != show.last_aired.season_number ||
         show.last_seen.number != show.last_aired.number)

    return io.TVShowTime.getLibrary()
        .then(fn.prop('shows'))
        .then(fn.filter(isToWatch))
}

function listEpisodesToWatch(max_ep_per_show) {
    return listShowsToWatch()
        .then(fn.chain(show => {
            return io.TVShowTime.getShow(show.id)
                .then(fn.prop('show'))
                .then(show => fn.pipe(
                    fn.filter(e => !e.seen),
                    fn.take(max_ep_per_show),
                    fn.map(fn.pipe(
                        fn.pick(['id', 'name', 'number', 'season_number', 'air_date']),
                        fn.assoc('show', fn.pick(['id', 'name'], show))
                    ))
                )(show.episodes))
        }))
        .then(Promise.all.bind(Promise))
        .then(fn.flatten)
}

function listToWatch() {
    return io.TVShowTime.getToWatch()
        .then(fn.prop('shows'))
}

function updateToWatch() {
  log("Updating from TVShowTime...")
    return listEpisodesToWatch(3).then(fn.map(episode => {
      const num = "S" + fn.zeroPad(episode.season_number) + "E" + fn.zeroPad(episode.number)
      const showName = episode.show.name.trim().replace(/[^a-zA-Z0-9\- ]/g, '')
      log("Show to watch:", showName, num)

      search.transmission(showName, num)
      .catch(fn.catchOnly(search.NoTorrentFoundError, null))
      .then((torrent) => {
        if (torrent) {
          log("Found Transmission torrent '" + torrent.name + "'")
        } else {
          log("Searching", showName, num)
          return searchLaunchTorrent(episode, showName, num)
        }
      })
      .catch(console.error)
    })
  )
}

const moment = require('moment')
const loadCron = fn.denodeify(require('crontab').load)

function scheduleNext() {
  return loadCron().then(cron => {
    let command = __filename
    let comment = "torautomator.launcher"

    let jobs = cron.jobs({comment: new RegExp(comment)})
    let job = jobs && jobs.length ? jobs[0] : cron.create(command, '* * * * *', comment)
    job.clear()

    // Next scan in 1 to 4h
    let next = moment().add(randInt(1, 3), 'h').add(randInt(0,59), 'm')
    log(
      'Scheduling on',
      next.format("dddd, MMMM Do YYYY, h:mm:ss a")
    )
    // Update job schedule
    job.minute().at(next.minute())
    job.hour().at(next.hour())
    job.dom().at(next.date())

    return fn.denodeify(cron.save.bind(cron))()
  }).catch(console.error)
}

function updateAndSchedule() {
  updateToWatch()
  scheduleNext()
}
updateAndSchedule()
