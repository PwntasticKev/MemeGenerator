#!/bin/bash
# run-fetch-audio.sh — wrapper invoked by launchd to top up the CC0 audio library.
# Freesound is free (downloads MP3 previews only) — this never incurs a charge.

set -euo pipefail

NODE="/Users/kevinlee/.nvm/versions/node/v22.12.0/bin/node"
PROJECT="/Users/kevinlee/Documents/code/MemeGenerator"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$PROJECT"

# Top up with up to 40 new CC0 tracks; the script skips anything already present.
exec "$NODE" scripts/fetchAudio.js --count=40
