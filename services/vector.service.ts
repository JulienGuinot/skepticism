import { Chunk, VectorStoreConfig } from '../types/rag';

export class VectorStore {
  private chunks: Map<string, Chunk> = new Map();
  private readonly config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  /**
   * Ajoute des chunks au store
   */
  async addChunks(chunks: Chunk[]): Promise<void> {
    for (const chunk of chunks) {
      if (!chunk.embedding) {
        throw new Error(`Chunk ${chunk.id} n'a pas d'embedding`);
      }
      
      if (chunk.embedding.length !== this.config.dimensions) {
        throw new Error(`Dimension embedding incorrecte pour chunk ${chunk.id}`);
      }

      this.chunks.set(chunk.id, chunk);
    }
  }

  /**
   * Recherche les chunks les plus similaires
   */
  async search(queryEmbedding: number[], topK: number = 5, threshold: number = 0.7): Promise<Array<Chunk & { similarity: number }>> {
    if (queryEmbedding.length !== this.config.dimensions) {
      throw new Error('Dimension du query embedding incorrecte');
    }

    const results: Array<Chunk & { similarity: number }> = [];

    for (const chunk of this.chunks.values()) {
      if (!chunk.embedding) continue;

      const similarity = this._calculateSimilarity(queryEmbedding, chunk.embedding);
      
      if (similarity >= threshold) {
        results.push({
          ...chunk,
          similarity
        });
      }
    }

    // Trie par similarité décroissante et prend les topK
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Supprime des chunks par ID
   */
  async removeChunks(chunkIds: string[]): Promise<void> {
    for (const id of chunkIds) {
      this.chunks.delete(id);
    }
  }

  /**
   * Supprime tous les chunks d'une source
   */
  async removeBySource(source: string): Promise<void> {
    const toRemove: string[] = [];
    
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.metadata.url === source || chunk.metadata.title === source) {
        toRemove.push(id);
      }
    }

    await this.removeChunks(toRemove);
  }

  /**
   * Obtient un chunk par ID
   */
  async getChunk(id: string): Promise<Chunk | undefined> {
    return this.chunks.get(id);
  }

  /**
   * Liste tous les chunks
   */
  async listChunks(): Promise<Chunk[]> {
    return Array.from(this.chunks.values());
  }

  /**
   * Obtient les statistiques du store
   */
  async getStats(): Promise<{
    totalChunks: number;
    sources: Array<{ source: string; count: number }>;
    dimensions: number;
  }> {
    const sources = new Map<string, number>();
    
    for (const chunk of this.chunks.values()) {
      const source = chunk.metadata.url || chunk.metadata.title || 'unknown';
      sources.set(source, (sources.get(source) || 0) + 1);
    }

    return {
      totalChunks: this.chunks.size,
      sources: Array.from(sources.entries()).map(([source, count]) => ({ source, count })),
      dimensions: this.config.dimensions
    };
  }

  /**
   * Vide complètement le store
   */
  async clear(): Promise<void> {
    this.chunks.clear();
  }

  /**
   * Calcule la similarité entre deux vecteurs
   */
  private _calculateSimilarity(vec1: number[], vec2: number[]): number {
    switch (this.config.similarity) {
      case 'cosine':
        return this._cosineSimilarity(vec1, vec2);
      case 'euclidean':
        return this._euclideanSimilarity(vec1, vec2);
      case 'dot':
        return this._dotProduct(vec1, vec2);
      default:
        throw new Error(`Méthode de similarité non supportée: ${this.config.similarity}`);
    }
  }

  private _cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
  }

  private _euclideanSimilarity(vec1: number[], vec2: number[]): number {
    const distance = Math.sqrt(
      vec1.reduce((sum, val, i) => sum + Math.pow(val - vec2[i], 2), 0)
    );
    // Convertit la distance en similarité (plus proche de 1 = plus similaire)
    return 1 / (1 + distance);
  }

  private _dotProduct(vec1: number[], vec2: number[]): number {
    return vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  }
}