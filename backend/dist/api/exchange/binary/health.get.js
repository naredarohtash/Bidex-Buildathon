"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const date_fns_1 = require("date-fns");
const db_1 = require("@b/db");
const cache_1 = require("@b/utils/cache");
const sequelize_1 = require("sequelize");
exports.metadata = {
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
exports.default = async (data) => {
    var _a;
    const { ctx } = data;
    const timestamp = (0, date_fns_1.formatDate)(new Date(), "yyyy-MM-dd HH:mm:ss");
    const checks = {
        system: { status: "up", message: "" },
        database: { status: "up", message: "" },
        durations: { status: "up", message: "" },
        markets: { status: "up", message: "" },
        orders: { status: "up", message: "" },
    };
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking binary trading system status");
        const cache = cache_1.CacheManager.getInstance();
        const binaryStatus = (await cache.getSetting("binaryStatus")) === "true";
        checks.system = binaryStatus
            ? { status: "up", message: "Binary trading is enabled", details: { enabled: true } }
            : { status: "down", message: "Binary trading is disabled in system configuration", details: { enabled: false } };
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking database connectivity");
        try {
            await db_1.sequelize.authenticate();
            console.log(`[DB CONFIG DEBUG] Host: ${db_1.sequelize.config.host}, Database: ${db_1.sequelize.config.database}, Port: ${db_1.sequelize.config.port}`);
            checks.database = { status: "up", message: "Database connection is healthy" };
        }
        catch (dbError) {
            checks.database = { status: "down", message: `Database connection failed: ${dbError instanceof Error ? dbError.message : "Unknown error"}` };
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking binary durations");
        try {
            const activeDurations = (await ((_a = db_1.models.binaryDuration) === null || _a === void 0 ? void 0 : _a.findAll({
                where: { status: true },
                attributes: ["id", "duration", "status"],
            }))) || [];
            if (activeDurations.length === 0) {
                checks.durations = { status: "warning", message: "No active binary durations found", details: { count: 0, active: 0 } };
            }
            else {
                checks.durations = {
                    status: "up",
                    message: `${activeDurations.length} active duration(s) available`,
                    details: {
                        count: activeDurations.length,
                        durations: activeDurations.map((d) => `${d.duration}m`).join(", "),
                    },
                };
            }
        }
        catch (durationsError) {
            checks.durations = { status: "down", message: `Failed to fetch durations: ${durationsError.message}` };
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking binary markets");
        try {
            const marketsCount = await db_1.models.binaryMarket.count({ where: { status: true } });
            if (marketsCount === 0) {
                checks.markets = { status: "warning", message: "No active binary markets found", details: { active: 0 } };
            }
            else {
                checks.markets = { status: "up", message: `${marketsCount} active market(s) available`, details: { active: marketsCount } };
            }
        }
        catch (marketsError) {
            checks.markets = { status: "down", message: `Failed to fetch markets: ${marketsError instanceof Error ? marketsError.message : "Unknown error"}` };
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Checking order processing health");
        try {
            const pendingCount = await db_1.models.binaryOrder.count({ where: { status: "PENDING" } });
            const oneDayAgo = new Date(Date.now() - 86400000);
            const stuckCount = await db_1.models.binaryOrder.count({
                where: {
                    status: "PENDING",
                    createdAt: { [sequelize_1.Op.lt]: oneDayAgo },
                },
            });
            checks.orders = stuckCount > 0
                ? { status: "warning", message: `${stuckCount} order(s) stuck in pending status for >24h`, details: { pending: pendingCount, stuck: stuckCount } }
                : { status: "up", message: `Order processing healthy. ${pendingCount} pending order(s)`, details: { pending: pendingCount, stuck: 0 } };
        }
        catch (ordersError) {
            checks.orders = { status: "down", message: `Failed to check orders: ${ordersError instanceof Error ? ordersError.message : "Unknown error"}` };
        }
        const statuses = Object.values(checks).map((c) => c.status);
        let overallStatus = "healthy";
        if (statuses.includes("down")) {
            overallStatus = "down";
        }
        else if (statuses.includes("warning")) {
            overallStatus = "degraded";
        }
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Binary trading health check completed: ${overallStatus}`);
        return { status: overallStatus, timestamp, checks };
    }
    catch (error) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail(`Health check failed: ${error.message}`);
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
