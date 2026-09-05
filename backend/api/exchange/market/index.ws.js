"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderbookHandler = exports.TradesHandler = exports.OHLCVHandler = exports.TickerHandler = exports.metadata = void 0;
var exchange_1 = require("@b/utils/exchange");
var Websocket_1 = require("@b/handler/Websocket");
var logger_1 = require("@b/utils/logger");
var utils_1 = require("../utils");
exports.metadata = {};
var BaseMarketDataHandler = /** @class */ (function () {
    function BaseMarketDataHandler() {
        this.accumulatedBuffer = {};
        this.bufferInterval = null;
        this.unblockTime = 0;
        this.activeSubscriptions = new Set();
        this.exchange = null;
        this.symbolToStreamKey = {};
    }
    BaseMarketDataHandler.prototype.flushBuffer = function (type) {
        var _this = this;
        Object.entries(this.accumulatedBuffer).forEach(function (_a) {
            var streamKey = _a[0], data = _a[1];
            if (Object.keys(data).length > 0) {
                var route = "/api/exchange/market";
                var payload = __assign(__assign({}, data.payload), { symbol: data.symbol });
                (0, Websocket_1.sendMessageToRoute)(route, payload, {
                    stream: streamKey, // Do not include the symbol in the stream key for frontend
                    data: data.msg,
                });
                delete _this.accumulatedBuffer[streamKey];
            }
        });
    };
    BaseMarketDataHandler.prototype.fetchDataWithRetries = function (fetchFunction) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (Date.now() < this.unblockTime) {
                            throw new Error("Blocked until ".concat(new Date(this.unblockTime).toLocaleString()));
                        }
                        return [4 /*yield*/, fetchFunction()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    BaseMarketDataHandler.prototype.handleSubscription = function (symbol, type, interval, limit) {
        return __awaiter(this, void 0, void 0, function () {
            var frontendStreamKey, internalStreamKey, fetchData, _a, msg, payload, error_1, result;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        frontendStreamKey = "".concat(type).concat(interval ? ":".concat(interval) : "").concat(limit ? ":".concat(limit) : "");
                        internalStreamKey = "".concat(symbol, ":").concat(frontendStreamKey);
                        this.symbolToStreamKey[frontendStreamKey] = symbol;
                        fetchData = {
                            ticker: function () { return __awaiter(_this, void 0, void 0, function () {
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            _a = {};
                                            return [4 /*yield*/, this.exchange.watchTicker(symbol)];
                                        case 1: return [2 /*return*/, (_a.msg = _b.sent(),
                                                _a.payload = { type: type },
                                                _a)];
                                    }
                                });
                            }); },
                            ohlcv: function () { return __awaiter(_this, void 0, void 0, function () {
                                var watchInterval, rawCandles, msg;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            watchInterval = interval;
                                            if (interval === "2m" && (!this.exchange.timeframes || !this.exchange.timeframes["2m"])) {
                                                watchInterval = "1m";
                                            }
                                            return [4 /*yield*/, this.exchange.watchOHLCV(symbol, watchInterval, undefined, Number(limit) || 1000)];
                                        case 1:
                                            rawCandles = _a.sent();
                                            msg = (interval === "2m" && watchInterval === "1m")
                                                ? aggregate1mTo2m(rawCandles)
                                                : rawCandles;
                                            return [2 /*return*/, {
                                                    msg: msg,
                                                    payload: { type: type, interval: interval, limit: limit },
                                                }];
                                    }
                                });
                            }); },
                            trades: function () { return __awaiter(_this, void 0, void 0, function () {
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            _a = {};
                                            return [4 /*yield*/, this.exchange.watchTrades(symbol, undefined, limit ? Number(limit) : 20)];
                                        case 1: return [2 /*return*/, (_a.msg = _b.sent(),
                                                _a.payload = { type: type, limit: limit },
                                                _a)];
                                    }
                                });
                            }); },
                            orderbook: function () { return __awaiter(_this, void 0, void 0, function () {
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            _a = {};
                                            return [4 /*yield*/, this.exchange.watchOrderBook(symbol, limit ? Number(limit) : 100)];
                                        case 1: return [2 /*return*/, (_a.msg = _b.sent(),
                                                _a.payload = { type: type, limit: limit },
                                                _a)];
                                    }
                                });
                            }); },
                        };
                        _b.label = 1;
                    case 1:
                        if (!(this.activeSubscriptions.has(internalStreamKey) &&
                            (0, Websocket_1.hasClients)("/api/exchange/market"))) return [3 /*break*/, 14];
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 7, , 13]);
                        if (!(Date.now() < this.unblockTime)) return [3 /*break*/, 4];
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 1];
                    case 4: return [4 /*yield*/, this.fetchDataWithRetries(function () {
                            return fetchData[type]();
                        })];
                    case 5:
                        _a = _b.sent(), msg = _a.msg, payload = _a.payload;
                        this.accumulatedBuffer[frontendStreamKey] = { symbol: symbol, msg: msg, payload: payload };
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 250); })];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 7:
                        error_1 = _b.sent();
                        (0, logger_1.logError)("exchange", error_1, __filename);
                        return [4 /*yield*/, (0, utils_1.handleExchangeError)(error_1, exchange_1.default)];
                    case 8:
                        result = _b.sent();
                        if (!(typeof result === "number")) return [3 /*break*/, 10];
                        this.unblockTime = result;
                        return [4 /*yield*/, (0, utils_1.saveBanStatus)(this.unblockTime)];
                    case 9:
                        _b.sent();
                        return [3 /*break*/, 11];
                    case 10:
                        this.exchange = result;
                        _b.label = 11;
                    case 11: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                    case 12:
                        _b.sent();
                        return [3 /*break*/, 13];
                    case 13: return [3 /*break*/, 1];
                    case 14:
                        this.activeSubscriptions.delete(internalStreamKey);
                        return [2 /*return*/];
                }
            });
        });
    };
    BaseMarketDataHandler.prototype.start = function (message, flushInterval) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, symbol, type_1, interval, limit, _c, typeMap, internalStreamKey, error_2;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 4, , 5]);
                        _a = this;
                        return [4 /*yield*/, (0, utils_1.loadBanStatus)()];
                    case 1:
                        _a.unblockTime = _d.sent();
                        if (typeof message === "string") {
                            message = JSON.parse(message);
                        }
                        _b = message.payload, symbol = _b.symbol, type_1 = _b.type, interval = _b.interval, limit = _b.limit;
                        if (!this.bufferInterval) {
                            this.bufferInterval = setInterval(function () { return _this.flushBuffer(type_1); }, flushInterval);
                        }
                        if (!!this.exchange) return [3 /*break*/, 3];
                        _c = this;
                        return [4 /*yield*/, exchange_1.default.startExchange()];
                    case 2:
                        _c.exchange = _d.sent();
                        if (!this.exchange) {
                            throw new Error("Failed to start exchange");
                        }
                        _d.label = 3;
                    case 3:
                        typeMap = {
                            ticker: "watchTicker",
                            ohlcv: "watchOHLCV",
                            trades: "watchTrades",
                            orderbook: "watchOrderBook",
                        };
                        if (!this.exchange.has[typeMap[type_1]]) {
                            console.info("Endpoint ".concat(type_1, " is not available"));
                            return [2 /*return*/];
                        }
                        internalStreamKey = "".concat(symbol, ":").concat(type_1).concat(interval ? ":".concat(interval) : "").concat(limit ? ":".concat(limit) : "");
                        if (!this.activeSubscriptions.has(internalStreamKey)) {
                            this.activeSubscriptions.add(internalStreamKey);
                            this.handleSubscription(symbol, type_1, interval, limit);
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _d.sent();
                        (0, logger_1.logError)("exchange", error_2, __filename);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    BaseMarketDataHandler.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.activeSubscriptions.clear();
                        if (this.bufferInterval) {
                            clearInterval(this.bufferInterval);
                            this.bufferInterval = null;
                        }
                        if (!this.exchange) return [3 /*break*/, 2];
                        return [4 /*yield*/, exchange_1.default.stopExchange()];
                    case 1:
                        _a.sent();
                        this.exchange = null;
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    return BaseMarketDataHandler;
}());
var TickerHandler = /** @class */ (function (_super) {
    __extends(TickerHandler, _super);
    function TickerHandler() {
        return _super.call(this) || this;
    }
    TickerHandler.getInstance = function () {
        if (!TickerHandler.instance) {
            TickerHandler.instance = new TickerHandler();
        }
        return TickerHandler.instance;
    };
    return TickerHandler;
}(BaseMarketDataHandler));
exports.TickerHandler = TickerHandler;
var OHLCVHandler = /** @class */ (function (_super) {
    __extends(OHLCVHandler, _super);
    function OHLCVHandler() {
        return _super.call(this) || this;
    }
    OHLCVHandler.getInstance = function () {
        if (!OHLCVHandler.instance) {
            OHLCVHandler.instance = new OHLCVHandler();
        }
        return OHLCVHandler.instance;
    };
    return OHLCVHandler;
}(BaseMarketDataHandler));
exports.OHLCVHandler = OHLCVHandler;
var TradesHandler = /** @class */ (function (_super) {
    __extends(TradesHandler, _super);
    function TradesHandler() {
        return _super.call(this) || this;
    }
    TradesHandler.getInstance = function () {
        if (!TradesHandler.instance) {
            TradesHandler.instance = new TradesHandler();
        }
        return TradesHandler.instance;
    };
    return TradesHandler;
}(BaseMarketDataHandler));
exports.TradesHandler = TradesHandler;
var OrderbookHandler = /** @class */ (function (_super) {
    __extends(OrderbookHandler, _super);
    function OrderbookHandler() {
        return _super.call(this) || this;
    }
    OrderbookHandler.getInstance = function () {
        if (!OrderbookHandler.instance) {
            OrderbookHandler.instance = new OrderbookHandler();
        }
        return OrderbookHandler.instance;
    };
    return OrderbookHandler;
}(BaseMarketDataHandler));
exports.OrderbookHandler = OrderbookHandler;
exports.default = (function (data, message) { return __awaiter(void 0, void 0, void 0, function () {
    var parsedMessage, type, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                if (typeof message === "string") {
                    try {
                        parsedMessage = JSON.parse(message);
                    }
                    catch (error) {
                        (0, logger_1.logError)("Invalid JSON message", error, __filename);
                        return [2 /*return*/];
                    }
                }
                else {
                    parsedMessage = message;
                }
                type = parsedMessage.payload.type;
                _a = type;
                switch (_a) {
                    case "ticker": return [3 /*break*/, 1];
                    case "ohlcv": return [3 /*break*/, 3];
                    case "trades": return [3 /*break*/, 5];
                    case "orderbook": return [3 /*break*/, 7];
                }
                return [3 /*break*/, 9];
            case 1: return [4 /*yield*/, TickerHandler.getInstance().start(parsedMessage, 500)];
            case 2:
                _b.sent();
                return [3 /*break*/, 10];
            case 3: return [4 /*yield*/, OHLCVHandler.getInstance().start(parsedMessage, 400)];
            case 4:
                _b.sent();
                return [3 /*break*/, 10];
            case 5: return [4 /*yield*/, TradesHandler.getInstance().start(parsedMessage, 700)];
            case 6:
                _b.sent();
                return [3 /*break*/, 10];
            case 7: return [4 /*yield*/, OrderbookHandler.getInstance().start(parsedMessage, 600)];
            case 8:
                _b.sent();
                return [3 /*break*/, 10];
            case 9: throw new Error("Unknown type: ".concat(type));
            case 10: return [2 /*return*/];
        }
    });
}); });
function aggregate1mTo2m(candles1m) {
    if (!candles1m || candles1m.length === 0) {
        return [];
    }
    var sorted1m = __spreadArray([], candles1m, true).sort(function (a, b) { return a[0] - b[0]; });
    var aggregatedMap = new Map();
    for (var _i = 0, sorted1m_1 = sorted1m; _i < sorted1m_1.length; _i++) {
        var candle = sorted1m_1[_i];
        var timestamp = candle[0], open_1 = candle[1], high = candle[2], low = candle[3], close_1 = candle[4], volume = candle[5];
        var t2m = Math.floor(timestamp / 120000) * 120000;
        var existing = aggregatedMap.get(t2m);
        if (!existing) {
            aggregatedMap.set(t2m, [t2m, open_1, high, low, close_1, volume]);
        }
        else {
            existing[2] = Math.max(existing[2], high);
            existing[3] = Math.min(existing[3], low);
            existing[4] = close_1;
            existing[5] = (existing[5] || 0) + (volume || 0);
        }
    }
    return Array.from(aggregatedMap.values()).sort(function (a, b) { return a[0] - b[0]; });
}
