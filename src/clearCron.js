#!/usr/bin/env node

const fn = require('./fn')
const loadCron = fn.denodeify(require('crontab').load)

loadCron().then(cron => {
  let comment = "torautomator.launcher"
  cron.remove({comment: new RegExp(comment)})
  cron.save()
})
