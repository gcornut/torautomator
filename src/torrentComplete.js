#!/usr/bin/node
'use strict'

// Utils
const isVideo = require('is-video')
const fn = require('./fn')

// PATH
const path = require('path')
const pbaseName = fn.curry(path.basename)

// Configs
const config = require('./config')
const SHOWS_FOLDER = config.getPath('torrent-dest-folder')

const io = require('./io')
const log = io.Logger.create(__filename)

const pjoin = a => b => path.join(a, b)
function findVideos(filePath) {
  if (isVideo(filePath))
    return Promise.resolve([filePath])
  return io.fs.readdir(filePath)
    .then(fn.compose(fn.filter(isVideo), fn.map(pjoin(filePath))))
}

function sanitize(string) {
    return string.trim().replace(/[^0-9A-Za-z\-_ ]/g, "")
}

function getEpisodeDestPath(episode, videoExt) {
  const showName = sanitize(episode.show.name)
  const seasonNumber = fn.zeroPad(episode.season_number)
  const episodeName = sanitize(episode.name)
  const episodeNumber = fn.zeroPad(episode.number)
  const showFolder = path.join(SHOWS_FOLDER, showName)
  const seasonFolder = path.join(showFolder, "Season " + seasonNumber)

  const fileBaseName = [
    // Show name
    showName,
    // Season & Episode number
    "S" + seasonNumber + "E" + episodeNumber,
    // Episode title
    episodeName
  ].join(".").replace(/\s+/g, ".").replace(/\.+/g, ".")

  return io.fs.exists(seasonFolder)
    .catch(() => {
      log("Creating directory '" + seasonFolder + "'")
      return io.fs.mkdirp(seasonFolder)
    })
    .then(() => path.join(seasonFolder, fileBaseName + videoExt))
}

function onTorrentComplete(filePath) {
  if (!filePath) return
  log("Torrent '" + filePath + "' completed")

  findVideos(filePath)
    .then(fn.compose(Promise.all, fn.map(srcPath =>
      io.TVShowTime.getEpisode(path.basename(srcPath))
      .then(fn.prop('episode'))
      .then(episode =>
        getEpisodeDestPath(episode, path.extname(srcPath))
        .then(destPath => {
          log("Copying '" + srcPath + "' to '" + destPath + "'")
          return io.fs.copy(srcPath, destPath)
        })
      )
      .catch(log)
    )))
    .catch(log)
}
if (process.env.TR_TORRENT_DIR && process.env.TR_TORRENT_NAME) {
  onTorrentComplete(path.join(process.env.TR_TORRENT_DIR, process.env.TR_TORRENT_NAME))
} else {
  onTorrentComplete(process.argv[2])
}
