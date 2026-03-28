import type { TwitterComment } from "../contracts/person2Contracts.js";
import { readJsonFile } from "../util/jsonFile.js";

export interface TwitterCommentsSource {
  getComments(postUrl: string, limit: number): Promise<TwitterComment[]>;
}

export class FileTwitterCommentsSource implements TwitterCommentsSource {
  constructor(private readonly filePath: string) {}

  async getComments(_postUrl: string, limit: number): Promise<TwitterComment[]> {
    const payload = await readJsonFile<unknown>(this.filePath);
    const comments = normalizeComments(payload);
    return comments.slice(0, limit);
  }
}

export class HttpTwitterCommentsSource implements TwitterCommentsSource {
  constructor(private readonly endpoint: string) {}

  async getComments(postUrl: string, limit: number): Promise<TwitterComment[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set("post_url", postUrl);
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Twitter comments fetch failed (${response.status}).`);
    }

    const payload = (await response.json()) as unknown;
    const comments = normalizeComments(payload);
    return comments.slice(0, limit);
  }
}

export class StaticTwitterCommentsSource implements TwitterCommentsSource {
  constructor(private readonly comments: TwitterComment[]) {}

  async getComments(_postUrl: string, limit: number): Promise<TwitterComment[]> {
    return this.comments.slice(0, limit);
  }
}

function normalizeComments(payload: unknown): TwitterComment[] {
  if (Array.isArray(payload)) {
    return payload.map((comment, index) => normalizeComment(comment, index));
  }

  if (isObject(payload) && Array.isArray(payload.comments)) {
    return payload.comments.map((comment, index) => normalizeComment(comment, index));
  }

  throw new Error("Comments payload must be an array or an object with a comments array.");
}

function normalizeComment(input: unknown, index: number): TwitterComment {
  if (!isObject(input)) {
    throw new Error(`Comment at index ${index} must be an object.`);
  }

  const id = toStringValue(input.id, `comment_${index}`);
  const userTwitterId = toStringValue(input.user_twitter_id ?? input.author ?? input.username, `anon_${index}`);
  const text = toStringValue(input.text ?? input.body, "");
  const likeCount = toNumberValue(input.like_count ?? input.likes ?? 0, 0);
  const createdAt = toStringValue(input.created_at ?? input.timestamp, new Date().toISOString());

  return {
    id,
    user_twitter_id: userTwitterId,
    text,
    like_count: likeCount,
    created_at: createdAt,
  };
}

function toStringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toNumberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
