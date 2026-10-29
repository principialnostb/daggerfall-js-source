#!/bin/sh
# PROVING-GROUND: hand a job module to the running session and wait for its answer.
#   sh tools/provingGround/send.sh .proving-ground/jobs/setup.mjs [timeout-seconds]
set -e
HOME_DIR="$(dirname "$0")/../../.proving-ground"
NAME="$(basename "$1" .mjs)"
rm -f "$HOME_DIR/cmd/$NAME.result.json"
cp "$1" "$HOME_DIR/cmd/$NAME.mjs"
LIMIT="${2:-600}"; T=0
until [ -f "$HOME_DIR/cmd/$NAME.result.json" ]; do sleep 1; T=$((T+1)); [ "$T" -ge "$LIMIT" ] && { echo "timeout"; exit 1; }; done
cat "$HOME_DIR/cmd/$NAME.result.json"
