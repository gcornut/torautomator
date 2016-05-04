
# Torrent Automator

## Requirements

- Transmission daemon
- PM2 daemon
- TVShowTime account
- TVShowTime API token (get it at http://tvsapi.lunik.xyz)

## Installation

    # fetch dependencies and run configuration script
    $ npm install

## Run with PM2

    $ pm2 start pm2.yml

# TODO

- [ ] Schedule torrent search according to the air date of episodes
- [ ] Download subtitles if they aren't already present in torrent folder
- [ ] Post-complete actions (like Kodi media library indexing)  
