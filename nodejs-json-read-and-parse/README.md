# Motivation

We would like to understand how much the UV_THREADPOOL_SIZE influences in IO performace in page cached, non page cached situations and how the timings for doing regular file IO and then parsing the JSON content of these files compare (the hypothesis is that even if reading from disk becomes faster, the time taken to process the JSONs will bottleneck the operation).

# Background

## Blocking and non-blocking IO

This section was based on https://www.linuxtoday.com/blog/blocking-and-non-blocking-i-0.html

When we deal with low level programming we usually deal with file descriptors, which is a handle used to interact with a disk file or other IO resources, like sockets, pipes, or fifos. The most basic function prototypes in C for IO on a file descriptor are the following:

```
ssize_t read(int fd, void * data, size_t count);
ssize_t write(int fd, void * data, size_t count);
```

These functions _try_ to read or write the number of bytes requested by `count` from or to the file descriptor `fd`. A important behavior of these functions is this `try` aspect: depending on the underlying resource the file descriptor refers to, the kernel will stop trying to `read` or `write` bytes and will return the operation partially completed or not started at all.

To start analyzing this behavior we have to define fast or slow IO resources. This classification doesn't mean exactly that reading or writing onto the resource is fast or slow, but rather the operation's predictability - according to https://www.linuxtoday.com/blog/blocking-and-non-blocking-i-0.html:

> Files that respond to read and write requests in a predictable amount of time are fast, and those that could take infinitely long to perform an operation are slow. For example, reading a block from a regular data file is predictable (the kernel knows the data is there, it just has to go get it), so regular files are fast. Reading from a pipe is not predictable, though, (if the pipe is empty the kernel has no way of knowing when, if ever, more data will get put into the pipe) so pipes are slow files.

Some file types are:

| File type        | Category |
| ---------------- | -------- |
| Block device     | Fast     |
| Pipe             | Slow     |
| Socket           | Slow     |
| Regular          | Fast     |
| Directory        | Fast     |
| Character device | Varies   |

When we have a fast file the `read` and `write` will **block** until the operation is completed or either an error occurred or, in case of a read, the end of file was reached. This means that the kernel will suspend the thread from which the call was made and will only give control back to this thread when the operation finished or errored.

In the case of a slow file since the operation duration isn't predictable, the read operation will return a result as soon as data is available to read - even if the amount of data available is less than the `count` operation will complete. If there's no data to be read, the operation will block until some data is available. A `write` operation will block until all data is written to kernel internal buffers (if the internal buffer is full `write` will still block until all data is consumed from the buffer and room is made for data to be written).

### The O_NONBLOCK flag

When dealing with **slow files** we can configure the file descriptor with the `O_NONBLOCK` flag, in which case the `read` will return immediately even if there's no data to be read (the operation will fail with the error EAGAIN), and a `write` operation will return the amount of bytes written and, if no data was written, a EGAIN.

This non-blocking behavior is very important for asynchronous IO - operations in which the main thread isn't suspended or blocked by the kernel on IO requests. However note that the O_NONBLOCK flag only applies for **slow files** - reading regular files from the disk will still block the thread on read - check https://www.remlab.net/op/nonblock.shtml for more info.

### The Linux page cache

One question one might ask is - in which situations the kernel suspends the process to complete an IO request on a regular file?

"The Linux Programming Interface" answers this question:

> Disk files are a special case. As described in Chapter 13, the kernel employs the
> buffer cache to speed disk I/O requests. Thus, a write() to a disk returns as
> soon as the requested data has been transferred to the kernel buffer cache,
> rather than waiting until the data is written to disk (unless the O_SYNC flag was
> specified when opening the file). Correspondingly, a read() transfers data from
> the buffer cache to a user buffer, and if the required data is not in the buffer
> cache, then the kernel puts the process to sleep while a disk read is performed.

So, if the data requested isn't in the kernel buffer the thread is put to sleep until the data is transfered from the disk to the kernel buffer. In Linux this kernel buffer is the page cache, which uses unnused memory to cache data from disk files, more info on:

