import { models } from "@b/db";
import { col, fn, literal, Op } from "sequelize";
import { unauthorizedResponse, notFoundMetadataResponse, serverErrorResponse } from "@b/utils/query";
import { createError } from "@b/utils/error";
import { avatarSeedFor, syntheticAllowed, syntheticLeaderboard } from "./synthetic";

export const metadata: OperationObject = {
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
    404: notFoundMetadataResponse("Leaderboard"),
    500: serverErrorResponse,
  },
  requiresAuth: false,
};

function getOrderByMetric(metric: string): any {
  switch (metric) {
    case "winRate":
      return [[literal("CASE WHEN COUNT(id) > 0 THEN SUM(CASE WHEN status = 'WIN' THEN 1 ELSE 0 END) * 100.0 / COUNT(id) ELSE 0 END"), "DESC"]];
    case "volume":
      return [[fn("COUNT", col("id")), "DESC"]];
    default:
      return [[literal("SUM(CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END)"), "DESC"]];
  }
}

/** A real trader's country, when their profile carries one. */
function countryOf(u: any): string | null {
  const raw = u?.profile;
  if (!raw) return null;
  let profile: any = raw;
  if (typeof raw === "string") {
    try {
      profile = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const code = profile?.location?.countryCode || profile?.location?.country;
  return typeof code === "string" && code.length === 2 ? code.toUpperCase() : null;
}

/**
 * What a trader is called on the board.
 *
 * Their nickname if they have set one, and their full name if they have not.
 * That is the whole point of the nickname field: somebody who would rather not
 * appear under their legal name sets one, and somebody who does not care does
 * nothing.
 *
 * This replaces an initials-and-suffix mask ("SA***4E84") that was applied to
 * everybody whether they wanted it or not. It was not protecting much — the
 * board is ranked by profit, so the row itself is the sensitive part — and it
 * made the nickname field pointless, since a nickname would have been masked
 * too.
 *
 * `profile` is a JSON column that arrives as either a string or an object
 * depending on how it was written, so both are handled.
 */
function displayNameFor(user: any, userId: string): string {
  const profile =
    typeof user?.profile === "string"
      ? (() => {
          try {
            return JSON.parse(user.profile || "{}");
          } catch {
            return {};
          }
        })()
      : user?.profile || {};

  // `displayName` is the key this field used to live under.
  const nickname = String(profile?.nickname || profile?.displayName || "").trim();
  if (nickname) return nickname;

  const legal = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  if (legal) return legal;

  // Neither a nickname nor a name on file — still needs something stable.
  return `Trader ${String(userId).slice(-4).toUpperCase()}`;
}

export default async (data: Handler) => {
  const { query, ctx } = data;
  const { period = "weekly", metric = "profit", limit = 100 } = query;

  ctx?.step(`Fetching ${period} leaderboard by ${metric}`);

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
    const leaderboardData = await models.binaryOrder.findAll({
      attributes: [
        "userId",
        [fn("COUNT", col("id")), "totalTrades"],
        [fn("SUM", literal("CASE WHEN status = 'WIN' THEN 1 ELSE 0 END")), "wins"],
        [fn("SUM", literal("CASE WHEN status = 'LOSS' THEN 1 ELSE 0 END")), "losses"],
        [fn("SUM", literal("CASE WHEN status = 'WIN' THEN profit WHEN status = 'LOSS' THEN -amount ELSE 0 END")), "totalProfit"],
      ],
      where: whereClause,
      group: ["userId"],
      having: literal("COUNT(id) >= 5"),
      order: getOrderByMetric(metric),
      limit: 100,
      raw: true,
    }) as any[];

    const userIds = leaderboardData.map((e) => e.userId);

    const users = userIds.length === 0 ? [] : await models.user.findAll({
      attributes: ["id", "firstName", "lastName", "avatar", "profile"],
      where: { id: { [Op.in]: userIds } },
      raw: true,
    }) as any[];

    const userMap = new Map<string, any>();
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
        avatar: u?.avatar || null,
        /* For the generated avatar the client draws when `avatar` is null.
           A hash of the id, never the id — see `avatarSeedFor`. */
        avatarSeed: avatarSeedFor(e.userId),
        totalProfit: parseFloat(Number(e.totalProfit || 0).toFixed(2)),
        winRate: parseFloat(winRate.toFixed(1)),
        totalTrades,
        wins,
        losses,
      };
    });

    /* Merged before ranking, not concatenated after it, so a real trader and a
       synthetic one are ordered against each other by the same metric. See
       ./synthetic for what this is and the date it switches itself off. */
    const merged = syntheticAllowed(real.length)
      ? [
          ...real,
          ...syntheticLeaderboard(period as any, metric as any, now).map((t) => ({
            username: t.name,
            country: t.country,
            avatar: null as string | null,
            avatarSeed: t.key,
            totalProfit: t.totalProfit,
            winRate: t.winRate,
            totalTrades: t.totalTrades,
            wins: t.wins,
            losses: t.losses,
          })),
        ]
      : real;

    merged.sort((a, b) =>
      metric === "winRate"
        ? b.winRate - a.winRate
        : metric === "volume"
          ? b.totalTrades - a.totalTrades
          : b.totalProfit - a.totalProfit
    );

    /* The standing is computed here and the population is not sent.
    
       How many traders are on this board is a fact about the business, and it
       was going out on every poll of a public endpoint — "totalTraders: 4201",
       readable in the network tab by anyone with an account. The client only
       ever wanted it to divide a rank by, so it gets the quotient instead and
       the divisor stays on the server.
    
       Floored at 0.1 rather than rounded to a whole percent, which is the same
       floor ./me.get applies: the top of a four-figure board is a fraction of a
       percent, and "top 0%" is not a thing to tell anybody. */
    const standing = (rank: number) =>
      merged.length > 0
        ? Math.min(100, Math.max(0.1, parseFloat(((rank / merged.length) * 100).toFixed(1))))
        : null;

    const traders = merged
      .slice(0, Math.min(Number(limit) || 100, 100))
      .map((t, idx) => ({ rank: idx + 1, percentile: standing(idx + 1), ...t }));

    ctx?.success(`Retrieved ${traders.length} traders for leaderboard`);
    return {
      period,
      metric,
      updatedAt: new Date().toISOString(),
      traders,
    };
  } catch (error: any) {
    ctx?.fail(error.message);
    throw createError({
      statusCode: 500,
      message: `Failed to fetch leaderboard: ${error.message}`,
    });
  }
};
