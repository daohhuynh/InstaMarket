export type JsonInputContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; format: "gif" | "jpeg" | "png" | "webp"; bytes: Uint8Array }
  | { type: "video"; format: "flv" | "mkv" | "mov" | "mp4" | "mpeg" | "mpg" | "three_gp" | "webm" | "wmv"; bytes: Uint8Array };

export interface JsonGenerationRequest {
  system_prompt: string;
  user_prompt: string;
  json_schema_hint: string;
  temperature?: number;
  max_tokens?: number;
  user_content_blocks?: JsonInputContentBlock[];
}

export interface LanguageModel {
  generateJson<T>(request: JsonGenerationRequest): Promise<T>;
}