- https://www.thomas-krenn.com/en/wiki/Linux_Page_Cache_Basics
- https://www.linuxatemyram.com/play.html

When a `read` blocks what happens then is a page cache miss - for applications with intensive IO it may be interesting to analyze how often a page cache miss happens and Brendan Gregg created such tool: [cachestat](https://github.com/brendangregg/perf-tools/blob/master/examples/cachestat_example.txt).

### libuv: Achieving non-blocking IO

Achieving non-blocking IO with pipes, sockets, fifos and other slow files is possible with O_NONBLOCK flag and other feature Linux systems provide: epoll (other Unix implementations and Windows provide alternatives for epoll). We won't go into much detail here, but epoll allows the application to register file descriptors to be monitored by the kernel for IO readiness or for when data is available to read on the file descriptor - on servers that may have multiple connection sockets opened this is really important to efficiently detect sockets with data to be read.

We still have the problem for regular files (fast files) though: reading and writing can block the main thread. A solution for this would be to offload the task of reading or writing to or from the file to a different thread, then the main thread won't block, only the auxiliary one.

That's the strategy used by libuv, a C lib that provides cross-platform asynchronous IO. Its anatomy is a main thread with a event loop which, in Linux, uses epoll to monitor slow file descriptors, like sockets (if a CPU intensive operation happens on the main thread, the time taken in the operation will delay the check for file descriptors readiness made by the event loop using epoll, possibly delaying IO operations). For slow files, like regular files, for which IO operations block until completeness, the libuv offloads the task to a thread pool - the libuv thread pool is responsible for doing regular file IO and CPU intensive tasks, like crypto.

Now, a little more details about libuv thread pools - the thread pool is started only when a request is offloaded to it, for example a regular file read. Its size is not dynamic, it's controlled by the UV_THREADPOOL_SIZE environment variable and has default size of 4 and maximum size of 1024.

# Experiment

The experimenting method consisted of 4 scenarios:

1. Concurrently read N copies of the same json without page cache (the cache was dropped just before the batch).
2. Concurrently read N copies of the same json with page cache (a previous read of the batch populated the page cache).
3. Concurrently read and then parse N copies of the same json without page cache.
4. Concurrently read and then parse N copies of the same json with page cache.

The experiments were automatized by [experiment.js](./src/experiment.js) and one can run the experiments by running:

```
cd src
./run-experiment.sh
```

This shell script consists of:

```
#!/bin/bash

jsonSample=../jsonexamples/apache_builds.json
concurrentFiles=100
threadPoolSizes=(1 2 4 8 12);

for i in ${threadPoolSizes[@]}; do
    UV_THREADPOOL_SIZE=$i node experiment.js $jsonSample $concurrentFiles
done
```

The jsonSample can be changed, as well as the number of concurrent file operations.

# Results

The experiment was run in a machine with the following specs:

```
OS: Linux 5.4 Ubuntu 20.04.1 LTS (Focal Fossa)
CPU: (8) x64 Intel(R) Core(TM) i7-8565U CPU @ 1.80GHz
Memory: 7.50 GB
Disk: SSD
```

The data collected and results are available in:

https://docs.google.com/spreadsheets/d/1NOiG6kGMlp0zcDkM_la8bgPdem79lzQLVG0HhcBz1sQ/edit?usp=sharing

Some considerations about them:

- When files are in the page cache the differences in latency by varying UV_THREADPOOL_SIZE on the percentiles 99,90,80,70 and 50 are negligible - this happened in both "read" and "read and parse" workloads.
- When no page cache is used data had way more variance - some samples apparently had benefit of having more than 4 threads, but in general the variance of the data wouldn't let us claim that more threads would benefit IO.
- The data collected didn't show obvious signals backing up the initial hypothesis that even if reading from disk becomes faster, the time taken to process the JSONs will bottleneck the operation.


