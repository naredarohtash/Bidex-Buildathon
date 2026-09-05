"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseWatchlistItemSchema = exports.baseTickerSchema = exports.baseOrderBookSchema = exports.baseOrderBookEntrySchema = exports.BAN_STATUS_KEY = void 0;
exports.saveBanStatus = saveBanStatus;
exports.loadBanStatus = loadBanStatus;
exports.formatWaitTime = formatWaitTime;
exports.handleBanStatus = handleBanStatus;
exports.extractBanTime = extractBanTime;
exports.handleExchangeError = handleExchangeError;
exports.sanitizeErrorMessage = sanitizeErrorMessage;
var schema_1 = require("@b/utils/schema");
var redis_1 = require("@b/utils/redis");
var redis = redis_1.RedisSingleton.getInstance();
exports.BAN_STATUS_KEY = "exchange:ban_status";
function saveBanStatus(unblockTime) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, redis.set(exports.BAN_STATUS_KEY, unblockTime)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function loadBanStatus() {
    return __awaiter(this, void 0, void 0, function () {
        var unblockTime;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, redis.get(exports.BAN_STATUS_KEY)];
                case 1:
                    unblockTime = _a.sent();
                    return [2 /*return*/, unblockTime ? parseInt(unblockTime) : 0];
            }
        });
    });
}
function formatWaitTime(ms) {
    var minutes = Math.floor(ms / 60000);
    var seconds = ((ms % 60000) / 1000).toFixed(0);
    return "".concat(minutes, " minutes and ").concat(seconds, " seconds");
}
function handleBanStatus(unblockTime) {
    return __awaiter(this, void 0, void 0, function () {
        var waitTime_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(Date.now() < unblockTime)) return [3 /*break*/, 2];
                    waitTime_1 = unblockTime - Date.now();
                    console.log("Waiting for ".concat(formatWaitTime(waitTime_1), " until unblock time"));
                    return [4 /*yield*/, new Promise(function (resolve) {
                            return setTimeout(resolve, Math.min(waitTime_1, 60000));
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, true];
                case 2: return [2 /*return*/, false];
            }
        });
    });
}
function extractBanTime(errorMessage) {
    if (errorMessage.includes("IP banned until")) {
        var match = errorMessage.match(/until (\d+)/);
        if (match) {
            return parseInt(match[1]);
        }
    }
    return null;
}
function handleExchangeError(error, ExchangeManager) {
    return __awaiter(this, void 0, void 0, function () {
        var banTime;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    banTime = extractBanTime(error.message);
                    if (!banTime) return [3 /*break*/, 2];
                    return [4 /*yield*/, saveBanStatus(banTime)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, banTime];
                case 2: return [4 /*yield*/, ExchangeManager.stopExchange()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, ExchangeManager.startExchange()];
                case 5: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function sanitizeErrorMessage(errorMessage) {
    // Handle undefined or null inputs explicitly
    if (errorMessage == null) {
        // Customize this message as needed
        return "An unknown error occurred";
    }
    // Convert Error objects to their message string
    if (errorMessage instanceof Error) {
        errorMessage = errorMessage.message;
    }
    // Proceed with sanitization only if errorMessage is a string
    if (typeof errorMessage === "string") {
        var keywordsToHide = ["kucoin", "binance", "okx"];
        var sanitizedMessage_1 = errorMessage;
        keywordsToHide.forEach(function (keyword) {
            var regex = new RegExp(keyword, "gi"); // 'gi' for global and case-insensitive match
            sanitizedMessage_1 = sanitizedMessage_1.replace(regex, "***");
        });
        return sanitizedMessage_1;
    }
    // Return the input unchanged if it's not a string, as we only sanitize strings
    return errorMessage;
}
exports.baseOrderBookEntrySchema = {
    type: "array",
    items: {
        type: "number",
        description: "Order book entry consisting of price and volume",
    },
};
exports.baseOrderBookSchema = {
    asks: {
        type: "array",
        items: exports.baseOrderBookEntrySchema,
        description: "Asks are sell orders in the order book",
    },
    bids: {
        type: "array",
        items: exports.baseOrderBookEntrySchema,
        description: "Bids are buy orders in the order book",
    },
};
exports.baseTickerSchema = {
    symbol: (0, schema_1.baseStringSchema)("Trading symbol for the market pair"),
    bid: (0, schema_1.baseNumberSchema)("Current highest bid price"),
    ask: (0, schema_1.baseNumberSchema)("Current lowest ask price"),
    close: (0, schema_1.baseNumberSchema)("Last close price"),
    last: (0, schema_1.baseNumberSchema)("Most recent transaction price"),
    change: (0, schema_1.baseNumberSchema)("Price change percentage"),
    baseVolume: (0, schema_1.baseNumberSchema)("Volume of base currency traded"),
    quoteVolume: (0, schema_1.baseNumberSchema)("Volume of quote currency traded"),
};
exports.baseWatchlistItemSchema = {
    id: (0, schema_1.baseStringSchema)("Unique identifier for the watchlist item", undefined, undefined, false, undefined, "uuid"),
    userId: (0, schema_1.baseStringSchema)("User ID associated with the watchlist item", undefined, undefined, false, undefined, "uuid"),
    symbol: (0, schema_1.baseStringSchema)("Symbol of the watchlist item"),
};
