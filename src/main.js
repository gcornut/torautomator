/*
 * Torrent automator main file
 */
'use strict'

const HashMap = require('hashmap')
const torrentRepository = new HashMap()

require('./torrentLauncher')(torrentRepository)
require('./torrentCompleteHandler')(torrentRepository)
