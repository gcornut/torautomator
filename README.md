
# Torrent Automator

## Requirements

- Transmission daemon (running as primary user)
- TVShowTime account
- TVShowTime API token (get it at http://tvsapi.lunik.xyz)

## Installation

    # fetch dependencies and run configuration script
    $ npm install

# TODO

- [ ] Check episiode exists in tv show folder before checking transmission
- [ ] Schedule torrent search according to the air date of episodes (whith margin)
- [ ] Download subtitles if they aren't already present in torrent folder
- [ ] Post-complete actions (like Kodi media library indexing)  
