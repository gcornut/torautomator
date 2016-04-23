'use strict'
const http = require('http')
const path = require('path')
const isVideo = require('is-video')
const Promise = require('promise')
const fn = require('fn.js')

const filter = fn.curry(fn.filter)
const fs = require('fs')
const link = Promise.denodeify(fs.link)
const readdir = Promise.denodeify(fs.readdir)
const mkdirp = Promise.denodeify(require('mkdir-parents'))

const config = require('./config')
const showsFolder = config.getPath('torrent-dest-folder')
const PORT = config.getNum('torrent-automator-http-port')

function log(...args) {
  fn.apply(console.log, ["[TORRENT COMPLETE]"].concat(args))
}

function prepareSrcPath(srcDir, srcName) {
  const findVideos = file => {
    if (!isVideo(file)) {
      return readdir(file)
        .then(filter(isVideo))
        .then(videos => videos.map(video => path.join(file, video)))
    }
    return Promise.resolve([path.join(srcDir, file)])
  }
  return findVideos(path.join(srcDir, srcName))
    .then(videos => {
      if (!videos || videos.length < 1)
        throw new Error("No video found in torrent '" + srcName + "'")
      if (videos.length > 1) {
        log("Too many video files in torrent '" + srcName + "'.\n" +
          "  Taking the first one '" + videos[0] + "'")
      }
      return videos[0]
    })
}

function prepareDestFolder(episode) {
  const showFolder = path.join(showsFolder, episode.show.name.replace(/'/g, ""))
  const seasonFolder = path.join(showFolder, "Season " + episode.season_number)
  const result = Promise.resolve(seasonFolder)

  if (!fs.existsSync(seasonFolder)) {
    log("Creating directory '" + seasonFolder + "'")
    return mkdirp(seasonFolder).then(() => result)
  }
  return result
}

module.exports = torrentRepository => {

  function onTorrentComplete([hash, srcDir, srcName]) {
    log("Torrent '" + srcName + "' completed")
    const episode = torrentRepository.get(hash.toUpperCase())
    if (episode) {
      Promise.all([prepareSrcPath(srcDir, srcName), prepareDestFolder(episode)])
        .then(([srcPath, destFolder]) => {
          const destFile = episode.fileBaseName + path.extname(srcPath)
          const destPath = path.join(destFolder, destFile)

          episode.file = destPath
          log("Moving '" + srcPath + "' to '" + destPath + "'")
          return link(srcPath, destPath)
        })
        .catch(console.error)
    }
  }

  /*
   * Listen for HTTP request signaling torrent completion
   */
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
