/**
 * The bonus codes, with what each has actually cost.
 *
 * usedCount and totalPaidOut are carried on the row and maintained as claims
 * settle, so a campaign's spend is visible while it is running. Reconstructing
 * it afterwards from transaction metadata is the version of this that never
 * gets done until someone asks why the month was expensive.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";

export const metadata: OperationObject = {
  summary: "List deposit bonus codes",
  operationId: "listBonusCodes",
  tags: ["Admin", "Finance"],
  description: "All bonus codes with their conditions and usage to date.",
  requiresAuth: true,
  permission: "view.deposit",
  responses: {
    200: { description: "Bonus codes" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
};

export default async (data: { user?: { id: string } }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const rows = await models.bonusCode.findAll({ order: [["createdAt", "DESC"]], limit: 200 });
  const now = Date.now();

  return {
    items: rows.map((row: any) => {
      /* One derived state rather than four booleans for the screen to combine.
         "Active" is not the same as "switched on": a live code can still be
         scheduled, expired or exhausted, and an operator looking at a list
         needs to know which without doing date arithmetic. */
      const startsAt = row.startsAt ? new Date(row.startsAt).getTime() : null;
      const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
      const exhausted =
        Number(row.maxUsesTotal) > 0 && Number(row.usedCount) >= Number(row.maxUsesTotal);

      const state = !row.status
        ? "PAUSED"
        : exhausted
          ? "EXHAUSTED"
          : startsAt && startsAt > now
            ? "SCHEDULED"
            : expiresAt && expiresAt < now
              ? "EXPIRED"
              : "LIVE";

      return {
        id: row.id,
        code: row.code,
        description: row.description,
        type: row.type,
        value: Number(row.value),
        minDeposit: Number(row.minDeposit),
        maxBonus: Number(row.maxBonus),
        maxUsesTotal: Number(row.maxUsesTotal),
        maxUsesPerUser: Number(row.maxUsesPerUser),
        firstDepositOnly: Boolean(row.firstDepositOnly),
        allowedMethods: row.allowedMethods || null,
        startsAt: row.startsAt,
        expiresAt: row.expiresAt,
        status: Boolean(row.status),
        usedCount: Number(row.usedCount),
        totalPaidOut: Number(row.totalPaidOut),
        state,
        createdAt: row.createdAt,
      };
    }),
  };
};
