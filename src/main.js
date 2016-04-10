var HashMap = require('hashmap')
var torrentRepository = new HashMap()

require('./torrentLauncher')(torrentRepository)
require('./torrentCompleteHandler')(torrentRepository)
