#!/bin/sh
cd "$(dirname "$0")"
echo "Starting static setup server only."
echo "Votes are stored inside each iPad, not on this computer."
node setup-server.js
