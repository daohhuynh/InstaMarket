import type { CLOBSubmissionResult } from "../contracts/person2Contracts.js";
import type { TradeExecution } from "../contracts/sharedSchemas.js";

export interface CLOBGateway {
  submitPaperTrade(trade: TradeExecution): Promise<CLOBSubmissionResult>;
}

export class NoopCLOBGateway implements CLOBGateway {
  async submitPaperTrade(_trade: TradeExecution): Promise<CLOBSubmissionResult> {
    return {
      accepted: true,
      reason: "dry-run",
    };
  }
}

export class HttpCLOBGateway implements CLOBGateway {
  constructor(private readonly endpoint: string) {}

  async submitPaperTrade(trade: TradeExecution): Promise<CLOBSubmissionResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(trade),
    });

    const body = await safeReadJson(response);

    if (!response.ok) {
      return {
        accepted: false,
        reason: `HTTP ${response.status}`,
        raw_response: body,
      };
    }

    if (isObject(body) && typeof body.accepted === "boolean") {
      return {
        accepted: body.accepted,
        order_id: typeof body.order_id === "string" ? body.order_id : undefined,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        raw_response: body,
      };
    }

    return {
      accepted: true,
      raw_response: body,
    };
  }
}

async function safeReadJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw_text: text };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
