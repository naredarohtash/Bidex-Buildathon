"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_MAX_BALANCE = exports.DEMO_MIN_BALANCE = exports.DEMO_RESET_BALANCE = exports.DEMO_DEFAULT_BALANCE = void 0;
exports.readRequestedBalance = readRequestedBalance;
exports.readDemoSettings = readDemoSettings;
exports.computeDemoBalance = computeDemoBalance;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
exports.DEMO_DEFAULT_BALANCE = 50000;
exports.DEMO_RESET_BALANCE = exports.DEMO_DEFAULT_BALANCE;
exports.DEMO_MIN_BALANCE = 100;
exports.DEMO_MAX_BALANCE = 1000000;
function readRequestedBalance(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount))
        return null;
    const rounded = Math.round(amount * 100) / 100;
    if (rounded < exports.DEMO_MIN_BALANCE || rounded > exports.DEMO_MAX_BALANCE)
        return null;
    return rounded;
}
function readDemoSettings(settings) {
    const demo = settings === null || settings === void 0 ? void 0 : settings.demo;
    return demo && typeof demo === "object" ? demo : {};
}
async function computeDemoBalance(userId) {
    const record = await db_1.models.user.findOne({
        where: { id: userId },
        attributes: ["id", "settings"],
    });
    const demo = readDemoSettings(record === null || record === void 0 ? void 0 : record.settings);
    const starting = typeof demo.startingBalance === "number"
        ? demo.startingBalance
        : exports.DEMO_DEFAULT_BALANCE;
    const since = demo.resetAt ? new Date(demo.resetAt) : null;
    const rows = await db_1.models.binaryOrder.findAll({
        where: {
            userId,
            isDemo: true,
            ...(since && !isNaN(since.getTime())
                ? { createdAt: { [sequelize_1.Op.gt]: since } }
                : {}),
        },
        attributes: [
            "status",
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "totalAmount"],
            [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("profit")), "totalProfit"],
        ],
        group: ["status"],
        raw: true,
    });
    let balance = starting;
    for (const row of rows) {
        const amount = Number(row.totalAmount) || 0;
        const profit = Number(row.totalProfit) || 0;
        switch (row.status) {
            case "WIN":
                balance += profit;
                break;
            case "LOSS":
            case "PENDING":
                balance -= amount;
                break;
        }
    }
    return Math.max(0, Number(balance.toFixed(2)));
}
