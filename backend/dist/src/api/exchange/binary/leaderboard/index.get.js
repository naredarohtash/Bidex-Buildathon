"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const query_1 = require("@b/utils/query");
const error_1 = require("@b/utils/error");
const synthetic_1 = require("./synthetic");
exports.metadata = {
    summary: "Get Binary Trading Leaderboard",
    operationId: "getBinaryLeaderboard",
    tags: ["Exchange", "Binary", "Leaderboard"],
    description: "Retrieves the top traders leaderboard for binary options trading. Supports different time periods and ranking metrics.",
    parameters: [
        {
            name: "period",
            in: "query",
            description: "Time period for the leaderboard: daily, weekly, monthly, alltime",
            schema: { type: "string", enum: ["daily", "weekly", "monthly", "alltime"] },
        },
        {
            name: "metric",
            in: "query",
            description: "Ranking metric: profit (total profit), winRate (win percentage), volume (trade count)",
            schema: { type: "string", enum: ["profit", "winRate", "volume"] },
        },
        {
            name: "limit",
            in: "query",
            description: "Maximum number of traders to return (default 100, max 100)",
            schema: { type: "number" },
        },
    ],
    responses: {
        200: {
            description: "Leaderboard data with top traders",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            period: { type: "string" },
                            metric: { type: "string" },
                            updatedAt: { type: "string" },
                            traders: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        rank: { type: "number" },
                                        username: { type: "string" },
                                        country: { type: "string", description: "ISO 3166-1 alpha-2, for the flag" },
                                        avatar: { type: "string" },
                                        avatarSeed: { type: "string" },
                                        totalProfit: { type: "number" },
                                        winRate: { type: "number" },
                                        totalTrades: { type: "number" },
                                        wins: { type: "number" },
                                        losses: { type: "number" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        404: (0, query_1.notFoundMetadataResponse)("Leaderboard"),
        500: query_1.serverErrorResponse,
    },
    requiresAuth: false,
};
function getOrderByMetric(metric) {
    switch (metric) {
        case "winRate":
            return [[(0, sequelize_1.literal)("CASE WHEN COUNT(id) > 0 THEN SUM(CASE WHEN status = 'WIN' THEN 1 ELSE 0 END) * 100.0 / COUNT(id) ELSE 0 END"), "DESC"]];
        case "volume":
            return [[(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "DESC"]];
        default:
            return [[(0, sequelize_1.literal)("SUM(CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END)"), "DESC"]];
    }
}
function countryOf(u) {
    var _a, _b;
    const raw = u === null || u === void 0 ? void 0 : u.profile;
    if (!raw)
        return null;
    let profile = raw;
    if (typeof raw === "string") {
        try {
            profile = JSON.parse(raw);
        }
        catch (_c) {
            return null;
        }
    }
    const code = ((_a = profile === null || profile === void 0 ? void 0 : profile.location) === null || _a === void 0 ? void 0 : _a.countryCode) || ((_b = profile === null || profile === void 0 ? void 0 : profile.location) === null || _b === void 0 ? void 0 : _b.country);
    return typeof code === "string" && code.length === 2 ? code.toUpperCase() : null;
}
function displayNameFor(user, userId) {
    const profile = typeof (user === null || user === void 0 ? void 0 : user.profile) === "string"
        ? (() => {
            try {
                return JSON.parse(user.profile || "{}");
            }
            catch (_a) {
                return {};
            }
        })()
        : (user === null || user === void 0 ? void 0 : user.profile) || {};
    const nickname = String((profile === null || profile === void 0 ? void 0 : profile.nickname) || (profile === null || profile === void 0 ? void 0 : profile.displayName) || "").trim();
    if (nickname)
        return nickname;
    const legal = [user === null || user === void 0 ? void 0 : user.firstName, user === null || user === void 0 ? void 0 : user.lastName].filter(Boolean).join(" ").trim();
    if (legal)
        return legal;
    return `Trader ${String(userId).slice(-4).toUpperCase()}`;
}
exports.default = async (data) => {
    const { query, ctx } = data;
    const { period = "weekly", metric = "profit", limit = 100 } = query;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching ${period} leaderboard by ${metric}`);
    const now = new Date();
    let thresholdDate;
    switch (period) {
        case "daily":
            thresholdDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case "weekly":
            const day = now.getDay();
            thresholdDate = new Date(now);
            thresholdDate.setDate(now.getDate() - day);
            thresholdDate.setHours(0, 0, 0, 0);
            break;
        case "monthly":
            thresholdDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        default:
            thresholdDate = new Date(0);
    }
    const whereClause = {
        status: { [sequelize_1.Op.in]: ["WIN", "LOSS"] },
        isDemo: false,
    };
    if (period !== "alltime") {
        whereClause.closedAt = { [sequelize_1.Op.gte]: thresholdDate };
    }
    try {
        const leaderboardData = await db_1.models.binaryOrder.findAll({
            attributes: [
                "userId",
                [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "totalTrades"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'WIN' THEN 1 ELSE 0 END")), "wins"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'LOSS' THEN 1 ELSE 0 END")), "losses"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END")), "totalProfit"],
            ],
            where: whereClause,
            group: ["userId"],
            having: (0, sequelize_1.literal)("COUNT(id) >= 5"),
            order: getOrderByMetric(metric),
            limit: 100,
            raw: true,
        });
        const userIds = leaderboardData.map((e) => e.userId);
        const users = userIds.length === 0 ? [] : await db_1.models.user.findAll({
            attributes: ["id", "firstName", "lastName", "avatar", "profile"],
            where: { id: { [sequelize_1.Op.in]: userIds } },
            raw: true,
        });
        const userMap = new Map();
        users.forEach((u) => {
            userMap.set(u.id, u);
        });
        const real = leaderboardData.map((e) => {
            const u = userMap.get(e.userId);
            const wins = Number(e.wins) || 0;
            const losses = Number(e.losses) || 0;
            const totalTrades = Number(e.totalTrades) || 0;
            const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
            return {
                username: displayNameFor(u, e.userId),
                country: countryOf(u),
                avatar: (u === null || u === void 0 ? void 0 : u.avatar) || null,
                avatarSeed: (0, synthetic_1.avatarSeedFor)(e.userId),
                totalProfit: parseFloat(Number(e.totalProfit || 0).toFixed(2)),
                winRate: parseFloat(winRate.toFixed(1)),
                totalTrades,
                wins,
                losses,
            };
        });
        const merged = (0, synthetic_1.syntheticAllowed)(real.length)
            ? [
                ...real,
                ...(0, synthetic_1.syntheticLeaderboard)(period, metric, now).map((t) => ({
                    username: t.name,
                    country: t.country,
                    avatar: null,
                    avatarSeed: t.key,
                    totalProfit: t.totalProfit,
                    winRate: t.winRate,
                    totalTrades: t.totalTrades,
                    wins: t.wins,
                    losses: t.losses,
                })),
            ]
            : real;
        merged.sort((a, b) => metric === "winRate"
            ? b.winRate - a.winRate
            : metric === "volume"
                ? b.totalTrades - a.totalTrades
                : b.totalProfit - a.totalProfit);
        const standing = (rank) => merged.length > 0
            ? Math.min(100, Math.max(0.1, parseFloat(((rank / merged.length) * 100).toFixed(1))))
            : null;
        const traders = merged
            .slice(0, Math.min(Number(limit) || 100, 100))
            .map((t, idx) => ({ rank: idx + 1, percentile: standing(idx + 1), ...t }));
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Retrieved ${traders.length} traders for leaderboard`);
        return {
            period,
            metric,
            updatedAt: new Date().toISOString(),
            traders,
        };
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Failed to fetch leaderboard: ${error.message}`,
        });
    }
};
