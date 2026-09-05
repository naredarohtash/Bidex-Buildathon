"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const rules_1 = require("../../../kyc/documents/rules");
const utils_1 = require("./utils");
exports.metadata = {
    summary: "Submit identity verification",
    operationId: "submitKycVerification",
    tags: ["KYC"],
    description: "Creates a KYC application from the one-step verification flow. Validates the document number against the country's pattern, requires the back of two-sided documents, and attaches the format, profile-match and duplicate checks for the reviewer.",
    logModule: "KYC",
    logTitle: "Submit verification",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        countryCode: { type: "string", description: "ISO 3166-1 alpha-2" },
                        documentId: { type: "string", description: "Document id from /api/kyc/documents" },
                        documentNumber: { type: "string" },
                        frontUrl: { type: "string" },
                        backUrl: { type: "string", nullable: true },
                        selfieUrl: { type: "string" },
                    },
                    required: ["countryCode", "documentId", "documentNumber", "frontUrl", "selfieUrl"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Application submitted",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string" },
                            status: { type: "string" },
                            applicationId: { type: "string" },
                        },
                    },
                },
            },
        },
        400: { description: "The submission is incomplete or the number is malformed" },
        401: query_1.unauthorizedResponse,
        409: { description: "An application is already open" },
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const { error, found } = (0, utils_1.validateSubmission)(body);
    if (error)
        throw (0, error_1.createError)({ statusCode: 400, message: error });
    const countryCode = String(body.countryCode).toUpperCase();
    const documentId = String(body.documentId);
    const documentNumber = (0, rules_1.normaliseNumber)(body.documentNumber);
    const open = await db_1.models.kycApplication.findOne({
        where: { userId: user.id, status: ["PENDING", "APPROVED"] },
    });
    if (open) {
        throw (0, error_1.createError)({
            statusCode: 409,
            message: open.status === "APPROVED"
                ? "Your identity is already verified."
                : "You already have a verification under review.",
        });
    }
    const level = await (0, utils_1.ensureVerificationLevel)();
    const record = await db_1.models.user.findByPk(user.id, {
        attributes: ["id", "firstName", "lastName", "email", "phone", "profile"],
        raw: true,
    });
    const checks = await (0, utils_1.runChecks)(record, countryCode, documentId, documentNumber);
    const application = await db_1.models.kycApplication.create({
        userId: user.id,
        levelId: level.id,
        status: "PENDING",
        data: {
            countryCode,
            countryName: found.country.name,
            documentId,
            documentLabel: found.document.label,
            documentNumber,
            documentSides: found.document.sides,
            documentHash: (0, utils_1.documentHash)(countryCode, documentId, documentNumber),
            frontUrl: body.frontUrl,
            backUrl: found.document.sides === 2 ? body.backUrl : null,
            selfieUrl: body.selfieUrl,
            applicant: {
                firstName: (record === null || record === void 0 ? void 0 : record.firstName) || "",
                lastName: (record === null || record === void 0 ? void 0 : record.lastName) || "",
                email: (record === null || record === void 0 ? void 0 : record.email) || "",
                phone: (record === null || record === void 0 ? void 0 : record.phone) || "",
            },
            checks,
            submittedAt: new Date().toISOString(),
        },
    });
    try {
        const { emailQueue } = require("@b/utils/emails");
        await emailQueue.add({
            emailData: {
                TO: record === null || record === void 0 ? void 0 : record.email,
                FIRSTNAME: (record === null || record === void 0 ? void 0 : record.firstName) || "there",
                CREATED_AT: new Date().toLocaleString(),
                LEVEL: "Identity Verification",
                STATUS: "Under review",
            },
            emailType: "KycSubmission",
        });
    }
    catch (e) {
        const { logger } = require("@b/utils/console");
        logger.error("KYC", "Submission email could not be queued", e);
    }
    return {
        message: "Your details are with our team for review.",
        status: "PENDING",
        applicationId: application.id,
    };
};
