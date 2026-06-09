#!/bin/bash
# run-daily.sh — wrapper invoked by launchd/cron for the daily meme post.
# Keeps all environment setup in one place so the scheduler stays dumb.

set -euo pipefail

# Absolute paths (launchd has a minimal PATH and no nvm).
NODE="/Users/kevinlee/.nvm/versions/node/v22.12.0/bin/node"
PROJECT="/Users/kevinlee/Documents/code/MemeGenerator"

# ffmpeg lives in homebrew; make sure it's on PATH for the child process.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$PROJECT"

# Pass through any args (e.g. --dry-run) to the runner.
exec "$NODE" scripts/dailyRun.js "$@"
