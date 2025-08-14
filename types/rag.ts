export interface Document {
  id: string;
  content: string;
  metadata: {
    url?: string;
    title?: string;
    source: 'websearch' | 'upload' | 'manual';
    timestamp: Date;
    chunkIndex?: number;
    totalChunks?: number;
  };
}

export interface Chunk {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Document['metadata'];
}

export interface SearchQuery {
  query: string;
  topK?: number;
  threshold?: number;
  includeWebSearch?: boolean;
  webSearchResults?: number;
}

export interface RAGResponse {
  answer: string;
  sources: Array<{
    content: string;
    metadata: Document['metadata'];
    similarity?: number;
  }>;
  query: string;
  timestamp: Date;
}

export interface OllamaConfig {
  baseUrl?: string;
  model: string;
  embeddingModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface VectorStoreConfig {
  dimensions: number;
  similarity: 'cosine' | 'euclidean' | 'dot';
}

export interface RAGConfig {
  ollama: OllamaConfig;
  vectorStore: VectorStoreConfig;
  chunking: {
    maxChunkSize: number;
    overlap: number;
  };
  retrieval: {
    topK: number;
    threshold: number;
  };
}