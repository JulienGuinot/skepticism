
import { OllamaConfig } from '../types/rag';

export class OllamaService {
    private readonly config: Required<OllamaConfig> & { embeddingModel: string };

    constructor(config: OllamaConfig) {
        this.config = {
            baseUrl: config.baseUrl ?? 'http://localhost:11434',
            model: config.model,
            embeddingModel: config.embeddingModel ?? 'nomic-embed-text',
            temperature: config.temperature ?? 0.7,
            maxTokens: config.maxTokens ?? 2048
        };
    }

    /**
     * Génère des embeddings pour un texte
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            // Vérification du modèle d'abord
            await this._ensureModelExists();

            const response = await fetch(`${this.config.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.config.embeddingModel,
                    prompt: text.trim()
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ollama embedding error:', errorText);
                throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data: any = await response.json();

            if (!data.embedding || !Array.isArray(data.embedding)) {
                throw new Error('Format de réponse embedding invalide');
            }

            return data.embedding;
        } catch (error: any) {
            throw new Error(`Erreur génération embedding: ${error.message}`);
        }
    }

    /**
     * Génère des embeddings pour plusieurs textes
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        const embeddings = await Promise.all(
            texts.map(text => this.generateEmbedding(text))
        );
        return embeddings;
    }

    /**
     * Génère une réponse avec le contexte fourni
     */
    async generateResponse(prompt: string, context: string[]): Promise<string> {
        try {
            const systemPrompt = this._buildSystemPrompt();
            const userPrompt = this._buildUserPrompt(prompt, context);

            const response = await fetch(`${this.config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.config.model,
                    prompt: `${systemPrompt}\n\n${userPrompt}`,
                    stream: false,
                    options: {
                        temperature: this.config.temperature,
                        num_predict: this.config.maxTokens,
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }

            const data: any = await response.json();
            return data.response;
        } catch (error: any) {
            throw new Error(`Erreur génération réponse: ${error.message}`);
        }
    }

    /**
     * Vérifie si Ollama est disponible
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Liste les modèles disponibles
     */
    async listModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.config.baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status}`);
            }

            const data: any = await response.json();
            return data.models?.map((model: any) => model.name) || [];
        } catch (error: any) {
            throw new Error(`Erreur liste modèles: ${error.message}`);
        }
    }

    /**
     * Vérifie qu'un modèle existe et le télécharge si nécessaire
     */
    private async _ensureModelExists(): Promise<void> {
        try {
            const models = await this.listModels();
            const embeddingModelExists = models.some(model =>
                model === this.config.embeddingModel || model.startsWith(this.config.embeddingModel + ':')
            );

            if (!embeddingModelExists) {
                console.log(`Modèle d'embedding ${this.config.embeddingModel} non trouvé. Modèles disponibles:`, models);
                throw new Error(`Modèle d'embedding '${this.config.embeddingModel}' non installé. Installez-le avec: ollama pull ${this.config.embeddingModel}`);
            }
        } catch (error: any) {
            if (error.message.includes('non installé')) {
                throw error;
            }
            console.warn('Impossible de vérifier les modèles:', error.message);
        }
    }

    /**
     * Teste la génération d'embedding avec un texte simple
     */
    async testEmbedding(): Promise<{ success: boolean; error?: string; dimensions?: number }> {
        try {
            const testText = "test";
            const embedding = await this.generateEmbedding(testText);
            return {
                success: true,
                dimensions: embedding.length
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    private _buildSystemPrompt(): string {
        return `You are an AI assistant specialized in research and information analysis.
    Your role is to answer questions using only the information provided in the context.

    Instructions:

        Base your answers on the provided context

        If the information is not in the context, clearly state it

        Be precise and concise, but keep a humorous tone, add emojis

        No need for greetings or polite formulas — just give the answer, directly

        Structure your answer clearly in Markdown format

        `
            
        ;
    }

    private _buildUserPrompt(query: string, context: string[]): string {
        const contextText = context
            .map((chunk, index) => `[Source ${index + 1}]\n${chunk}`)
            .join('\n\n---\n\n');

        return `Contexte:
${contextText}

Question: ${query}

Réponse:`;
    }

    get modelName(): string {
        return this.config.model;
    }
}