/**
 * Saving payment provider credentials, and testing them.
 *
 * The API key is tested against the provider before it is stored, because a
 * key that does not work is indistinguishable from one that does until a real
 * trader tries to deposit — and the first person to find out would be a
 * customer, not an operator. A key that fails is reported and not saved.
 *
 * The IPN secret cannot be tested the same way: nothing verifies it until a
 * genuine callback arrives, and a wrong one rejects every callback silently
 * while payments still open normally. That failure is invisible from this
 * screen, so it is stated on it.
 */

import { createError } from "@b/utils/error";
import { saveProviderConfig, clearProviderConfig, getProviderConfig } from "../../../finance/provider-config";

export const metadata: OperationObject = {
  summary: "Save payment provider credentials",
  operationId: "savePaymentProvider",
  tags: ["Admin", "Finance"],
  description: "Stores encrypted deposit credentials after checking the API key works.",
  requiresAuth: true,
  permission: "edit.deposit",
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            apiKey: { type: "string", description: "Blank leaves the stored key unchanged." },
            ipnSecret: { type: "string", description: "Blank leaves the stored secret unchanged." },
            ipnUrl: { type: "string" },
            action: { type: "string", enum: ["save", "test", "clear"] },
          },
        },
      },
    },
  },
  responses: {
    200: { description: "Saved or tested" },
    400: { description: "Invalid or unusable credentials" },
  },
};

/**
 * Ask the provider whether a key is real, without storing it first.
 *
 * Choosing the endpoint took three attempts and the failures are worth
 * recording, because each looked correct:
 *
 *   /balance is IP-restricted. A perfectly good key came back 403 "Invalid IP",
 *   so the screen told an operator their key was rejected when it was not.
 *
 *   /currencies answers 200 to ANY key, including an empty string. A check
 *   built on it would accept whatever was pasted, which is worse than no check
 *   — it would confirm a typo as working and leave the failure to surface when
 *   a real trader tried to deposit.
 *
 * Fetching a payment that does not exist is the one that actually separates
 * them: a valid key gets 404 (no such payment), an invalid key never reaches
 * the lookup and gets 401/403. Nothing is created and nothing is charged.
 */
async function keyWorks(apiKey: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch("https://api.nowpayments.io/v1/payment/1", {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: "The provider rejected that API key. Check it and try again." };
    }
    /* Everything else means the key got past authentication. 404 is the
       expected answer and 200 would mean that payment happens to exist; both
       prove the key works, which is all this needs to establish. */
    return { ok: true, detail: "Key accepted by the provider." };
  } catch (err: any) {
    /* Unreachable is not the same as invalid, and saying so matters: an
       operator told "rejected" will go and regenerate a key that was fine. */
    return {
      ok: false,
      detail: `Could not reach the provider to check the key (${err?.name || "network error"}). Your key may be fine — try again shortly.`,
    };
  }
}

export default async (data: { user?: { id: string }; body?: any }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const action = String(data.body?.action || "save");
  const apiKey = String(data.body?.apiKey || "").trim();
  const ipnSecret = String(data.body?.ipnSecret || "").trim();
  const ipnUrl = String(data.body?.ipnUrl || "").trim();

  if (action === "clear") {
    await clearProviderConfig();
    return { ok: true, message: "Credentials removed. Crypto deposits are now disabled." };
  }

  if (action === "test") {
    // Tests the pasted key if there is one, otherwise whatever is stored.
    const current = await getProviderConfig();
    const target = apiKey || current.apiKey;
    if (!target) throw createError({ statusCode: 400, message: "No API key to test." });
    const result = await keyWorks(target);
    return { ok: result.ok, message: result.detail };
  }

  if (apiKey) {
    const result = await keyWorks(apiKey);
    if (!result.ok) throw createError({ statusCode: 400, message: result.detail });
  }

  if (ipnUrl && !/^https:\/\/.+/i.test(ipnUrl)) {
    /* Refused rather than corrected. A callback carrying payment data over
       plain http is readable in transit, and the provider will not post to it
       anyway — so a silent fix would just move the confusion later. */
    throw createError({ statusCode: 400, message: "The callback URL must start with https://" });
  }

  const saved = await saveProviderConfig({ apiKey, ipnSecret, ipnUrl });
  if (!saved.ok) throw createError({ statusCode: 400, message: saved.error });

  const after = await getProviderConfig();
  return {
    ok: true,
    ready: Boolean(after.apiKey && after.ipnSecret),
    message:
      after.apiKey && after.ipnSecret
        ? "Saved. Crypto deposits are enabled."
        : "Saved, but crypto deposits stay off until both the API key and the IPN secret are set.",
  };
};
