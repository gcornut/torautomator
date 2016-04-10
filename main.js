#!/usr/bin/env node

var HashMap = require('hashmap')
var torrentRepository = new HashMap()

require('./src/torrentLauncher')(torrentRepository)
require('./src/torrentCompleteHandler')(torrentRepository)
