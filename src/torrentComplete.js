#!/usr/bin/env node
'use strict'

// Utils
const isVideo = require('is-video')
const fn = require('./fn')
const async = require('./async')

// PATH
const path = require('path')
const pbaseName = fn.curry(path.basename)

// Configs
const config = require('./config')
const SHOWS_FOLDER = config.getPath('torrent-dest-folder')

const io = require('./io')
const log = io.Logger.create(__filename)

const sanitizeFileName = require('sanitize-filename')
function sanitize(input) {
  return sanitizeFileName(input.trim()).replace(/('|:)/g, '')
}

async function getEpisodeDestPath({episode, srcPath}) {
  const showFolder = path.join(SHOWS_FOLDER, sanitize(episode.show.name))
  const seasonFolder = path.join(showFolder, `Season ${episode.season_number}`)
  if (! await io.fs.exists(seasonFolder)) {
    log("Creating directory '" + seasonFolder + "'")
    await io.fs.mkdirp(seasonFolder)
  }

  let showName = sanitize(episode.show.name).replace(' ', '.')
  let season = fn.zeroPad(episode.season_number)
  let episodeNumber = fn.zeroPad(episode.number)
  let episodeName = sanitize(episode.name).replace(' ', '.')

  let fileExt = path.extname(srcPath)
  let fileName = `${showName}.S${season}E${episodeNumber}.${episodeName}`
  return path.join(seasonFolder, fileName + fileExt)
}

function getSubTitlePath(videoFile) {
  return videoFile.replace(/\.\w+$/, ".srt")
}

async function main() {
  let paths
  if (process.env.TR_TORRENT_DIR && process.env.TR_TORRENT_NAME) {
    paths = [path.join(process.env.TR_TORRENT_DIR, process.env.TR_TORRENT_NAME)]
  } else {
    paths = process.argv.splice(2)
  }

  let processing = fn.pipe(
    async.trace('Torrent completed:'),
    // List all files in path (recursively)
    async.mapcat(io.fs.listFiles),
    // Select video files
    async.filter(isVideo),

    // Search episode corresponding to video file name
    async.map(async srcPath => {
      return {srcPath,
              episode: await io.TVShowTime.getEpisode(path.basename(srcPath))}
    }),

    // Filter out videos that are not episodes
    async.filter(e => e.episode),

    // Get destination path for videos
    async.map(async e => {
      return {...e, destPath: await getEpisodeDestPath(e)}
    }),

    async.partition(5),
    async.map(async batch => await async.consume(batch)),
    // Filter out videos already existing with the same hash
    async.mapcat(async.filterEager(async ({srcPath, destPath}) => {
      return !await io.fs.exists(destPath) ||
             !await io.md5Compare(srcPath, destPath)
    })),

    async.partition(3),
    async.map(async batch => await async.consume(batch)),
    // Copy video to destination (with sub titles if needed)
    async.mapcat(
      async.mapEager(async e => {
        let {srcPath, destPath} = e
        log(`Moving '${srcPath}' to '${destPath}'`)
        let copyingVideo = io.fs.copyFile(srcPath, destPath)

        let srcSRT = getSubTitlePath(srcPath)
        if (await io.fs.exists(srcSRT)) {
          let destSRT = getSubTitlePath(destPath)
          log(`Moving '${srcSRT}' to '${destSRT}'`)
          await io.fs.copyFile(srcSRT, destSRT)
        }

        await copyingVideo
        return e
      })
    )
  )
  console.log("ok", await consume(processing(paths)))
}
main().catch(console.trace).then(console.log)
