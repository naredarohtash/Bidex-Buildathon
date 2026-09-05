"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Delete a bonus code",
    operationId: "deleteBonusCode",
    tags: ["Admin", "Finance"],
    description: "Deletes a code that has never been claimed. Use pause for codes that have.",
    requiresAuth: true,
    permission: "delete.deposit",
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: {
        200: { description: "Deleted" },
        404: { description: "Not found" },
        409: { description: "Already used — pause it instead" },
    },
};
exports.default = async (data) => {
    var _a, _b;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const id = String(((_b = data.params) === null || _b === void 0 ? void 0 : _b.id) || "");
    const code = await db_1.models.bonusCode.findByPk(id);
    if (!code)
        throw (0, error_1.createError)({ statusCode: 404, message: "Code not found." });
    const claims = await db_1.models.bonusRedemption.count({ where: { bonusCodeId: id } });
    if (claims > 0) {
        throw (0, error_1.createError)({
            statusCode: 409,
            message: `${code.code} has been used ${claims} time${claims === 1 ? "" : "s"}. Pause it instead — deleting it would remove the record of what was paid out.`,
        });
    }
    await db_1.models.bonusCode.destroy({ where: { id } });
    return { message: `${code.code} deleted.` };
};
