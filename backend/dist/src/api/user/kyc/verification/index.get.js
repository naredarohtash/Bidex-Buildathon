"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Identity verification status",
    operationId: "getKycVerificationStatus",
    tags: ["KYC"],
    description: "Returns the caller's current verification application: status, what they submitted, and the reviewer's note when there is one.",
    responses: {
        200: {
            description: "Current status",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            status: { type: "string", nullable: true },
                            submittedAt: { type: "string", nullable: true },
                            reviewedAt: { type: "string", nullable: true },
                            adminNotes: { type: "string", nullable: true },
                            submission: { type: "object", nullable: true },
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
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const application = await db_1.models.kycApplication.findOne({
        where: { userId: user.id },
        order: [["createdAt", "DESC"]],
        raw: true,
    });
    if (!application) {
        return { status: null, submittedAt: null, reviewedAt: null, adminNotes: null, submission: null };
    }
    const raw = application.data;
    let parsed = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        }
        catch (_a) {
            parsed = {};
        }
    }
    return {
        status: application.status,
        submittedAt: (parsed === null || parsed === void 0 ? void 0 : parsed.submittedAt) || application.createdAt,
        reviewedAt: application.reviewedAt || null,
        adminNotes: application.adminNotes || null,
        submission: parsed
            ? {
                countryCode: parsed.countryCode,
                countryName: parsed.countryName,
                documentLabel: parsed.documentLabel,
                documentNumberMasked: maskNumber(parsed.documentNumber),
            }
            : null,
    };
};
function maskNumber(value) {
    const s = String(value || "");
    if (s.length <= 4)
        return s;
    return `${"•".repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}
