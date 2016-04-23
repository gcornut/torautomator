#!/bin/bash
#
# Script that should be launched by transmission on torrent completion
#

SCRIPT_DIR="$( cd "$( dirname "$0" )" && pwd )"
CONFIG_FILE=$(realpath $SCRIPT_DIR/../config.json)

[ -f "$CONFIG_FILE" ] || {
  echo "Error: could not find torrent-automator config file" >&2
  exit 1
}

CONF=$(cat $CONFIG_FILE)
HOST=$(echo $CONF | perl -pe 's|.*torrent-automator-http-host":\s+"(.*?)".*|$1|g')
PORT=$(echo $CONF | perl -pe 's|.*torrent-automator-http-port":\s+(\d+).*|$1|g')

[ -z "$HOST" ] && {
  echo "Error: could not parse config file to find 'torrent-automator-http-host'" >&2
  exit 1
}
[ -z "$PORT" ] && {
  echo "Error: could not parse config file to find 'torrent-automator-http-port'" >&2
  exit 1
}

# Signal the torrent completion to the node process
curl $HOST:$PORT --data-binary "$TR_TORRENT_HASH::$TR_TORRENT_DIR::$TR_TORRENT_NAME"
