#!/bin/bash 

set -euo pipefail

OUTDIR=$PWD/results
mkdir -p $OUTDIR

cd commonjs
./bench.sh $OUTDIR
cd ..