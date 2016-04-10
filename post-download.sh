#!/bin/bash

#TR_TORRENT_HASH=""
#TR_TORRENT_DIR=""
#TR_TORRENT_NAME=""

# Signal the torrent completion to the node process
URL=localhost:9092
curl $URL --data-binary "$TR_TORRENT_HASH::$TR_TORRENT_DIR::$TR_TORRENT_NAME"
