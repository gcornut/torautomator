const moment = require('moment')
const path = require('path')
const config = require('./config')
const fn = require('./fn')
const async = require('./async')
const childProcess = require('child_process')

// Configure transmission
const Transmission = require('transmission')
const transmission = new Transmission({
  host: config.get('transmission-daemon-host'),
  port: config.getNum('transmission-daemon-port')
})

// Configure TPB
process.env.THEPIRATEBAY_DEFAULT_ENDPOINT = config.get('tpb-endpoint')
process.on('unhandledRejection', console.trace)
//process.on('unhandledRejection', ()=>null)
const PirateBay = require('thepiratebay')

// Configure TVShowTime
const tvst = new (require('tvshowtime-api'))(config.get('tvshowtime-api-token'))


// FS
const nodeFs = require('fs')
const fs = {
  stat: fn.denodeify(nodeFs.stat),
  link: fn.denodeify(nodeFs.link),
  readFile: fn.denodeify(nodeFs.readFile),
  writeFile: fn.denodeify(nodeFs.writeFile),
  copyFile: fn.denodeify(nodeFs.copyFile),
  readdir: fn.denodeify(nodeFs.readdir),
  appendFile: fn.denodeify(nodeFs.appendFile),
  mkdirp: fn.denodeify(require('mkdir-parents')),
  truncateFileSync: (filePath, linesNb) => fn.pipe(
    fn.partial(nodeFs.readFileSync, [filePath]),
    fn.toString,
    fn.split('\n'),
    (lines) => fn.drop(lines.length-linesNb, lines),
    fn.join('\n'),
    fn.partial(nodeFs.writeFileSync, [filePath])
  )(),

  async exists(filePath) {
    return new Promise((resolve, reject) => {
      nodeFs.stat(filePath, function(err, res) {
        if (err) resolve(false)
        else resolve(true)
      })
    })
  },

  async * listFiles(filePath) {
    yield filePath
    let stats = await fs.stat(filePath)
    if (stats.isDirectory()) {
      let subPaths = async.map(
        file => path.join(filePath, file),
        await fs.readdir(filePath)
      )
      yield* async.mapcat(fs.listFiles, subPaths)
    }
  }
}

const createFileLog = (filePath) => {
  // Add dash separator
  fs.appendFile(filePath, fn.repeat('-', 50).join('')+'\n')
  // Truncate file to 1000 lines
  fs.truncateFileSync(filePath, 1000)
  return (...args) => {
    fs.appendFile(filePath, args.join(' ')+'\n')
  }
}

function spawn(program, args) {
  let process = childProcess.spawn(program, args)
  //console.debug(program, args)
  let out = ''
  process.stdout.on('data', c => out += c.toString())
  process.stderr.on('data', c => out += c.toString())
  return new Promise((resolve, reject) => {
    process.on('close', code => {
      if (code === 0) resolve(out)
      else reject(out)
    })
  })
}

async function md5Compare(file1, file2) {
  const parseOut = out => out.trim().split(/\s+/)[0].trim()
  let hashing1 = spawn('md5sum', [file1])
  let hashing2 = spawn('md5sum', [file2])
  let hash1 = parseOut(await hashing1)
  let hash2 = parseOut(await hashing2)
  //console.debug(hash1, hash2)
  return hash1 == hash2
}

function existSync(path) {
  try {
    nodeFs.statSync(path)
    return true
  } catch(e) {
    return false
  }
}

function fileCache(file, fun) {
  let absFile = path.resolve(__dirname, file)
  if (!existSync(absFile)) {
    nodeFs.writeFileSync(absFile, '{}', 'utf8')
  }
  const cache = require(absFile)
  return async function (...args) {
    let key = args.toString()
    let value = cache[key]
    if (!value) {
      console.debug("fetch", key)
      value = await fun(...args)
      cache[key] = value
      fs.writeFile(absFile, JSON.stringify(cache), 'utf8')
    }
    return value
  }
}

module.exports = {
  spawn, md5Compare,
  fs,

  Transmission: {
    get: fn.denodeify(transmission.get.bind(transmission)),
    addUrl: fn.denodeify(transmission.addUrl.bind(transmission)),
  },

  PirateBay,

  TVShowTime: {
    getToWatch: () => new Promise((resolve, _) =>
      tvst.getToWatch({page: 0, limit: 100}, resolve)
    ),
    /*
    Use file cache to prevent overloading the API
    getEpisode: fileCache('../tvepisode.json', filename => {
      return new Promise((resolve, reject) => {
        tvst.getEpisode({filename}, (res) => {
          if (res.episode) resolve(res.episode)
          else resolve(null)
        })
      })
    })*/
    getEpisode: filename => {
      return new Promise((resolve, reject) => {
        tvst.getEpisode({filename}, (res) => {
          if (res.episode) resolve(res.episode)
          else resolve(null)
        })
      })
    }
  },

  Logger: {
    createFileLog,

    create: (scriptFile) => {
      let fileLog = createFileLog(scriptFile.replace('src/', 'logs/').replace('.js', '.log'))
      return (...m) => {
        let date = moment().format("DD/MM/YY HH:mm:ss")
        let args = ['[' + date + ']', ...m]
        fn.apply(console.log, args)
        fn.apply(fileLog, args)
      }
    }
  }
}
