"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEVEL_NAME = void 0;
exports.ensureVerificationLevel = ensureVerificationLevel;
exports.documentHash = documentHash;
exports.runChecks = runChecks;
exports.readProfile = readProfile;
exports.validateSubmission = validateSubmission;
const crypto_1 = require("crypto");
const db_1 = require("@b/db");
const rules_1 = require("../../../kyc/documents/rules");
exports.LEVEL_NAME = "Identity Verification";
async function ensureVerificationLevel() {
    const existing = await db_1.models.kycLevel.findOne({ where: { name: exports.LEVEL_NAME } });
    if (existing)
        return existing;
    return db_1.models.kycLevel.create({
        name: exports.LEVEL_NAME,
        description: "Government ID and a photo of the applicant, reviewed by hand.",
        level: 1,
        status: "ACTIVE",
        fields: [
            { id: "countryCode", type: "TEXT", label: "Country of residence", order: 0, required: true },
            { id: "documentLabel", type: "TEXT", label: "Document type", order: 1, required: true },
            { id: "documentNumber", type: "TEXT", label: "Document number", order: 2, required: true },
            { id: "frontUrl", type: "FILE", label: "Document — front", order: 3, required: true },
            { id: "backUrl", type: "FILE", label: "Document — back", order: 4, required: false },
            { id: "selfieUrl", type: "FILE", label: "Photo of the applicant", order: 5, required: true },
        ],
    });
}
function documentHash(countryCode, documentId, number) {
    return (0, crypto_1.createHash)("sha256")
        .update(`${countryCode.toUpperCase()}:${documentId}:${(0, rules_1.normaliseNumber)(number)}`)
        .digest("hex");
}
async function runChecks(user, countryCode, documentId, documentNumber) {
    var _a, _b;
    const checks = [];
    const found = (0, rules_1.findDocument)(countryCode, documentId);
    checks.push({
        id: "format",
        label: "Number format",
        status: "PASS",
        detail: found ? `Matches the pattern for ${found.document.label}` : "Checked",
    });
    const profile = readProfile(user);
    const profileCountry = String(((_a = profile === null || profile === void 0 ? void 0 : profile.location) === null || _a === void 0 ? void 0 : _a.countryCode) || ((_b = profile === null || profile === void 0 ? void 0 : profile.location) === null || _b === void 0 ? void 0 : _b.country) || "").toUpperCase();
    if (!profileCountry) {
        checks.push({
            id: "country",
            label: "Country matches profile",
            status: "FLAG",
            detail: "No country saved on their profile to compare against",
        });
    }
    else if (profileCountry === countryCode.toUpperCase()) {
        checks.push({
            id: "country",
            label: "Country matches profile",
            status: "PASS",
            detail: `Profile address is in ${profileCountry}`,
        });
    }
    else {
        checks.push({
            id: "country",
            label: "Country matches profile",
            status: "FLAG",
            detail: `Applying as ${countryCode.toUpperCase()} but the profile address is in ${profileCountry}`,
        });
    }
    const stored = profile === null || profile === void 0 ? void 0 : profile.identityDocument;
    const storedNumber = (0, rules_1.normaliseNumber)((stored === null || stored === void 0 ? void 0 : stored.number) || "");
    if (storedNumber) {
        const sameKind = String((stored === null || stored === void 0 ? void 0 : stored.type) || "").toLowerCase().replace(/[^a-z]/g, "") ===
            documentId.toLowerCase().replace(/[^a-z]/g, "");
        if (!sameKind) {
            checks.push({
                id: "number",
                label: "Number matches profile",
                status: "PASS",
                detail: `Profile holds a ${stored.type}; this is a different document`,
            });
        }
        else if (storedNumber === (0, rules_1.normaliseNumber)(documentNumber)) {
            checks.push({
                id: "number",
                label: "Number matches profile",
                status: "PASS",
                detail: "Same number they saved on their profile",
            });
        }
        else {
            checks.push({
                id: "number",
                label: "Number matches profile",
                status: "FLAG",
                detail: `Profile holds a different ${stored.type} number`,
            });
        }
    }
    const hash = documentHash(countryCode, documentId, documentNumber);
    const others = await db_1.models.kycApplication.findAll({
        where: { userId: { [require("sequelize").Op.ne]: user.id } },
        attributes: ["id", "userId", "data", "status"],
        limit: 5000,
        raw: true,
    });
    const clashes = others.filter((a) => {
        const data = typeof a.data === "string" ? safeParse(a.data) : a.data;
        return (data === null || data === void 0 ? void 0 : data.documentHash) === hash;
    });
    checks.push(clashes.length === 0
        ? {
            id: "duplicate",
            label: "Document not used elsewhere",
            status: "PASS",
            detail: "No other account has submitted this document",
        }
        : {
            id: "duplicate",
            label: "Document not used elsewhere",
            status: "FLAG",
            detail: `Already submitted on ${clashes.length} other account${clashes.length === 1 ? "" : "s"}`,
        });
    return checks;
}
function readProfile(user) {
    const raw = user === null || user === void 0 ? void 0 : user.profile;
    if (!raw)
        return {};
    if (typeof raw === "string")
        return safeParse(raw);
    return raw;
}
function safeParse(v) {
    try {
        return JSON.parse(v);
    }
    catch (_a) {
        return {};
    }
}
function validateSubmission(body) {
    const countryCode = String((body === null || body === void 0 ? void 0 : body.countryCode) || "").toUpperCase();
    const documentId = String((body === null || body === void 0 ? void 0 : body.documentId) || "");
    const documentNumber = String((body === null || body === void 0 ? void 0 : body.documentNumber) || "");
    const found = (0, rules_1.findDocument)(countryCode, documentId);
    if (!found)
        return { error: "Choose a country and a document type" };
    const numberError = (0, rules_1.validateNumber)(found.document, documentNumber);
    if (numberError)
        return { error: numberError };
    if (!(body === null || body === void 0 ? void 0 : body.frontUrl))
        return { error: "Upload the front of your document" };
    if (found.document.sides === 2 && !(body === null || body === void 0 ? void 0 : body.backUrl)) {
        return { error: `Upload the back of your ${found.document.label}` };
    }
    if (!(body === null || body === void 0 ? void 0 : body.selfieUrl))
        return { error: "Add a photo of yourself" };
    return { found };
}
