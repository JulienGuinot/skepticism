import { OllamaService } from './ollama.service';
import { VectorStore } from './vector.service';
import { WebSearch } from './websearch.service';
import { TextChunker } from '../utils/chunking';
import { extractTopics, TopicExtractionOptions } from '../utils/stopwords';
import { 
  Document, 
  Chunk, 
  SearchQuery, 
  RAGResponse, 
  RAGConfig 
} from '../types/rag';
import { ExtractedContent } from '../types/webSearch';

export class RAGService {
  private readonly ollama: OllamaService;
  private readonly vectorStore: VectorStore;
  private readonly webSearch: WebSearch;
  private readonly chunker: TextChunker;
  private readonly config: RAGConfig;

  constructor(config: RAGConfig) {
    this.config = config;
    this.ollama = new OllamaService(config.ollama);
    this.vectorStore = new VectorStore(config.vectorStore);
    this.webSearch = new WebSearch();
    this.chunker = new TextChunker(config.chunking);
  }

  /**
   * Initialise le service RAG
   */
  async initialize(): Promise<void> {
    const isOllamaAvailable = await this.ollama.isAvailable();
    if (!isOllamaAvailable) {
      throw new Error('Ollama n\'est pas disponible. Vérifiez que le service est démarré.');
    }

    console.log(`RAG initialisé avec le modèle: ${this.ollama.modelName}`);
  }

  /**
   * Ajoute du contenu au RAG depuis une recherche web intelligente
   */
  async addFromWebSearch(
    query: string, 
    maxResults: number = 5,
    useSmartSearch: boolean = true,
    silent: boolean = false
  ): Promise<{
    documentsAdded: number;
    topicAnalysis?: ReturnType<typeof extractTopics>;
  }> {
    try {
      if (!silent) console.log(`🔍 Recherche web pour: "${query}"`);
      
      let extractedContents: ExtractedContent[];
      let topicAnalysis: ReturnType<typeof extractTopics> | undefined;

      if (useSmartSearch) {
        // Utilise la recherche intelligente avec suppression des stop words
        const smartResult = await this.webSearch.smartSearch(query, 'duckduckgo', {
          language: 'both',
          minWordLength: 3,
          maxTopics: 6,
          preserveCapitalized: true
        });
        
        extractedContents = smartResult.results;
        topicAnalysis = smartResult.topicAnalysis;
        
        if (!silent) {
          console.log(`📊 Sujets identifiés: ${topicAnalysis.topics.join(', ')}`);
          console.log(`🗑️ Stop words supprimés: ${topicAnalysis.removedWords.join(', ')}`);
        }
      } else {
        // Recherche classique
        extractedContents = await this.webSearch.searchAndExtract(query);
      }

      const successfulContents = extractedContents
        .filter(content => content.success && content.content.length > 100)
        .slice(0, maxResults);

      if (successfulContents.length === 0) {
        throw new Error('Aucun contenu valide trouvé lors de la recherche web');
      }

      const documents = this._convertToDocuments(successfulContents);
      await this.addDocuments(documents);

      if (!silent) console.log(`✅ ${documents.length} documents ajoutés au RAG`);

      return {
        documentsAdded: documents.length,
        topicAnalysis
      };

    } catch (error: any) {
      throw new Error(`Erreur ajout contenu web: ${error.message}`);
    }
  }

  /**
   * Recherche exhaustive avec plusieurs variantes de sujets
   */
  async addFromComprehensiveSearch(
    query: string,
    options: {
      maxResults?: number;
      maxVariants?: number;
      topicOptions?: TopicExtractionOptions;
      silent?: boolean;
    } = {}
  ): Promise<{
    documentsAdded: number;
    topicAnalysis: ReturnType<typeof extractTopics>;
    searchVariants: string[];
  }> {
    try {
      const { maxResults = 8, maxVariants = 3, topicOptions = {}, silent = false } = options;

      if (!silent) console.log(`🔍 Recherche exhaustive pour: "${query}"`);

      const comprehensiveResult = await this.webSearch.comprehensiveSearch(
        query,
        'duckduckgo',
        {
          maxVariants,
          topicOptions: {
            language: 'both',
            minWordLength: 3,
            maxTopics: 6,
            ...topicOptions
          },
          deduplicateResults: true
        }
      );

      const successfulContents = comprehensiveResult.allResults
        .filter(content => content.success && content.content.length > 100)
        .slice(0, maxResults);

      if (successfulContents.length === 0) {
        throw new Error('Aucun contenu valide trouvé lors de la recherche exhaustive');
      }

      const documents = this._convertToDocuments(successfulContents);
      await this.addDocuments(documents);

      if (!silent) console.log(`✅ Recherche exhaustive terminée: ${documents.length} documents ajoutés`);

      return {
        documentsAdded: documents.length,
        topicAnalysis: comprehensiveResult.topicAnalysis,
        searchVariants: comprehensiveResult.resultsByVariant.map(r => r.variant)
      };

    } catch (error: any) {
      throw new Error(`Erreur recherche exhaustive: ${error.message}`);
    }
  }

