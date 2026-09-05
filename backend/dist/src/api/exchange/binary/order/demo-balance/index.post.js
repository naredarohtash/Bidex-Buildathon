"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const query_1 = require("@b/utils/query");
const demoBalance_1 = require("../util/demoBalance");
exports.metadata = {
    summary: "Set or reset the demo balance",
    operationId: "resetBinaryDemoBalance",
    tags: ["Exchange", "Binary"],
    description: "Sets the authenticated user's demo balance to `amount`, or resets it to the default when no amount is given. Recorded on the account, so it applies on every device rather than only the browser it was pressed in.",
    requestBody: {
        required: false,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: `The practice balance to start from, between ${demoBalance_1.DEMO_MIN_BALANCE} and ${demoBalance_1.DEMO_MAX_BALANCE}. Omitted, the balance resets to the default.`,
                        },
                    },
                },
            },
        },
    },
    responses: {
        200: {
            description: "The demo balance after the reset",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            balance: { type: "number", description: "Demo balance" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw new Error("Unauthorized");
    const requested = body && Object.prototype.hasOwnProperty.call(body, "amount")
        ? (0, demoBalance_1.readRequestedBalance)(body.amount)
        : null;
    const record = await db_1.models.user.findOne({
        where: { id: user.id },
        attributes: ["id", "settings"],
    });
    const settings = { ...((record === null || record === void 0 ? void 0 : record.settings) || {}) };
    settings.demo = {
        ...(0, demoBalance_1.readDemoSettings)(settings),
        startingBalance: requested !== null && requested !== void 0 ? requested : demoBalance_1.DEMO_RESET_BALANCE,
        resetAt: new Date().toISOString(),
    };
    await db_1.models.user.update({ settings }, { where: { id: user.id } });
    return { balance: await (0, demoBalance_1.computeDemoBalance)(user.id) };
};
