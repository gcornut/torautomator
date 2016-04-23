'use strict'

const path = require('path')
const Promise = require('promise')
const fn = require('fn.js')

const p = require('prompt')
p.start()
p.message = p.delimiter = ""

const prompt = Promise.denodeify(p.get)

const No = {}
const yesNoPrompt = (message, def) =>
  prompt({
    description: message,
    pattern: /^[nNyY]$/,
    default: !!def ? 'y': 'n',
    required: true
  }).then(a => {
    if (a.question.toLowerCase() !== 'y') throw No
  })
const catchNo = e => {
  if (e !== No) throw e
}

const fileStat = Promise.denodeify(require('fs').stat)
const fileCheckPermission = file =>
  fileStat(file).then(stats => {
    const mode = require('mode-to-permissions')(stats)
    const isOwner = stats.uid == process.getuid()
    return {
      canRead: isOwner ? mode.read.owner : mode.read.others,
      canWrite: isOwner ? mode.write.owner : mode.write.others
    }
  })

const readJSON = Promise.denodeify(require('jsonfile').readFile)
const writeJSON = Promise.denodeify(require('jsonfile').writeFile)

const transmissionSettings = '/etc/transmission-daemon/settings.json'
const postDownloadScript = __dirname + '/post-download.sh'
const configFile = path.resolve(__dirname + '/../config.json')
const configSampleFile = configFile + '.sample'

const trace = x => {
  console.log(x)
  return x
}
const tracee = x => {
  console.error(x)
  throw x
}

function changeConfigurationFile(override) {
  return () =>
    fileStat(configFile)
      // If configuration file doesn't exists => create a empty JSON object in it
      .catch(() => writeJSON(configFile, {}))
      // Read sample config and actual config
      .then(() => Promise.all([readJSON(configFile), readJSON(configSampleFile)]))
      // Find properties to be updated and ask for them
      .then(([oldConfig, sampleConfig]) => {
        var properties = [], hasNewProp = false
        for (const prop in sampleConfig) {
          let old = oldConfig[prop]
          let sample = sampleConfig[prop]
          if (override || !old) {
            let question = prop
            properties[prop] = {
              description: question,
              type: typeof sample,
              default: old ? old : sample,
              required: true
            }
            hasNewProp = true
          }
        }

        if (hasNewProp) {
          console.log("=> Please fill the following properties: ")
          return Promise.all([oldConfig, prompt({properties})])
        }
      })
      // Write new properties to configuration file
      .then(res => {
        if (res) {
          const [oldConfig, answers] = res
          let newConfiguration = {}
          for (const prop in oldConfig)
            newConfiguration[prop] = oldConfig[prop]
          for (const prop in answers)
            newConfiguration[prop] = answers[prop]
          return writeJSON(configFile, newConfiguration, {spaces: 2})
        }
      })
}
const overrideConfigurationFile = changeConfigurationFile(true)
const updateConfigurationFile = changeConfigurationFile(false)

function updateTransmissionConfiguration() {
  return fileCheckPermission(transmissionSettings)
    .then(permissions => {
      if (!permissions.canRead || !permissions.canWrite) {
        throw new Error(
          "You don't have permission to modify the '" + transmissionSettings + "' file.\n" +
          "You should stop the transmission daemon if it is running and temporaly change the permissions:\n " +
          "$ sudo service transmission-daemon stop\n" +
          "$ sudo chmod o+wr " + transmissionSettings + "")
      }

      // check the post-download.sh script exists
      return fileStat(postDownloadScript)
    })
    .then(() => readJSON(transmissionSettings))
    .then(settings => {
      settings['script-torrent-done-filename'] = postDownloadScript
      settings['script-torrent-done-enabled'] = true

      console.log("Writing modified configuration to '" + transmissionSettings + "'...")
      return writeJSON(transmissionSettings, settings, {spaces: 2})
    })
}

console.log("Checking for '" + configFile + "'...")
fileStat(configFile)
  // Config file exists => ask if the user want to reconfigure
  .then(() => yesNoPrompt('Do you want to reconfigure torrent automator?', false))
  // Config file doesn't exist or the user asks for reconfiguration => override config; else update config
  .then(overrideConfigurationFile, updateConfigurationFile)
  // Ask if the user wants to configure transmission daemon
  .then(() => yesNoPrompt('Do you want to configure transmission daemon?', false))
  .then(updateTransmissionConfiguration, catchNo)
  .catch(console.error)
