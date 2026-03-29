import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import type { LanguageModel, JsonGenerationRequest, JsonInputContentBlock } from "./LanguageModel.js";

export interface BedrockNovaLiteConfig {
  region: string;
  model_id?: string;
}

export class BedrockNovaLiteModel implements LanguageModel {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(config: BedrockNovaLiteConfig) {
    this.client = new BedrockRuntimeClient({ region: config.region });
    this.modelId = config.model_id ?? "amazon.nova-lite-v1:0";
  }

  async generateJson<T>(request: JsonGenerationRequest): Promise<T> {
    const userContent = this.buildUserContentBlocks(request);
    const command = new ConverseCommand({
      modelId: this.modelId,
      system: [{ text: request.system_prompt }],
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      inferenceConfig: {
        temperature: request.temperature ?? 0.2,
        maxTokens: request.max_tokens ?? 600,
      },
    });

    const response = await this.client.send(command);
    const text = this.extractText(response.output?.message?.content);
    if (!text) {
      throw new Error("Bedrock returned an empty completion.");
    }

    const jsonPayload = extractJsonPayload(text);
    return JSON.parse(jsonPayload) as T;
  }

  private buildUserContentBlocks(request: JsonGenerationRequest): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    for (const block of request.user_content_blocks ?? []) {
      const converted = this.toConverseContentBlock(block);
      if (converted) {
        blocks.push(converted);
      }
    }

    blocks.push({
      text: `${request.user_prompt}\n\nReturn valid JSON only. Match this shape:\n${request.json_schema_hint}`,
    } as ContentBlock);

    return blocks;
  }

  private toConverseContentBlock(block: JsonInputContentBlock): ContentBlock | null {
    if (!block || typeof block !== "object" || typeof block.type !== "string") {
      return null;
    }

    if (block.type === "text") {
      return { text: block.text } as ContentBlock;
    }

    if (block.type === "image") {
      return {
        image: {
          format: block.format,
          source: {
            bytes: block.bytes,
          },
        },
      } as ContentBlock;
    }

    if (block.type === "video") {
      return {
        video: {
          format: block.format,
          source: {
            bytes: block.bytes,
          },
        },
      } as ContentBlock;
    }

    return null;
  }

  private extractText(content: unknown): string {
    if (!Array.isArray(content)) {
      return "";
    }

    const chunks: string[] = [];
    for (const block of content) {
      if (typeof block === "object" && block !== null && "text" in block) {
        const textValue = (block as { text?: unknown }).text;
        if (typeof textValue === "string") {
          chunks.push(textValue);
        }
      }
    }

    return chunks.join("\n").trim();
  }
}

export function extractJsonPayload(modelText: string): string {
  const trimmed = modelText.trim();
  if (trimmed.startsWith("```")) {
    const withoutFenceStart = trimmed.replace(/^```(?:json)?/i, "").trim();
    const withoutFenceEnd = withoutFenceStart.replace(/```$/i, "").trim();
    return withoutFenceEnd;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error(`No JSON object found in model response: ${trimmed.slice(0, 200)}`);
}
