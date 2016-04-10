var http = require('http')
var path = require('path')
var fs = require('fs')
fs.mkdirp = require('mkdir-parents')
var isVideo = require('is-video')
var Promise = require('promise')
var fn = require('fn.js')

var filter = fn.curry(fn.filter)
function log() {
  fn.apply(console.log, ["[TORRENT COMPLETE]"].concat(fn.toArray(arguments)))
}

var properties = require('../properties.json')
function checkProperty(property) {
  if (!properties[property])
    throw new Error("Missing property '"+property+"'")
}
checkProperty('torrent-dest-folder')

var showsFolder = properties['torrent-dest-folder'].replace(/~/g, process.env.HOME)

module.exports = function(torrentRepository) {

  function onTorrentComplete(hash, srcDir, srcName) {
    if (torrentRepository.has(hash)) {
      log("Torrent '" + srcName + "' completed")
      var episode = torrentRepository.get(hash)

      function findVideos(file) {
        if (!isVideo(file)) {
          return Promise.denodeify(fs.readdir)(file)
            .then(filter(isVideo))
            .then(function(videos) {
              return videos.map(function (video) {
                return path.join(file, video)
              })
            })
            //.then(map(fn.partial(path.join, file)))
        }
        return Promise.resolve([path.join(srcDir, file)])
      }

      function prepareSrcPath() {
        return findVideos(path.join(srcDir, srcName))
          .then(function(videos) {
            if (!videos || videos.length < 1)
              throw new Error("No video found in torrent '"+srcName+"'")
            if (videos.length > 1) {
              log("Too many video files in torrent '"+srcName+"'.\n" +
                "  Taking the first one '"+videos[0]+"'")
            }
            return videos[0]
          })
      }

      function prepareDestFolder() {
        var showFolder = path.join(showsFolder, episode.show.name.replace(/'/g, ""))
        var seasonFolder = path.join(showFolder, "Season " + episode.season_number)

        if (!fs.existsSync(seasonFolder)) {
          log("Creating directory '"+seasonFolder+"'")
          return Promise.denodeify(fs.mkdirp)(seasonFolder)
            .then(function () {
              return Promise.resolve(seasonFolder)
            })
        }
        return seasonFolder
      }

      Promise.all([prepareSrcPath(), prepareDestFolder()])
        .then(function(res) {
          var srcPath = res[0], destFolder = res[1]
          var destFile = episode.fileBaseName + path.extname(srcPath)
          var destPath = path.join(destFolder, destFile)

          episode.file = destPath
          log("Moving '"+srcPath+"' to '"+destPath+"'")
          return Promise.denodeify(fs.link)(srcPath, destPath)
        })
        .catch(console.error)
    }
  }

  /*
   * Listen for HTTP request signaling torrent completion
   */
  var PORT = 9092
  http.createServer(function (req, res) {
      var data = ""
      req.on('data', function (chunk) {
        data += chunk.toString()
      })
      req.on('end',function () {
        var parse = data.split("::")
        if (parse.length == 3) {
          onTorrentComplete(parse[0].toUpperCase(), parse[1], parse[2])
        }
        res.end()
      })
    }).listen(PORT)
}
