/**
 * Deleting a bonus code.
 *
 * Refused once the code has been claimed. Those claims are the record of why
 * money was paid out, and a redemption row pointing at a code that no longer
 * exists cannot answer the only question anyone ever asks it. Pausing switches
 * a code off just as effectively and keeps the history intact, so the delete is
 * reserved for codes that were created by mistake and never used.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";

export const metadata: OperationObject = {
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

export default async (data: { user?: { id: string }; params?: any }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = String(data.params?.id || "");
  const code = await models.bonusCode.findByPk(id);
  if (!code) throw createError({ statusCode: 404, message: "Code not found." });

  const claims = await models.bonusRedemption.count({ where: { bonusCodeId: id } });
  if (claims > 0) {
    throw createError({
      statusCode: 409,
      message: `${code.code} has been used ${claims} time${claims === 1 ? "" : "s"}. Pause it instead — deleting it would remove the record of what was paid out.`,
    });
  }

  await models.bonusCode.destroy({ where: { id } });
  return { message: `${code.code} deleted.` };
};
