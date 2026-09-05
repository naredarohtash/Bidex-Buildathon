/**
 * What the payment provider screen is allowed to know.
 *
 * There is deliberately no way to read a stored secret back, from here or
 * anywhere else. The screen gets whether each value is set, its last four
 * characters, and where it came from — enough to recognise which key is in
 * place and to see that saving worked, and useless to anyone who obtains the
 * response.
 *
 * That is the difference between a secret an admin can verify and a secret an
 * admin can leak. A screen that fills its own fields with the real values hands
 * them to every browser extension, every screenshot and every session that
 * reaches the page.
 */

import { createError } from "@b/utils/error";
import { getProviderConfig, maskTail } from "../../../finance/provider-config";

export const metadata: OperationObject = {
  summary: "Payment provider status",
  operationId: "getPaymentProvider",
  tags: ["Admin", "Finance"],
  description: "Whether deposit credentials are configured. Never returns the credentials.",
  requiresAuth: true,
  permission: "edit.deposit",
  responses: {
    200: { description: "Provider status" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
};

export default async (data: { user?: { id: string } }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const config = await getProviderConfig();
  const ready = Boolean(config.apiKey && config.ipnSecret);

  return {
    provider: "NOWPayments",
    ready,
    apiKeySet: Boolean(config.apiKey),
    ipnSecretSet: Boolean(config.ipnSecret),
    apiKeyHint: maskTail(config.apiKey),
    ipnSecretHint: maskTail(config.ipnSecret),
    ipnUrl: config.ipnUrl,
    /* Which of the two places the values came from. An admin wondering why
       saving changed nothing needs to be told the environment is overriding
       them, rather than left to conclude the screen is broken. */
    source: config.source,
    envManaged: config.source === "env",
    /* The callback URL is not a secret and has to be pasted into the
       provider's dashboard, so it is offered here rather than left to be
       reconstructed by hand. */
    suggestedIpnUrl:
      config.ipnUrl ||
      (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_PUBLIC_URL || "").replace(/\/$/, "") +
        "/api/finance/deposit/ipn",
  };
};
