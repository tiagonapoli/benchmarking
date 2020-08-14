### Node.js UV_THREADPOOL_SIZE on JSON reads and parses

See the [experiment directory](./nodejs-json-read-and-parse)

The [README](./nodejs-json-read-and-parse/README.md) Gives a little background on how asynchronous IO is achieved by libuv when dealing with regular disk files and show the results on the benchmarks of JSON files reading and parsing varying libuv's UV_THREADPOOL_SIZE and reseting or not linux' page cache.
