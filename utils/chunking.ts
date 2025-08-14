import { Document, Chunk } from '../types/rag';

export interface ChunkingConfig {
  maxChunkSize: number;
  overlap: number;
  separators?: string[];
}

export class TextChunker {
  private readonly config: ChunkingConfig;

  constructor(config: ChunkingConfig) {
    this.config = {
      ...config,
      separators: config.separators ?? ['\n\n', '\n', '. ', '! ', '? ', ' ']
    };
  }

  /**
   * Divise un document en chunks
   */
  chunkDocument(document: Document): Chunk[] {
    const chunks = this._splitText(document.content);
    
    return chunks.map((content, index) => ({
      id: `${document.id}_chunk_${index}`,
      content: content.trim(),
      metadata: {
        ...document.metadata,
        chunkIndex: index,
        totalChunks: chunks.length
      }
    }));
  }

  /**
   * Divise plusieurs documents en chunks
   */
  chunkDocuments(documents: Document[]): Chunk[] {
    return documents.flatMap(doc => this.chunkDocument(doc));
  }

  /**
   * Divise le texte en utilisant les séparateurs hiérarchiques
   */
  private _splitText(text: string): string[] {
    if (text.length <= this.config.maxChunkSize) {
      return [text];
    }

    // Essaie chaque séparateur dans l'ordre de priorité
    for (const separator of this.config.separators!) {
      const chunks = this._splitBySeparator(text, separator);
      if (chunks.length > 1) {
        // Récursivement divise les chunks trop grands
        return chunks.flatMap(chunk => 
          chunk.length > this.config.maxChunkSize 
            ? this._splitText(chunk)
            : [chunk]
        );
      }
    }

    // Fallback: division par caractères si aucun séparateur ne fonctionne
    return this._splitByCharacters(text);
  }

  /**
   * Divise le texte par un séparateur spécifique avec overlap
   */
  private _splitBySeparator(text: string, separator: string): string[] {
    const parts = text.split(separator);
    if (parts.length <= 1) return [text];

    const chunks: string[] = [];
    let currentChunk = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] + (i < parts.length - 1 ? separator : '');
      
      if ((currentChunk + part).length <= this.config.maxChunkSize) {
        currentChunk += part;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        
        // Commence le nouveau chunk avec overlap si possible
        currentChunk = this._addOverlap(chunks, part);
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Division par caractères en dernier recours
   */
  private _splitByCharacters(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.config.maxChunkSize;
      
      // Essaie de couper à un espace pour éviter de couper les mots
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) {
          end = lastSpace;
        }
      }

      const chunk = text.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      start = Math.max(start + 1, end - this.config.overlap);
    }

    return chunks;
  }

  /**
   * Ajoute l'overlap du chunk précédent
   */
  private _addOverlap(existingChunks: string[], newPart: string): string {
    if (existingChunks.length === 0 || this.config.overlap === 0) {
      return newPart;
    }

    const lastChunk = existingChunks[existingChunks.length - 1];
    const overlapText = lastChunk.slice(-this.config.overlap);
    
    return overlapText + newPart;
  }

  /**
   * Estime le nombre de chunks pour un texte
   */
  estimateChunkCount(text: string): number {
    if (text.length <= this.config.maxChunkSize) {
      return 1;
    }

    // Estimation approximative
    const avgChunkSize = this.config.maxChunkSize - (this.config.overlap / 2);
    return Math.ceil(text.length / avgChunkSize);
  }

  /**
   * Valide la configuration de chunking
   */
  validateConfig(): void {
    if (this.config.maxChunkSize <= 0) {
      throw new Error('maxChunkSize doit être positif');
    }

    if (this.config.overlap < 0) {
      throw new Error('overlap ne peut pas être négatif');
    }

    if (this.config.overlap >= this.config.maxChunkSize) {
      throw new Error('overlap doit être inférieur à maxChunkSize');
    }
  }
}