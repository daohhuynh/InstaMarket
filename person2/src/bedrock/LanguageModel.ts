export interface JsonGenerationRequest {
  system_prompt: string;
  user_prompt: string;
  json_schema_hint: string;
  temperature?: number;
  max_tokens?: number;
}

export interface LanguageModel {
  generateJson<T>(request: JsonGenerationRequest): Promise<T>;
}
