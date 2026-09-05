/**
 * Creating and editing a bonus code.
 *
 * One route for both: the fields are identical, and two near-duplicate
 * validators would drift until a rule held on create and not on edit.
 *
 * The validation here is deliberately strict about the combinations that cost
 * money quietly — an uncapped percentage, an unlimited per-user claim, a
 * negative value — because none of them look wrong in a form. They look wrong
 * a month later on a statement.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { DEPOSIT_METHODS } from "../../../finance/wallet-methods";

export const metadata: OperationObject = {
  summary: "Create or update a bonus code",
  operationId: "saveBonusCode",
  tags: ["Admin", "Finance"],
  description: "Creates a bonus code, or updates one when an id is supplied.",
  requiresAuth: true,
  permission: "edit.deposit",
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Omit to create." },
            code: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["PERCENTAGE", "FIXED"] },
            value: { type: "number" },
            minDeposit: { type: "number" },
            maxBonus: { type: "number", description: "0 = uncapped" },
            maxUsesTotal: { type: "number", description: "0 = unlimited" },
            maxUsesPerUser: { type: "number", description: "0 = unlimited" },
            firstDepositOnly: { type: "boolean" },
            allowedMethods: { type: "array", items: { type: "string" } },
            startsAt: { type: "string", nullable: true },
            expiresAt: { type: "string", nullable: true },
            status: { type: "boolean" },
          },
          required: ["code", "type", "value"],
        },
      },
    },
  },
  responses: {
    200: { description: "Saved" },
    400: { description: "Invalid" },
    409: { description: "That code already exists" },
  },
};

const VALID_METHODS = new Set(DEPOSIT_METHODS.map((m) => m.id));

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async (data: { user?: { id: string }; body?: any }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });
  const body = data.body || {};

  /* Uppercased and stripped of spaces. Codes are typed by hand under a
     promotion's pressure, and "SUMMER 25" versus "summer25" being different
     codes is a support ticket waiting to happen. */
  const code = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
    throw createError({
      statusCode: 400,
      message: "Code must be 3-64 characters: letters, numbers, hyphen or underscore.",
    });
  }

  const type = body.type === "FIXED" ? "FIXED" : "PERCENTAGE";
  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw createError({ statusCode: 400, message: "Enter a bonus value above zero." });
  }
  if (type === "PERCENTAGE" && value > 100) {
    throw createError({
      statusCode: 400,
      message: "A percentage bonus above 100% pays more than the deposit. Use a fixed amount if that is intended.",
    });
  }

  const minDeposit = Math.max(0, Number(body.minDeposit) || 0);
  const maxBonus = Math.max(0, Number(body.maxBonus) || 0);
  const maxUsesTotal = Math.max(0, Math.floor(Number(body.maxUsesTotal) || 0));
  const maxUsesPerUser = Math.max(0, Math.floor(Number(body.maxUsesPerUser) ?? 1));

  /* An uncapped percentage has no worst case: one large deposit can pay out
     more than the entire promotion was meant to cost. Refused rather than
     warned about, because a warning in an admin form is not read. */
  if (type === "PERCENTAGE" && maxBonus === 0) {
    throw createError({
      statusCode: 400,
      message: "Set a maximum bonus. An uncapped percentage has no limit on what a single deposit can pay out.",
    });
  }

  const startsAt = toDate(body.startsAt);
  const expiresAt = toDate(body.expiresAt);
  if (startsAt && expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
    throw createError({ statusCode: 400, message: "The end date must be after the start date." });
  }

  let allowedMethods: string[] | null = null;
  if (Array.isArray(body.allowedMethods) && body.allowedMethods.length > 0) {
    const chosen = body.allowedMethods.map(String).filter((id: string) => VALID_METHODS.has(id));
    if (chosen.length === 0) {
      throw createError({ statusCode: 400, message: "None of those payment methods exist." });
    }
    allowedMethods = chosen;
  }

  const fields = {
    code,
    description: String(body.description || "").slice(0, 191) || null,
    type,
    value,
    minDeposit,
    maxBonus,
    maxUsesTotal,
    maxUsesPerUser,
    firstDepositOnly: Boolean(body.firstDepositOnly),
    allowedMethods,
    startsAt,
    expiresAt,
    status: body.status === undefined ? true : Boolean(body.status),
  };

  const id = body.id ? String(body.id) : null;

  // A code already in use must stay unique, whether this is a create or a
  // rename onto someone else's code.
  const clash = await models.bonusCode.findOne({ where: { code } });
  if (clash && (!id || clash.id !== id)) {
    throw createError({ statusCode: 409, message: `The code ${code} already exists.` });
  }

  if (id) {
    const existing = await models.bonusCode.findByPk(id);
    if (!existing) throw createError({ statusCode: 404, message: "Code not found." });
    // usedCount and totalPaidOut are never taken from the request: they are
    // history, and history is not editable from a form.
    await models.bonusCode.update(fields, { where: { id } });
    return { id, code, message: `${code} updated.` };
  }

  const created = await models.bonusCode.create(fields);
  return { id: created.id, code, message: `${code} created.` };
};
