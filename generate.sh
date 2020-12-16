#!/bin/sh

if [ ${#} -lt 3 ]; then
    echo "usage: $0 <from> <to> repository..." >&2
    exit 1
fi

from="$1"
to="$2"

shift 2

rm -rf ".data"

mkdir -p ".data"

for repository in "$@"; do
    ./gh-stats.js "${repository}" "${from}" "${to}" \
        >".data/$(echo "${repository}" | tr '/' '_').json"
done

echo "From: ${from}"
echo "To: ${to}"
echo

./md-table.js .data/*
