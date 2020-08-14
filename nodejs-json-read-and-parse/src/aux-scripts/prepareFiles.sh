#! /bin/bash
set -euo pipefail
rm -rf tmp
mkdir tmp

lastIndex=$(($2 - 1))
for i in $(seq 0 $lastIndex); do
    cp $1 "./tmp/$i.json"
done;
