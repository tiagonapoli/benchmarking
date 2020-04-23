### Benchmarking `@vtex/api` import

Benchmarks created with [hyperfine](https://github.com/sharkdp/hyperfine)

Using commonjs:

| Command | Mean [ms] | Min [ms] | Max [ms] | Relative |
|:---|---:|---:|---:|---:|
| `node simple-require.js` | 705.3 ± 31.2 | 662.0 | 818.0 | 1.69 ± 0.09 |
| `node require-file.js` | 416.7 ± 13.6 | 389.3 | 450.4 | 1.00 |
| `node destructure-require.js` | 696.5 ± 15.1 | 667.9 | 740.5 | 1.67 ± 0.07 |

## System:
 - OS: Linux 5.3 Ubuntu 19.10 (Eoan Ermine)
 - CPU: (8) x64 Intel(R) Core(TM) i7-8565U CPU @ 1.80GHz
 - Memory: 550.09 MB / 7.50 GB
 - Shell: 5.0.3 - /bin/bash
## Binaries:
 - Node: 12.16.2 - ~/.nvm/versions/node/v12.16.2/bin/node
 - Yarn: 1.22.4 - /usr/bin/yarn
 - npm: 6.14.4 - ~/.nvm/versions/node/v12.16.2/bin/npm

