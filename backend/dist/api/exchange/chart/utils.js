"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseChartDataPointSchema = void 0;
exports.getCachedOHLCV = getCachedOHLCV;
exports.saveOHLCVToCache = saveOHLCVToCache;
exports.intervalToMilliseconds = intervalToMilliseconds;
exports.findGapsInCachedData = findGapsInCachedData;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const redis_1 = require("@b/utils/redis");
const schema_1 = require("@b/utils/schema");
const redis = redis_1.RedisSingleton.getInstance();
const cacheDirPath = path_1.default.resolve(process.cwd(), "data", "chart");
if (!fs_1.default.existsSync(cacheDirPath)) {
    fs_1.default.mkdirSync(cacheDirPath, { recursive: true });
}
exports.baseChartDataPointSchema = {
    timestamp: (0, schema_1.baseNumberSchema)("Timestamp for the data point"),
    open: (0, schema_1.baseNumberSchema)("Opening price for the data interval"),
    high: (0, schema_1.baseNumberSchema)("Highest price during the data interval"),
    low: (0, schema_1.baseNumberSchema)("Lowest price during the data interval"),
    close: (0, schema_1.baseNumberSchema)("Closing price for the data interval"),
    volume: (0, schema_1.baseNumberSchema)("Volume of trades during the data interval"),
};
function getCacheKey(symbol, interval) {
    return `ohlcv:${symbol}:${interval}`;
}
function compress(data) {
    return zlib_1.default.gzipSync(JSON.stringify(data));
}
function decompress(data) {
    return JSON.parse(zlib_1.default.gunzipSync(data).toString());
}
function getCacheFilePath(symbol, interval) {
    const symbolDirPath = path_1.default.join(cacheDirPath, symbol);
    if (!fs_1.default.existsSync(symbolDirPath)) {
        fs_1.default.mkdirSync(symbolDirPath, { recursive: true });
    }
    return path_1.default.join(symbolDirPath, `${interval}.json.gz`);
}
async function loadCacheFromFile(symbol, interval) {
    const cacheFilePath = getCacheFilePath(symbol, interval);
    if (fs_1.default.existsSync(cacheFilePath)) {
        const compressedData = await fs_1.default.promises.readFile(cacheFilePath);
        return decompress(compressedData);
    }
    return [];
}
async function saveCacheToFile(symbol, interval, data) {
    const cacheFilePath = getCacheFilePath(symbol, interval);
    const compressedData = compress(data);
    await fs_1.default.promises.writeFile(cacheFilePath, compressedData);
}
async function getCachedOHLCV(symbol, interval, from, to) {
    const cacheKey = getCacheKey(symbol, interval);
    let cachedData = await redis.get(cacheKey);
    if (!cachedData) {
        const dataFromFile = await loadCacheFromFile(symbol, interval);
        if (dataFromFile.length > 0) {
            await redis.set(cacheKey, JSON.stringify(dataFromFile));
            cachedData = JSON.stringify(dataFromFile);
        }
        else {
            return [];
        }
    }
    const intervalCache = JSON.parse(cachedData);
    const startIndex = binarySearch(intervalCache, from);
    const endIndex = binarySearch(intervalCache, to, true);
    return intervalCache.slice(startIndex, endIndex + 1);
}
function binarySearch(arr, target, findEnd = false) {
    let left = 0;
    let right = arr.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (arr[mid][0] === target) {
            return mid;
        }
        if (arr[mid][0] < target) {
            left = mid + 1;
        }
        else {
            right = mid - 1;
        }
    }
    return findEnd ? right : left;
}
async function saveOHLCVToCache(symbol, interval, data) {
    const cacheKey = getCacheKey(symbol, interval);
    let intervalCache = [];
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        intervalCache = JSON.parse(cachedData);
    }
    const updatedCache = mergeAndSortData(intervalCache, data);
    await redis.set(cacheKey, JSON.stringify(updatedCache));
    await saveCacheToFile(symbol, interval, updatedCache);
}
function mergeAndSortData(existingData, newData) {
    const merged = [...existingData, ...newData];
    merged.sort((a, b) => a[0] - b[0]);
    return merged.filter((item, index, self) => index === 0 || item[0] !== self[index - 1][0]);
}
function intervalToMilliseconds(interval) {
    const intervalMap = {
        "1m": 60 * 1000,
        "2m": 2 * 60 * 1000,
        "3m": 3 * 60 * 1000,
        "5m": 5 * 60 * 1000,
        "15m": 15 * 60 * 1000,
        "30m": 30 * 60 * 1000,
        "1h": 60 * 60 * 1000,
        "2h": 2 * 60 * 60 * 1000,
        "4h": 4 * 60 * 60 * 1000,
        "6h": 6 * 60 * 60 * 1000,
        "8h": 8 * 60 * 60 * 1000,
        "12h": 12 * 60 * 60 * 1000,
        "1d": 24 * 60 * 60 * 1000,
        "3d": 3 * 24 * 60 * 60 * 1000,
        "1w": 7 * 24 * 60 * 60 * 1000,
        "1M": 30 * 24 * 60 * 60 * 1000,
    };
    return intervalMap[interval] || 0;
}
function findGapsInCachedData(cachedData, from, to, interval) {
    const gaps = [];
    let currentStart = from;
    const currentTimestamp = Date.now();
    const intervalMs = intervalToMilliseconds(interval);
    for (const bar of cachedData) {
        if (bar[0] > currentStart) {
            gaps.push({ gapStart: currentStart, gapEnd: bar[0] });
        }
        currentStart = bar[0] + intervalMs;
    }
    const adjustedTo = to > currentTimestamp - intervalMs ? currentTimestamp - intervalMs : to;
    if (currentStart < adjustedTo) {
        gaps.push({ gapStart: currentStart, gapEnd: adjustedTo });
    }
    return gaps;
}
