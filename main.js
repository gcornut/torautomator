#!/usr/bin/env node --harmony_rest_parameters --harmony_destructuring
//--harmony --harmony_modules  --harmony_default_parameters

var HashMap = require('hashmap')
var torrentRepository = new HashMap()

require('./src/torrentLauncher')(torrentRepository)
require('./src/torrentCompleteHandler')(torrentRepository)
