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

function getEpisodeDestPath(episode, videoExt) {
  const showFolder = path.join(SHOWS_FOLDER, episode.show.name.replace(/'/g, ""))
  const seasonFolder = path.join(showFolder, "Season " + episode.season_number)

  const fileBaseName = [
    // Show name
    episode.show.name.trim(),
    // Season & Episode number
    "S" + fn.zeroPad(episode.season_number) + "E" + fn.zeroPad(episode.number),
    // Episode title
    episode.name.trim()
  ].join(".").replace(/'/g, "").replace(/\s+/g, ".")

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
      .then(episode =>
        getEpisodeDestPath(episode, path.extname(srcPath))
        .then(destPath => {
          log("Moving '" + srcPath + "' to '" + destPath + "'")
          return io.fs.link(srcPath, destPath)
        })
      )
      .catch(console.error)
    )))
    .catch(console.error)
}
if (process.env.TR_TORRENT_DIR && process.env.TR_TORRENT_NAME) {
  onTorrentComplete(path.join(process.env.TR_TORRENT_DIR, process.env.TR_TORRENT_NAME))
} else {
  onTorrentComplete(process.argv[2])
}
