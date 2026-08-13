#!/bin/bash
set -e
BASE=/var/www/aplus/aplus-center-scheduling/smart-steps

mkdir -p "$BASE/src/app/api/programs/[programId]/targets"
mkdir -p "$BASE/src/app/api/targets/[targetId]"
mkdir -p "$BASE/src/app/api/behavior-plan"
mkdir -p "$BASE/src/app/api/behaviors"
mkdir -p "$BASE/src/app/api/insights"
mkdir -p "$BASE/src/app/(main)/clients/[clientId]/programs/new"
mkdir -p "$BASE/src/app/(main)/clients/[clientId]/programs/[programId]"
mkdir -p "$BASE/src/app/(main)/clients/[clientId]/behavior-plan"
mkdir -p "$BASE/src/app/parent/[clientId]"
echo "ALL_DIRS_OK"
