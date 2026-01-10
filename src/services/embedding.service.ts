import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingService {
  private client: OpenAI | null = null;
  private readonly model = 'text-embedding-ada-002';
  private readonly dimensions = 1536;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  getEmbeddingDimensions(): number {
    return this.dimensions;
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.client) {
      console.warn('[EmbeddingService] OpenAI client not initialized - OPENAI_API_KEY not set');
      return null;
    }

    if (!text || text.trim().length === 0) {
      console.warn('[EmbeddingService] Empty text provided for embedding');
      return null;
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text.trim(),
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embedding:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  async generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.client) {
      console.warn('[EmbeddingService] OpenAI client not initialized - OPENAI_API_KEY not set');
      return texts.map(() => null);
    }

    const validTexts = texts.filter(t => t && t.trim().length > 0);
    if (validTexts.length === 0) {
      return texts.map(() => null);
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: validTexts.map(t => t.trim()),
      });

      const embeddingMap = new Map<string, number[]>();
      validTexts.forEach((text, index) => {
        embeddingMap.set(text.trim(), response.data[index].embedding);
      });

      return texts.map(text => {
        if (!text || text.trim().length === 0) return null;
        return embeddingMap.get(text.trim()) || null;
      });
    } catch (error) {
      console.error('[EmbeddingService] Failed to generate embeddings:', error instanceof Error ? error.message : error);
      return texts.map(() => null);
    }
  }
}