  /**
   * Ajoute des documents au RAG
   */
  async addDocuments(documents: Document[]): Promise<void> {
    try {
      // Chunking des documents
      const chunks = this.chunker.chunkDocuments(documents);

      // Génération des embeddings
      const contents = chunks.map(chunk => chunk.content);
      const embeddings = await this.ollama.generateEmbeddings(contents);


      // Ajout des embeddings aux chunks
      const chunksWithEmbeddings: Chunk[] = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index]
      }));

      // Stockage dans le vector store
      await this.vectorStore.addChunks(chunksWithEmbeddings);
      
    } catch (error: any) {
      throw new Error(`Erreur ajout documents: ${error.message}`);
    }
  }

  /**
   * Effectue une recherche RAG
   */
  async search(searchQuery: SearchQuery): Promise<RAGResponse> {
    try {
      const startTime = Date.now();
      

      // On normalise l'input
      console.log(searchQuery.query)
      const normalizedInput = this._normalizeText(searchQuery.query)
      console.log(normalizedInput)
      // Génère l'embedding de la requête
      const queryEmbedding = await this.ollama.generateEmbedding(normalizedInput);
      
      // Recherche dans le vector store
      const topK = searchQuery.topK ?? this.config.retrieval.topK;
      const threshold = searchQuery.threshold ?? this.config.retrieval.threshold;
      
      let relevantChunks = await this.vectorStore.search(queryEmbedding, topK, threshold);
      
      // Recherche web additionnelle si demandée et pas assez de résultats
      if (searchQuery.includeWebSearch && relevantChunks.length < topK) {
        await this._enhanceWithWebSearch(searchQuery, topK - relevantChunks.length);
        // Re-recherche après ajout du contenu web
        relevantChunks = await this.vectorStore.search(queryEmbedding, topK, threshold);
      }

      if (relevantChunks.length === 0) {
        return {
          answer: "Je n'ai pas trouvé d'informations pertinentes pour répondre à votre question.",
          sources: [],
          query: searchQuery.query,
          timestamp: new Date()
        };
      }

      // Génération de la réponse
      const context = relevantChunks.map(chunk => chunk.content);
      const answer = await this.ollama.generateResponse(searchQuery.query, context);

      const response: RAGResponse = {
        answer,
        sources: relevantChunks.map(chunk => ({
          content: chunk.content,
          metadata: chunk.metadata,
          similarity: chunk.similarity
        })),
        query: searchQuery.query,
        timestamp: new Date()
      };

      const duration = Date.now() - startTime;
      console.log(`\n Recherche RAG terminée en ${duration}ms avec ${relevantChunks.length} sources`);

      return response;
    } catch (error: any) {
      throw new Error(`Erreur recherche RAG: ${error.message}`);
    }
  }

  /**
   * Améliore les résultats avec une recherche web intelligente
   */
  private async _enhanceWithWebSearch(searchQuery: SearchQuery, additionalResults: number): Promise<void> {
    try {
      const webResults = searchQuery.webSearchResults ?? Math.min(additionalResults, 3);
      console.log(`🔍 Recherche web additionnelle intelligente: ${webResults} résultats`);
      
      // Utilise la recherche intelligente pour de meilleurs résultats
      const result = await this.addFromWebSearch(searchQuery.query, webResults, true);
      
      if (result.topicAnalysis) {
        console.log(`📈 Analyse des sujets: ${result.topicAnalysis.stats.stopWordsRemoved} stop words supprimés`);
      }
    } catch (error) {
      console.warn('⚠️ Erreur lors de la recherche web additionnelle:', error);
      // Continue sans la recherche web
    }
  }





  private _normalizeText(text:string) : string {
    return text
    .toLowerCase()                    // Casse uniforme
    .normalize('NFD')                 // Décompose les accents
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .replace(/[^\w\s]/g, ' ')        // Remplace ponctuation par espaces
    .replace(/\s+/g, ' ')            // Normalise les espaces
    .trim();
  }



  /**
   * Convertit le contenu extrait en documents
   */
  private _convertToDocuments(contents: ExtractedContent[]): Document[] {
    return contents.map((content, index) => ({
      id: `web_${Date.now()}_${index}`,
      content: content.content,
      metadata: {
        url: content.url,
        title: content.title,
        source: 'websearch' as const,
        timestamp: content.extractedAt
      }
    }));
  }

  /**
   * Obtient les statistiques du RAG
   */
  async getStats(): Promise<{
    vectorStore: Awaited<ReturnType<VectorStore['getStats']>>;
    config: RAGConfig;
    ollama: {
      model: string;
      available: boolean;
    };
  }> {
    const [vectorStats, ollamaAvailable] = await Promise.all([
      this.vectorStore.getStats(),
      this.ollama.isAvailable()
    ]);

    return {
      vectorStore: vectorStats,
      config: this.config,
      ollama: {
        model: this.ollama.modelName,
        available: ollamaAvailable
      }
    };
  }


  async removeSource(source: string): Promise<void> {
    await this.vectorStore.removeBySource(source);
    console.log(`Supprimé le contenu de la source: ${source}`);
  }


  async clear(): Promise<void> {
    await this.vectorStore.clear();
  }

  async listAvailableModels(): Promise<string[]> {
    return await this.ollama.listModels();
  }


  async diagnose(): Promise<{
    ollama: {
      available: boolean;
      models: string[];
      embeddingTest: { success: boolean; error?: string; dimensions?: number };
    };
    vectorStore: {
      chunks: number;
      sources: number;
    };
  }> {
    const [ollamaAvailable, models, embeddingTest, vectorStats] = await Promise.all([
      this.ollama.isAvailable(),
      this.ollama.listModels().catch(() => []),
      this.ollama.testEmbedding(),
      this.vectorStore.getStats()
    ]);

    return {
      ollama: {
        available: ollamaAvailable,
        models,
        embeddingTest
      },
      vectorStore: {
        chunks: vectorStats.totalChunks,
        sources: vectorStats.sources.length
      }
    };
  }
}