#!/bin/bash

jsonSample=../jsonexamples/apache_builds.json
concurrentFiles=100
threadPoolSizes=(1 2 4 8 12);

for i in ${threadPoolSizes[@]}; do
    UV_THREADPOOL_SIZE=$i node experiment.js $jsonSample $concurrentFiles
done