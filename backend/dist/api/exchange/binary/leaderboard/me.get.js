"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const query_1 = require("@b/utils/query");
const error_1 = require("@b/utils/error");
const synthetic_1 = require("./synthetic");
exports.metadata = {
    summary: "Get User's Leaderboard Position",
    operationId: "getUserLeaderboardPosition",
    tags: ["Exchange", "Binary", "Leaderboard"],
    description: "Retrieves the authenticated user's ranking and trading statistics for the leaderboard.",
    parameters: [
        {
            name: "period",
            in: "query",
            description: "Time period for the ranking: daily, weekly, monthly, alltime",
            schema: { type: "string", enum: ["daily", "weekly", "monthly", "alltime"] },
        },
        {
            name: "metric",
            in: "query",
            description: "Ranking metric: profit (total profit), winRate (win percentage), volume (trade count)",
            schema: { type: "string", enum: ["profit", "winRate", "volume"] },
        },
    ],
    responses: {
        200: {
            description: "User's leaderboard position and stats",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            rank: { type: "number" },
                            avatarSeed: { type: "string" },
                            percentile: { type: "number" },
                            qualified: { type: "boolean" },
                            minTradesRequired: { type: "number" },
                            stats: {
                                type: "object",
                                properties: {
                                    totalProfit: { type: "number" },
                                    winRate: { type: "number" },
                                    totalTrades: { type: "number" },
                                    wins: { type: "number" },
                                    losses: { type: "number" },
                                    bestStreak: { type: "number" },
                                    avgProfit: { type: "number" },
                                },
                            },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("User stats"),
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, query, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id)) {
        throw (0, error_1.createError)({
            statusCode: 401,
            message: "Unauthorized",
        });
    }
    const { period = "weekly", metric = "profit" } = query;
    ctx === null || ctx === void 0 ? void 0 : ctx.step(`Fetching leaderboard position for user ${user.id}`);
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
        const userStatsList = await db_1.models.binaryOrder.findAll({
            attributes: [
                [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "totalTrades"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'WIN' THEN 1 ELSE 0 END")), "wins"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'LOSS' THEN 1 ELSE 0 END")), "losses"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END")), "totalProfit"],
                [(0, sequelize_1.fn)("AVG", (0, sequelize_1.literal)("CASE WHEN status = 'WIN' THEN profit ELSE NULL END")), "avgProfit"],
            ],
            where: { ...whereClause, userId: user.id },
            raw: true,
        });
        const userStats = userStatsList[0];
        if (!userStats || 0 === Number(userStats.totalTrades)) {
            ctx === null || ctx === void 0 ? void 0 : ctx.success("No trades found for this period");
            return {
                rank: null,
                avatarSeed: (0, synthetic_1.avatarSeedFor)(user.id),
                percentile: null,
                qualified: false,
                minTradesRequired: 5,
                stats: {
                    totalProfit: 0,
                    winRate: 0,
                    totalTrades: 0,
                    wins: 0,
                    losses: 0,
                    avgProfit: 0,
                },
            };
        }
        const wins = Number(userStats.wins) || 0;
        const losses = Number(userStats.losses) || 0;
        const totalTrades = Number(userStats.totalTrades) || 0;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        const totalProfit = parseFloat(Number(userStats.totalProfit || 0).toFixed(2));
        const avgProfit = totalTrades > 0 ? parseFloat((totalProfit / totalTrades).toFixed(2)) : 0;
        const qualified = totalTrades >= 5;
        let rank = null;
        let totalTraders = 0;
        if (qualified) {
            const allTraders = await db_1.models.binaryOrder.findAll({
                attributes: [
                    "userId",
                    [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "totalTrades"],
                    [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'WIN' THEN 1 ELSE 0 END")), "wins"],
                    [(0, sequelize_1.fn)("SUM", (0, sequelize_1.literal)("CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END")), "totalProfit"],
                ],
                where: whereClause,
                group: ["userId"],
                having: (0, sequelize_1.literal)("COUNT(id) >= 5"),
                raw: true,
            });
            const field = [
                ...allTraders.map((item) => {
                    const itemWins = Number(item.wins) || 0;
                    const itemTrades = Number(item.totalTrades) || 0;
                    return {
                        userId: item.userId,
                        profit: Number(item.totalProfit) || 0,
                        winRate: itemTrades > 0 ? (itemWins / itemTrades) * 100 : 0,
                        volume: itemTrades,
                    };
                }),
                ...((0, synthetic_1.syntheticAllowed)(allTraders.length)
                    ? (0, synthetic_1.syntheticLeaderboard)(period, metric, now).map((t) => ({
                        userId: null,
                        profit: t.totalProfit,
                        winRate: t.winRate,
                        volume: t.totalTrades,
                    }))
                    : []),
            ];
            totalTraders = field.length;
            field.sort((a, b) => {
                switch (metric) {
                    case "winRate":
                        return b.winRate - a.winRate;
                    case "volume":
                        return b.volume - a.volume;
                    default:
                        return b.profit - a.profit;
                }
            });
            const rankIndex = field.findIndex((item) => item.userId === user.id);
            rank = rankIndex >= 0 ? rankIndex + 1 : null;
        }
        const percentile = rank && totalTraders > 0
            ? Math.min(100, Math.max(0.1, parseFloat(((rank / totalTraders) * 100).toFixed(1))))
            : null;
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`User rank: ${rank || "N/A"}`);
        return {
            rank,
            avatarSeed: (0, synthetic_1.avatarSeedFor)(user.id),
            percentile,
            qualified,
            minTradesRequired: 5,
            stats: {
                totalProfit,
                winRate: parseFloat(winRate.toFixed(1)),
                totalTrades,
                wins,
                losses,
                avgProfit,
            },
        };
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(error.message);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: `Failed to fetch user position: ${error.message}`,
        });
    }
};
