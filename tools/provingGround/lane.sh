#!/bin/sh
# PROVING-GROUND: jobs played on one lane from a cold start - a session booted with the lane's settings, made ready
# (ready.mjs), each job played and its answer kept as <lane>-<job>.summary.json, the session stopped.
#   sh tools/provingGround/lane.sh vanilla baseline-2c shield fight
set -e
cd "$(dirname "$0")/../.."
LANE="${1:-fork}"; shift
JOBS="${*:-baseline-2c}"
rm -rf .proving-ground/cmd
node tools/provingGround/run.mjs session --lane "$LANE" > ".proving-ground/session-$LANE.log" 2>&1 &
until [ -f .proving-ground/cmd/READY ]; do sleep 3; grep -qiE "^Error|TimeoutError" ".proving-ground/session-$LANE.log" && { tail -5 ".proving-ground/session-$LANE.log"; exit 1; }; done
sh tools/provingGround/send.sh .proving-ground/jobs/ready.mjs 600 > /dev/null
for J in $JOBS; do
  sh tools/provingGround/send.sh ".proving-ground/jobs/$J.mjs" 2400 > ".proving-ground/out/$LANE-$J.summary.json" || echo "job $J failed"
done
echo "export default async () => 'bye';" > .proving-ground/cmd/stop.mjs
wait
echo "lane $LANE done"
