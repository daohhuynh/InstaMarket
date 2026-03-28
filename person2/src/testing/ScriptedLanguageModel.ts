import type { JsonGenerationRequest, LanguageModel } from "../bedrock/LanguageModel.js";

export class ScriptedLanguageModel implements LanguageModel {
  private readonly responses: unknown[];
  private cursor = 0;

  constructor(responses: unknown[]) {
    this.responses = responses;
  }

  async generateJson<T>(_request: JsonGenerationRequest): Promise<T> {
    if (this.cursor >= this.responses.length) {
      throw new Error("ScriptedLanguageModel exhausted: add more scripted responses for this test.");
    }

    const response = this.responses[this.cursor];
    this.cursor += 1;
    return response as T;
  }
}
