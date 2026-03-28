import { createHash } from "node:crypto";
import type { PersonaProfile, TwitterComment } from "../contracts/person2Contracts.js";

export interface BankrollRange {
  min_usdc: number;
  max_usdc: number;
}

export function buildPersonaFromComment(comment: TwitterComment, range: BankrollRange): PersonaProfile {
  const seed = `${comment.id}:${comment.user_twitter_id}:${comment.text}`;
  const bankroll = assignDeterministicBankroll(seed, range);

  return {
    user_twitter_id: comment.user_twitter_id,
    wallet_address: buildWalletAddress(seed),
    bankroll_usdc: bankroll,
    risk_tolerance: inferRiskTolerance(comment.like_count),
  };
}

export function assignDeterministicBankroll(seed: string, range: BankrollRange): number {
  const min = Math.max(1, Math.floor(range.min_usdc));
  const max = Math.max(min, Math.floor(range.max_usdc));

  const hash = createHash("sha256").update(seed).digest("hex");
  const intValue = Number.parseInt(hash.slice(0, 8), 16);
  const ratio = intValue / 0xffffffff;
  const bankroll = min + (max - min) * ratio;

  return Math.round(bankroll * 100) / 100;
}

function buildWalletAddress(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return `SIM_${hash.slice(0, 32)}`;
}

function inferRiskTolerance(likeCount: number): PersonaProfile["risk_tolerance"] {
  if (likeCount >= 200) {
    return "HIGH";
  }
  if (likeCount >= 40) {
    return "MEDIUM";
  }
  return "LOW";
}
