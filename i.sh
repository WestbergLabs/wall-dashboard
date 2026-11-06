#!/bin/sh
# Short test: runs the iCloud album probe on the throwaway test album. Delete this file after testing.
python3 "$(dirname "$0")/scripts/icloud-probe.py" "https://photos.icloud.com/shared/album/0d5AnLy1PPlL1TgX3FzTTD5sg"
