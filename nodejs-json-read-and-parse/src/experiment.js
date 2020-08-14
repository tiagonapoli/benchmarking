const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const hdr = require("hdr-histogram-js");
const util = require("util");
const sleep = util.promisify(setTimeout);

const dropCache = () => {
  cp.execFileSync(`sudo`, [path.join(__dirname, 'aux-scripts', "dropCache.sh")]);
};

const prepareFiles = (baseFile, numberOfFiles) => {
  cp.execFileSync(
    path.join(__dirname, 'aux-scripts', "prepareFiles.sh"),
    [baseFile, numberOfFiles],
    { cwd: __dirname }
  );
};

const getSampleFileDir = (fileNo) => {
  return path.join(__dirname, "tmp", `${fileNo}.json`);
};

const hrtimeToMs = (hrtime) => {
  return hrtime[0] * 1e3 + hrtime[1] / 1e6;
};

const genPathsArray = (numberOfFiles) => {
  return Array.from(Array(numberOfFiles).keys()).map((fileNo) =>
    getSampleFileDir(fileNo)
  );
};

const readWithPageCache = async (pathsArray) => {
  const totalTime = process.hrtime();
  await Promise.all(
    pathsArray.map(async (p) => {
      const buffer = await fs.promises.readFile(p);
    })
  );

  return hrtimeToMs(process.hrtime(totalTime));
};

const readNoPageCache = async (pathsArray) => {
  dropCache();
  return readWithPageCache(pathsArray);
};

const readAndParseWithPageCache = async (pathsArray) => {
  const totalTime = process.hrtime();
  await Promise.all(
    pathsArray.map(async (p) => {
      const buffer = await fs.promises.readFile(p);
      JSON.parse(buffer.toString("utf-8"));
    })
  );

  return hrtimeToMs(process.hrtime(totalTime));
};

const readAndParseNoPageCache = async (pathsArray) => {
  dropCache();
  return readAndParseWithPageCache(pathsArray);
};

const benchReadNoPageCache = async (pathsArray, iterations) => {
  const times = [];
  console.log("==== READ WITH NO PAGE CACHE ====");
  for (let i = 0; i < iterations; i += 1) {
    times.push(await readNoPageCache(pathsArray));
  }

  console.log(times);
  return times;
};

const benchReadWithPageCache = async (pathsArray, iterations) => {
  const times = [];
  console.log("==== READ WITH PAGE CACHE ====");

  console.log("Warm up cache");
  await readWithPageCache(pathsArray);

  console.log("Start tests");
  for (let i = 0; i < iterations; i += 1) {
    times.push(await readWithPageCache(pathsArray));
  }

  console.log(times);
  return times;
};

const benchReadAndParseWithNoPageCache = async (pathsArray, iterations) => {
  const times = [];
  console.log("==== READ AND PARSE WITH NO PAGE CACHE ====");
  for (let i = 0; i < iterations; i += 1) {
    times.push(await readAndParseNoPageCache(pathsArray));
  }

  console.log(times);
  return times;
};

const benchReadAndParseWithPageCache = async (pathsArray, iterations) => {
  const times = [];
  console.log("==== READ AND PARSE WITH PAGE CACHE ====");

  console.log("Warm up cache");
  await readWithPageCache(pathsArray);

  console.log("Start tests");
  for (let i = 0; i < iterations; i += 1) {
    times.push(await readAndParseWithPageCache(pathsArray));
  }

  console.log(times);
  return times;
};

const writeResultsDataFile = (jsonSamplePath, isParseAndRead, noPageCache, times) => {
  const dir = path.join(__dirname, "tmp-results");
  try {
    fs.mkdirSync(path.join(__dirname, "tmp-results"));
  } catch (err) {}

  const filename = `${path.basename(jsonSamplePath)}-${process.env["UV_THREADPOOL_SIZE"]}-${
    isParseAndRead ? "parse-and-read" : "read"
  }${noPageCache ? "-no-page-cache" : ""}`;

  fs.writeFileSync(path.join(dir, filename), times.reduce((acc, el) => `${acc}\n${el}`));
};

const main = async () => {
  const jsonSamplePath = process.argv[2];
  const numberOfReads = parseInt(process.argv[3]);
  const iterations = 50;
  const pathsArray = genPathsArray(numberOfReads);

  console.log("PID: ", process.pid);
  prepareFiles(jsonSamplePath, numberOfReads);

  writeResultsDataFile(jsonSamplePath, false, true, await benchReadNoPageCache(pathsArray, iterations));
  
  writeResultsDataFile(jsonSamplePath, false, false, await benchReadWithPageCache(
    pathsArray,
    iterations
  ))

  writeResultsDataFile(jsonSamplePath, true, true, await benchReadAndParseWithNoPageCache(
    pathsArray,
    iterations
  ))

  writeResultsDataFile(jsonSamplePath, true, false, await benchReadAndParseWithPageCache(
    pathsArray,
    iterations
  ))
};

if (process.argv.length < 4) {
  console.log(
    "Usage: sudo UV_THREADPOOL_SIZE=Number node experiment.js JSON_SAMPLE_PATH NUMBER_OF_READS"
  );
  process.exit();
}

main();
