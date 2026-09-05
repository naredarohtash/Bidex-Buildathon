import { models } from "@b/db";
import { col, fn, literal, Op } from "sequelize";
import { unauthorizedResponse, notFoundMetadataResponse, serverErrorResponse } from "@b/utils/query";
import { createError } from "@b/utils/error";
import { avatarSeedFor, syntheticAllowed, syntheticLeaderboard } from "./synthetic";

export const metadata: OperationObject = {
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
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("User stats"),
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user, query, ctx } = data;
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: "Unauthorized",
    });
  }

  const { period = "weekly", metric = "profit" } = query;

  ctx?.step(`Fetching leaderboard position for user ${user.id}`);

  const now = new Date();
  let thresholdDate: Date;

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

  const whereClause: any = {
    status: { [Op.in]: ["WIN", "LOSS"] },
    isDemo: false,
  };

  if (period !== "alltime") {
    whereClause.closedAt = { [Op.gte]: thresholdDate };
  }

  try {
    const userStatsList = await models.binaryOrder.findAll({
      attributes: [
        [fn("COUNT", col("id")), "totalTrades"],
        [fn("SUM", literal("CASE WHEN status = 'WIN' THEN 1 ELSE 0 END")), "wins"],
        [fn("SUM", literal("CASE WHEN status = 'LOSS' THEN 1 ELSE 0 END")), "losses"],
        [fn("SUM", literal("CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END")), "totalProfit"],
        [fn("AVG", literal("CASE WHEN status = 'WIN' THEN profit ELSE NULL END")), "avgProfit"],
      ],
      where: { ...whereClause, userId: user.id },
      raw: true,
    }) as any[];

    const userStats = userStatsList[0];

    if (!userStats || 0 === Number(userStats.totalTrades)) {
      ctx?.success("No trades found for this period");
      return {
        rank: null,
        avatarSeed: avatarSeedFor(user.id),
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

    let rank: number | null = null;
    let totalTraders = 0;

    if (qualified) {
      const allTraders = await models.binaryOrder.findAll({
        attributes: [
          "userId",
          [fn("COUNT", col("id")), "totalTrades"],
          [fn("SUM", literal("CASE WHEN status = 'WIN' THEN 1 ELSE 0 END")), "wins"],
          [fn("SUM", literal("CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END")), "totalProfit"],
        ],
        where: whereClause,
        group: ["userId"],
        having: literal("COUNT(id) >= 5"),
        raw: true,
      }) as any[];

      /* Ranked against the field the board actually shows.
      
         This used to rank against the real traders alone, on the stated
         reasoning that one qualified real trader takes the invented population
         off the board. That has not been true since `syntheticAllowed` was
         changed to ignore its argument: the synthetic field is merged in
         whenever the flag is on, however many real traders have qualified.
      
         So an account six trades and $720 down was told it was Ranked #1 — it
         was the only qualified real trader, so it came first in a field of one
         — directly above a list of traders every one of whom was ahead of it.
      
         The field is built and sorted here exactly as ./index.get builds and
         sorts the board, because a rank that is measured against a different
         population from the one on screen is not a rank. */
      const field = [
        ...allTraders.map((item) => {
          const itemWins = Number(item.wins) || 0;
          const itemTrades = Number(item.totalTrades) || 0;
          return {
            userId: item.userId as string | null,
            profit: Number(item.totalProfit) || 0,
            winRate: itemTrades > 0 ? (itemWins / itemTrades) * 100 : 0,
            volume: itemTrades,
          };
        }),
        ...(syntheticAllowed(allTraders.length)
          ? syntheticLeaderboard(period as any, metric as any, now).map((t) => ({
              userId: null as string | null,
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

    /* Floored at 0.1, not at 1: ./index.get uses the same floor, and the two
       have to agree — the same trader is described by both endpoints, and one
       saying "top 1%" while the other says "top 0.1%" is a contradiction the
       user can see on one screen.

       `totalTraders` is the divisor and stops here. How many traders are on the
       board is a fact about the business, and it was going out on every poll of
       an authenticated-but-public endpoint. The client only ever wanted it to
       divide a rank by, so it gets the quotient. */
    const percentile = rank && totalTraders > 0
      ? Math.min(100, Math.max(0.1, parseFloat(((rank / totalTraders) * 100).toFixed(1))))
      : null;

    ctx?.success(`User rank: ${rank || "N/A"}`);
    return {
      rank,
      /* The same seed ./index.get puts on this trader's row, so the animal in
         the "you" box and the animal on their row are one person. */
      avatarSeed: avatarSeedFor(user.id),
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
  } catch (error: any) {
    ctx?.fail(error.message);
    throw createError({
      statusCode: 500,
      message: `Failed to fetch user position: ${error.message}`,
    });
  }
};
