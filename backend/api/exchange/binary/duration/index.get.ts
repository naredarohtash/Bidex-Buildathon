import { getBinarySettings } from "@b/utils/binary-settings-cache";
import {
  unauthorizedResponse,
  notFoundMetadataResponse,
  serverErrorResponse,
} from "@b/utils/query";
import Redis from "ioredis";

export const metadata: OperationObject = {
  summary: "List Available Binary Durations",
  operationId: "listBinaryDurations",
  tags: ["Exchange", "Binary"],
  description: "Retrieves a list of available durations for binary options with calculated profit percentages.",
  logModule: "EXCHANGE",
  logTitle: "Get Binary Durations",
  responses: {
    200: {
      description: "A list of binary durations with calculated profit percentages",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                duration: { type: "number" },
                profitPercentageRiseFall: { type: "number" },
                profitPercentageHigherLower: { type: "number" },
                profitPercentageTouchNoTouch: { type: "number" },
                profitPercentageCallPut: { type: "number" },
                profitPercentageTurbo: { type: "number" },
                status: { type: "boolean" },
              },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Binary Duration"),
    500: serverErrorResponse,
  },
};

const ORDER_TYPES = ["RISE_FALL", "HIGHER_LOWER", "TOUCH_NO_TOUCH", "CALL_PUT", "TURBO"] as const;

function applyAdjustment(percentage: number, adjustment: number): number {
  return adjustment === 0 ? percentage : Math.round(percentage * (1 + adjustment / 100));
}

function calculateCumulativeAdjustments(durations: any[]) {
  const sorted = [...durations].sort((a, b) => a.minutes - b.minutes);
  const cumulative = {
    RISE_FALL: 0,
    HIGHER_LOWER: 0,
    TOUCH_NO_TOUCH: 0,
    CALL_PUT: 0,
    TURBO: 0,
  };
  const adjustmentsMap = new Map<string, typeof cumulative>();

  for (const duration of sorted) {
    const overrides = duration.orderTypeOverrides || {};
    for (const orderType of ORDER_TYPES) {
      const adjustment = overrides[orderType]?.profitAdjustment || 0;
      if (adjustment !== 0) {
        cumulative[orderType] += adjustment;
      }
    }
    adjustmentsMap.set(duration.id, { ...cumulative });
  }
  return adjustmentsMap;
}

async function getOtcConfig(symbol: string) {
  if (!symbol || !symbol.toUpperCase().includes("OTC")) return null;
  const bidexSymbol = symbol.toUpperCase().endsWith("/OTC")
    ? symbol.slice(0, -4) + " (OTC)"
    : symbol.replace("_OTC", " (OTC)");
  const normalizedSymbol = bidexSymbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  
  const otcRedis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
  });

  try {
    const configStr = await otcRedis.get(`otc:pair:config:${normalizedSymbol}`);
    if (!configStr) return null;
    const config = JSON.parse(configStr);

    let payout = config.roi_configuration?.base_payout_percentage ?? 0.82;
    if (config.roi_configuration?.mode === 'DYNAMIC') {
      const exposureStr = await otcRedis.get(`otc:exposure:${normalizedSymbol}`);
      if (exposureStr) {
        const exposure = JSON.parse(exposureStr);
        const totalCalls = exposure.total_call_volume_usd || 0;
        const totalPuts = exposure.total_put_volume_usd || 0;
        const threshold = config.roi_configuration?.exposure_threshold_usd || 15000;
        const diff = Math.abs(totalCalls - totalPuts);
        if (diff > threshold) {
          const excess = diff - threshold;
          const reduction = Math.min(0.2, (excess / threshold) * 0.05); // max 20% reduction
          payout = Math.max(config.roi_configuration?.minimum_allowed_payout || 0.55, payout - reduction);
        }
      }
    }
    return {
      payout: Math.round(payout * 100), // convert e.g. 0.82 to 82
      status: config.status === 'ACTIVE'
    };
  } catch (error) {
    console.error("[OTC Config Bridge Error]:", error);
    return null;
  } finally {
    await otcRedis.quit().catch(() => {});
  }
}

function convertDurationToResponse(duration: any, settings: any, adjustments: any, otcConfig?: any) {
  const { orderTypes } = settings;
  const baseRiseFall = otcConfig ? otcConfig.payout : orderTypes.RISE_FALL.profitPercentage;
  const baseHigherLower = otcConfig ? otcConfig.payout : orderTypes.HIGHER_LOWER.profitPercentage;
  const baseTouchNoTouch = otcConfig ? otcConfig.payout : orderTypes.TOUCH_NO_TOUCH.profitPercentage;
  const baseCallPut = otcConfig ? otcConfig.payout : orderTypes.CALL_PUT.profitPercentage;
  const baseTurbo = otcConfig ? otcConfig.payout : orderTypes.TURBO.profitPercentage;

  const o = otcConfig ? baseRiseFall : applyAdjustment(baseRiseFall, adjustments.RISE_FALL);
  const a = otcConfig ? baseHigherLower : applyAdjustment(baseHigherLower, adjustments.HIGHER_LOWER);
  const i = otcConfig ? baseTouchNoTouch : applyAdjustment(baseTouchNoTouch, adjustments.TOUCH_NO_TOUCH);
  const s = otcConfig ? baseCallPut : applyAdjustment(baseCallPut, adjustments.CALL_PUT);
  const u = otcConfig ? baseTurbo : applyAdjustment(baseTurbo, adjustments.TURBO);

  return {
    id: duration.id,
    duration: duration.minutes,
    profitPercentageRiseFall: o,
    profitPercentageHigherLower: a,
    profitPercentageTouchNoTouch: i,
    profitPercentageCallPut: s,
    profitPercentageTurbo: u,
    profitPercentage: o,
    status: otcConfig ? (otcConfig.status && duration.enabled) : duration.enabled,
  };
}

export default async (data: Handler) => {
  const { ctx, query } = data;
  const symbol = query?.symbol;

  ctx?.step("Fetching binary settings");
  const settings = await getBinarySettings();
  const adjustments = calculateCumulativeAdjustments(settings.durations);

  const otcConfig = symbol ? await getOtcConfig(symbol) : null;

  const activeDurations = settings.durations
    .filter((d: any) => d.enabled)
    .sort((a: any, b: any) => a.minutes - b.minutes)
    .map((d: any) => {
      const adjustment = adjustments.get(d.id) || {
        RISE_FALL: 0,
        HIGHER_LOWER: 0,
        TOUCH_NO_TOUCH: 0,
        CALL_PUT: 0,
        TURBO: 0,
      };
      return convertDurationToResponse(d, settings, adjustment, otcConfig);
    });

  ctx?.success(`Retrieved ${activeDurations.length} binary durations`);
  return activeDurations;
};
