'use strict'

// Utils
const isVideo = require('is-video')
const { curry, compose } = require('fn.js')
const { map, filter, zeroPad, logger, denodeify } = require('./utils.js')
const log = logger("[TORRENT COMPLETE]")

// PATH
const path = require('path')
const pbaseName = curry(path.basename)

// FS
const fs = require('fs')
const exists = denodeify(fs.stat)
const link = denodeify(fs.link)
const readdir = denodeify(fs.readdir)
const mkdirp = denodeify(require('mkdir-parents'))

// Configs
const config = require('./config')
const SHOWS_FOLDER = config.getPath('torrent-dest-folder')
const PORT = config.getNum('torrent-automator-http-port')

// TVShowTime
const TVSTAPI = require('tvshowtime-api')
const tvst = new TVSTAPI(config.get('tvshowtime-api-token'))
const getTVShowTimeEpisode = filename => new Promise((resolve, reject) =>
  tvst.getEpisode({filename}, res => res.episode ? resolve(res.episode) : reject(res))
)

const pjoin = a => b => path.join(a, b)
function findVideos(filePath) {
  if (isVideo(filePath))
    return Promise.resolve([filePath])
  return readdir(filePath)
    .then(compose(filter(isVideo), map(pjoin(filePath))))
}

function getEpisodeDestPath(episode, videoExt) {
  const showFolder = path.join(SHOWS_FOLDER, episode.show.name.replace(/'/g, ""))
  const seasonFolder = path.join(showFolder, "Season " + episode.season_number)

  const fileBaseName = [
    // Show name
    episode.show.name.trim(),
    // Season & Episode number
    "S" + zeroPad(episode.season_number) + "E" + zeroPad(episode.number),
    // Episode title
    episode.name.trim()
  ].join(".").replace(/'/g, "").replace(/\s+/g, ".")

  return exists(seasonFolder)
    .catch(() => {
      log("Creating directory '" + seasonFolder + "'")
      return mkdirp(seasonFolder)
    })
    .then(() => path.join(seasonFolder, fileBaseName + videoExt))
}

function onTorrentComplete([hash, srcDir, srcName]) {
  log("Torrent '" + srcName + "' completed")

  const filePath = path.join(srcDir, srcName)
  findVideos(filePath)
    .then(compose(Promise.all, map(srcPath =>
      getTVShowTimeEpisode(path.basename(srcPath))
      //.catch(() => getTVShowTimeEpisode(srcName))
      .then(episode =>
        getEpisodeDestPath(episode, path.extname(srcPath))
        .then(destPath => {
          log("Moving '" + srcPath + "' to '" + destPath + "'")
          return link(srcPath, destPath)
        })
      )
      .catch(console.error)
    )))
    .catch(console.error)
}

// Exports
module.exports = () => {
  /*
   * Listen for HTTP request signaling torrent completion
   */
  const http = require('http')
  http.createServer((req, res) => {
    var data = ""
    req.on('data', chunk => data += chunk.toString())
    req.on('end', () => {
      const parse = data.split("::")
      if (parse.length == 3)
        onTorrentComplete(parse)
      res.end()
    })
  }).listen(PORT)
}
