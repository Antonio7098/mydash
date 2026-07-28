#!/usr/bin/env sh
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: scripts/refresh-artifact.sh <kind> <artifact-id> [source-id]" >&2
  exit 2
fi

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
workspace_root=$(dirname -- "$script_directory")
kind=$1
artifact_id=$2
source_id=${3-}

cd "$workspace_root"

if [ -n "$source_id" ]; then
  npm run mydash -- data sync "$artifact_id" --kind "$kind" --source "$source_id"
else
  npm run mydash -- data refresh-artifact "$artifact_id" --kind "$kind"
fi

npm run mydash -- data status "$artifact_id" --kind "$kind"
