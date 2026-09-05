import { formatDate } from "date-fns";
import { models, sequelize } from "@b/db";
import { CacheManager } from "@b/utils/cache";
import { Op } from "sequelize";

export const metadata: OperationObject = {
  summary: "Binary Trading Health Check",
  operationId: "binaryHealthCheck",
  tags: ["Binary", "Health"],
  description: "Checks the health status of the binary trading system including database connectivity, order processing, and system configuration.",
  responses: {
    200: {
      description: "Health check completed successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["healthy", "degraded", "down"], description: "Overall system health status" },
              timestamp: { type: "string", description: "ISO 8601 timestamp of health check" },
              checks: {
                type: "object",
                properties: {
                  system: { type: "object" },
                  database: { type: "object" },
                  durations: { type: "object" },
                  markets: { type: "object" },
                  orders: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
    500: { description: "Health check failed" },
  },
  requiresAuth: false,
  logModule: "BINARY_HEALTH",
  logTitle: "Binary Trading Health Check",
};

export default async (data: Handler) => {
  const { ctx } = data;
  const timestamp = formatDate(new Date(), "yyyy-MM-dd HH:mm:ss");
  const checks: any = {
    system: { status: "up", message: "" },
    database: { status: "up", message: "" },
    durations: { status: "up", message: "" },
    markets: { status: "up", message: "" },
    orders: { status: "up", message: "" },
  };

  try {
    ctx?.step("Checking binary trading system status");
    const cache = CacheManager.getInstance();
    const binaryStatus = (await cache.getSetting("binaryStatus")) === "true";
    checks.system = binaryStatus
      ? { status: "up", message: "Binary trading is enabled", details: { enabled: true } }
      : { status: "down", message: "Binary trading is disabled in system configuration", details: { enabled: false } };

    ctx?.step("Checking database connectivity");
    try {
      await sequelize.authenticate();
      console.log(`[DB CONFIG DEBUG] Host: ${sequelize.config.host}, Database: ${sequelize.config.database}, Port: ${sequelize.config.port}`);
      checks.database = { status: "up", message: "Database connection is healthy" };
    } catch (dbError: any) {
      checks.database = { status: "down", message: `Database connection failed: ${dbError instanceof Error ? dbError.message : "Unknown error"}` };
    }

    ctx?.step("Checking binary durations");
    try {
      const activeDurations = (await models.binaryDuration?.findAll({
        where: { status: true },
        attributes: ["id", "duration", "status"],
      })) || [];
      if (activeDurations.length === 0) {
        checks.durations = { status: "warning", message: "No active binary durations found", details: { count: 0, active: 0 } };
      } else {
        checks.durations = {
          status: "up",
          message: `${activeDurations.length} active duration(s) available`,
          details: {
            count: activeDurations.length,
            durations: activeDurations.map((d: any) => `${d.duration}m`).join(", "),
          },
        };
      }
    } catch (durationsError: any) {
      checks.durations = { status: "down", message: `Failed to fetch durations: ${durationsError.message}` };
    }

    ctx?.step("Checking binary markets");
    try {
      const marketsCount = await models.binaryMarket.count({ where: { status: true } });
      if (marketsCount === 0) {
        checks.markets = { status: "warning", message: "No active binary markets found", details: { active: 0 } };
      } else {
        checks.markets = { status: "up", message: `${marketsCount} active market(s) available`, details: { active: marketsCount } };
      }
    } catch (marketsError: any) {
      checks.markets = { status: "down", message: `Failed to fetch markets: ${marketsError instanceof Error ? marketsError.message : "Unknown error"}` };
    }

    ctx?.step("Checking order processing health");
    try {
      const pendingCount = await models.binaryOrder.count({ where: { status: "PENDING" } });
      const oneDayAgo = new Date(Date.now() - 86400000);
      const stuckCount = await models.binaryOrder.count({
        where: {
          status: "PENDING",
          createdAt: { [Op.lt]: oneDayAgo },
        },
      });
      checks.orders = stuckCount > 0
        ? { status: "warning", message: `${stuckCount} order(s) stuck in pending status for >24h`, details: { pending: pendingCount, stuck: stuckCount } }
        : { status: "up", message: `Order processing healthy. ${pendingCount} pending order(s)`, details: { pending: pendingCount, stuck: 0 } };
    } catch (ordersError: any) {
      checks.orders = { status: "down", message: `Failed to check orders: ${ordersError instanceof Error ? ordersError.message : "Unknown error"}` };
    }

    const statuses = Object.values(checks).map((c: any) => c.status);
    let overallStatus: "healthy" | "degraded" | "down" = "healthy";
    if (statuses.includes("down")) {
      overallStatus = "down";
    } else if (statuses.includes("warning")) {
      overallStatus = "degraded";
    }

    ctx?.success(`Binary trading health check completed: ${overallStatus}`);
    return { status: overallStatus, timestamp, checks };
  } catch (error: any) {
    ctx?.fail(`Health check failed: ${error.message}`);
    return {
      status: "down",
      timestamp,
      checks: {
        ...checks,
        system: { status: "down", message: `Unexpected error during health check: ${error.message}` },
      },
    };
  }
};
