import {
  baseStringSchema,
  baseNumberSchema,
  baseBooleanSchema,
  baseDateTimeSchema,
} from "@b/utils/schema";

import { models } from "@b/db";
import ExchangeManager from "@b/utils/exchange";
import { loadBanStatus, handleBanStatus } from "../../utils";
import { createError } from "@b/utils/error";

export async function ensureNotBanned(): Promise<void> {
  const unblockTime = await loadBanStatus();
  if (await handleBanStatus(unblockTime)) {
    throw createError({
      statusCode: 503,
      message: "Service temporarily unavailable. Please try again later.",
    });
  }
}

export async function ensureExchange(): Promise<any> {
  await ensureNotBanned();
  const exchange = await ExchangeManager.startExchange();
  if (!exchange) {
    throw createError({
      statusCode: 503,
      message: "Service temporarily unavailable. Please try again later.",
    });
  }
  return exchange;
}

export const baseBinaryOrderSchema = {
  id: baseStringSchema(
    "ID of the binary order",
    undefined,
    undefined,
    false,
    undefined,
    "uuid"
  ),
  userId: baseStringSchema("User ID associated with the order"),
  symbol: baseStringSchema("Trading symbol"),
  price: baseNumberSchema("Entry price of the order"),
  amount: baseNumberSchema("Amount of the order"),
  profit: baseNumberSchema("Profit from the order"),
  side: baseStringSchema("Side of the order (e.g., BUY, SELL)"),
  type: baseStringSchema("Type of order (e.g., LIMIT, MARKET)"),
  status: baseStringSchema("Status of the order (e.g., OPEN, CLOSED)"),
  isDemo: baseBooleanSchema("Whether the order is a demo"),
  closedAt: baseDateTimeSchema("Time when the order was closed", true),
  closePrice: baseNumberSchema("Price at which the order was closed"),
  createdAt: baseDateTimeSchema("Creation date of the order"),
  updatedAt: baseDateTimeSchema("Last update date of the order", true),
};

export async function getBinaryOrder(
  userId: string,
  id: string
): Promise<any> {
  const response = await models.binaryOrder.findOne({
    where: {
      id,
      userId,
    },
  });

  if (!response) {
    throw new Error(`Binary order with ID ${id} not found`);
  }

  return response.get({ plain: true });
}

export async function getBinaryOrdersByStatus(
  status: any
): Promise<any[]> {
  return await models.binaryOrder.findAll({
    where: {
      status: status,
    },
  });
}
