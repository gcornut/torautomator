const { expect, assert } = require('chai')
const fn = require('../src/fn')

describe('Torrent name', function() {
  search = require('../src/search')

  it('should not match ', function() {
    invalidMatches = [
      ["Silicon Valley", "S04E07", "Silicon.Valley.S04E08"],
    ]
    for (match of invalidMatches) {
      bool = fn.apply(search.torrentNameMatches, match)
      assert.equal(bool, false, 'Torrent "'+match[2]+'" does not matche show "'+match[0]+' '+match[1]+'"')
    }
  })

  it('should match ', function() {
    validMatches = [
      // Classic match
      ["Silicon Valley", "S04E07", "Silicon.Valley.S04E07.the.patent.troll"],
      // Ignore case match
      ["Silicon Valley", "S04E07", "silicon.valley.s04e07.the.patent.troll"],
      // Ignore appostrophes
      ["Marvel's Daredevil", "S01E08", "Marvels Daredevil s01e08"],
      // Ignore parentheses
      ["Doctor Who (2005)", "S10E04", "Doctor.Who.2005.S10E04.HDTV"]
    ]
    for (match of validMatches) {
      bool = fn.apply(search.torrentNameMatches, match)
      assert.equal(bool, true, 'Torrent "'+match[2]+'" matches show "'+match[0]+' '+match[1]+'"')
    }
  })

})
