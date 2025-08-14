import * as cheerio from "cheerio";
import { WebSearchConfig, ExtractedContent, SearchResult } from "../types/webSearch";
import { extractTopics, generateSearchVariants, analyzeTopicRelevance, TopicExtractionOptions } from "../utils/stopwords";

export class WebSearch {
  private readonly _userAgent: string;
  private readonly _config: Required<WebSearchConfig>;

  constructor(config: WebSearchConfig = {}) {
    this._userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    
    this._config = {
      maxResults: config.maxResults ?? 10,
      timeout: config.timeout ?? 15000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      minContentLength: config.minContentLength ?? 200,
      excludeDomains: config.excludeDomains ?? ['facebook.com', 'twitter.com', 'instagram.com'],
      includeDomains: config.includeDomains ?? []
    };
  }

  /**
   * Obtient les top URLs pour une requête donnée
   */
  async getTopUrls(query: string, searchEngine: 'google' | 'bing' | 'duckduckgo' = 'bing'): Promise<string[]> {
    try {
      this._validateQuery(query);

      const searchResults = await this._performSearch(query, searchEngine);
      const filteredResults = this._filterResults(searchResults);
      
      return filteredResults
        .slice(0, this._config.maxResults)
        .map(result => result.url);

    } catch (error: any) {
      throw new Error(`Erreur lors de la recherche: ${error.message}`);
    }
  }

  /**
   * Recherche intelligente avec suppression des stop words et recherche multi-sujets
   */
  async smartSearch(
    query: string, 
    searchEngine: 'google' | 'bing' | 'duckduckgo' = 'duckduckgo',
    topicOptions: TopicExtractionOptions = {}
  ): Promise<{
    results: ExtractedContent[];
    topicAnalysis: ReturnType<typeof extractTopics>;
    searchVariants: string[];
  }> {
    try {
      this._validateQuery(query);

      // Extraction des sujets principaux
      const topicAnalysis = extractTopics(query, {
        language: 'both',
        minWordLength: 3,
        maxTopics: 8,
        preserveCapitalized: true,
        ...topicOptions
      });

      console.log(`🔍 Analyse de la requête: "${query}"`);
      console.log(`📊 Sujets identifiés: ${topicAnalysis.topics.join(', ')}`);
      console.log(`🗑️ Mots supprimés: ${topicAnalysis.removedWords.join(', ')}`);

      // Génération des variantes de recherche
      const searchVariants = generateSearchVariants(topicAnalysis.topics);
      console.log(`🔄 Variantes de recherche: ${searchVariants.join(' | ')}`);

      // Analyse de pertinence
      const relevanceAnalysis = analyzeTopicRelevance(topicAnalysis.topics);
      const highRelevanceTopics = relevanceAnalysis
        .filter(t => t.category === 'high')
        .map(t => t.topic);

      // Recherche avec la requête optimisée (sujets de haute pertinence d'abord)
      const primaryQuery = highRelevanceTopics.length > 0 
        ? highRelevanceTopics.join(' ')
        : topicAnalysis.cleanedQuery;

      console.log(`🎯 Requête principale optimisée: "${primaryQuery}"`);

      // Recherche principale
      const results = await this.searchAndExtract(primaryQuery, searchEngine);

      return {
        results,
        topicAnalysis,
        searchVariants
      };

    } catch (error: any) {
      throw new Error(`Erreur lors de la recherche intelligente: ${error.message}`);
    }
  }

  /**
   * Extrait le contenu des URLs fournies
   */
  async extractContents(urls: string[]): Promise<ExtractedContent[]> {
    try {
      this._validateUrls(urls);

      const results = await Promise.allSettled(
        
        urls.map(url => 
          this._extractSingleContent(url)
        )

      );

      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            url: urls[index],
            title: '',
            content: '',
            headings: [],
            links: [],
            metadata: {},
            extractedAt: new Date(),
            success: false,
            error: result.reason?.message || 'Erreur inconnue'
          };
        }
      });

    } catch (error: any) {
      throw new Error(`Erreur lors de l'extraction du contenu: ${error.message}`);
    }
  }

  /**
   * Méthode combinée pour rechercher et extraire en une seule opération
   */
  async searchAndExtract(query: string, searchEngine: 'google' | 'bing' | 'duckduckgo' = 'duckduckgo'): Promise<ExtractedContent[]> {
    try {
      const urls = await this.getTopUrls(query, searchEngine);
      return await this.extractContents(urls);
    } catch (error: any) {
      throw new Error(`Erreur lors de la recherche et extraction: ${error.message}`);
    }
  }

  /**
   * Recherche exhaustive avec plusieurs variantes de requêtes
   */
  async comprehensiveSearch(
    query: string,
    searchEngine: 'google' | 'bing' | 'duckduckgo' = 'google',
    options: {
      maxVariants?: number;
      topicOptions?: TopicExtractionOptions;
      deduplicateResults?: boolean;
    } = {}
  ): Promise<{
    allResults: ExtractedContent[];
    resultsByVariant: Array<{
      variant: string;
      results: ExtractedContent[];
    }>;
    topicAnalysis: ReturnType<typeof extractTopics>;
  }> {
    try {
      const { maxVariants = 3, topicOptions = {}, deduplicateResults = true } = options;

      // Extraction des sujets
      const topicAnalysis = extractTopics(query, {
        language: 'both',
        minWordLength: 3,
        maxTopics: 6,
        ...topicOptions
      });

      // Génération des variantes limitées
      const searchVariants = generateSearchVariants(topicAnalysis.topics)
        .slice(0, maxVariants);

      console.log(`🔍 Recherche exhaustive pour: "${query}"`);
      console.log(`📝 Variantes: ${searchVariants.join(' | ')}`);

      // Recherche pour chaque variante
      const resultsByVariant = await Promise.all(
        searchVariants.map(async (variant) => {
          try {
            const results = await this.searchAndExtract(variant, searchEngine);
            return { variant, results };
          } catch (error) {
            console.warn(`⚠️ Erreur pour la variante "${variant}":`, error);
            return { variant, results: [] };
          }
        })
      );

      // Agrégation des résultats
      let allResults = resultsByVariant.flatMap(r => r.results);

      // Déduplication basée sur l'URL
      if (deduplicateResults) {
        const seenUrls = new Set<string>();
        allResults = allResults.filter(result => {
          if (seenUrls.has(result.url)) {
            return false;
          }
          seenUrls.add(result.url);
          return true;
        });
      }

      console.log(`✅ Recherche terminée: ${allResults.length} résultats uniques`);

      return {
        allResults,
        resultsByVariant,
        topicAnalysis
      };

    } catch (error: any) {
      throw new Error(`Erreur lors de la recherche exhaustive: ${error.message}`);
    }
  }

  /**
   * Effectue la recherche selon le moteur choisi
   */
  private async _performSearch(query: string, searchEngine: string): Promise<SearchResult[]> {
    switch (searchEngine) {
      case 'duckduckgo':
        return await this._searchDuckDuckGo(query);
      case 'google':
        return await this._searchGoogle(query);
      case 'bing':
        return await this._searchBing(query);
      default:
        throw new Error(`Moteur de recherche non supporté: ${searchEngine}`);
    }
  }

  /**
   * Recherche via DuckDuckGo (plus respectueux de la vie privée)
   */
  private async _searchDuckDuckGo(query: string): Promise<SearchResult[]> {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await this._fetchWithRetry(searchUrl);
    const $ = cheerio.load(response);
    const results: SearchResult[] = [];

    $('.result__body').each((index, element) => {
      const titleEl = $(element).find('.result__title a');
      const snippetEl = $(element).find('.result__snippet');
      
      const title = titleEl.text().trim();
      const url = titleEl.attr('href');
      const snippet = snippetEl.text().trim();

      if (title && url && snippet) {
        results.push({
          title,
          url: this._cleanUrl(url),
          snippet,
          rank: index + 1
        });
      }
    });

    return results;
  }

  /**
   * Recherche via Google (nécessite potentiellement une API key)
   */
  private async _searchGoogle(query: string): Promise<SearchResult[]> {
    // Implémentation simplifiée - en production, utilisez l'API Google Custom Search
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${this._config.maxResults}`;
    
    const response = await this._fetchWithRetry(searchUrl);
    const $ = cheerio.load(response);
    const results: SearchResult[] = [];

    $('div.g').each((index, element) => {
      const titleEl = $(element).find('h3');
      const linkEl = $(element).find('a').first();
      const snippetEl = $(element).find('.VwiC3b, .s3v9rd, .st');
      
      const title = titleEl.text().trim();
      const url = linkEl.attr('href');
      const snippet = snippetEl.text().trim();

      if (title && url && snippet && !url.startsWith('/search')) {
        results.push({
          title,
          url: this._cleanUrl(url),
          snippet,
          rank: index + 1
        });
      }
    });

    return results;
  }

  /**
   * Recherche via Bing
   */
  private async _searchBing(query: string): Promise<SearchResult[]> {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${this._config.maxResults}`;
    
    const response = await this._fetchWithRetry(searchUrl);
    const $ = cheerio.load(response);
    const results: SearchResult[] = [];

    $('.b_algo').each((index, element) => {
      const titleEl = $(element).find('h2 a');
      const snippetEl = $(element).find('.b_caption p, .b_dList');
      
      const title = titleEl.text().trim();
      const url = titleEl.attr('href');
      const snippet = snippetEl.text().trim();

      if (title && url && snippet) {
        results.push({
          title,
          url: this._cleanUrl(url),
          snippet,
          rank: index + 1
        });
      }
    });

    return results;
  }

  /**
   * Extrait le contenu d'une seule URL
   */
  private async _extractSingleContent(url: string): Promise<ExtractedContent> {
    try {
      //console.log(`Recherche sur ${url}`)
      const response = await this._fetchWithRetry(url);
      const $ = cheerio.load(response);

      // Supprime les scripts, styles et autres éléments non pertinents
      $('script, style, nav, header, footer, .advertisement, .ads, .social-share').remove();

      const content = this._extractMainContent($);
      const headings = this._extractHeadings($);
      const links = this._extractLinks($, url);
      const metadata = this._extractMetadata($);
      const title = $('title').text().trim() || $('h1').first().text().trim() || '';

      return {
        url,
        title,
        content,
        headings,
        links,
        metadata,
        extractedAt: new Date(),
        success: true
      };

    } catch (error: any) {
      throw new Error(`Erreur lors de l'extraction de ${url}: ${error.message}`);
    }
  }

  /**
   * Extrait le contenu principal de la page
   */
  private _extractMainContent($: cheerio.CheerioAPI): string {
    // Priorités pour trouver le contenu principal
    const selectors = [
      'article',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-body',
      'main',
      '.main-content'
    ];

    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        if (text.length >= this._config.minContentLength) {
          return this._cleanText(text);
        }
      }
    }

    // Fallback: prendre tout le texte du body
    const bodyText = $('body').text().trim();
    return this._cleanText(bodyText);
  }

  /**
   * Extrait les titres de la page
   */
  private _extractHeadings($: cheerio.CheerioAPI): string[] {
    const headings: string[] = [];
    
    $('h1, h2, h3, h4, h5, h6').each((_, element) => {
      const text = $(element).text().trim();
      if (text && text.length > 0) {
        headings.push(text);
      }
    });

    return headings;
  }

  /**
   * Extrait les liens de la page
   */
  private _extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const links: string[] = [];
    const baseUrlObj = new URL(baseUrl);

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          if (absoluteUrl.startsWith('http') && !links.includes(absoluteUrl)) {
            links.push(absoluteUrl);
          }
        } catch {
          // URL invalide, ignorée
        }
      }
    });

    return links.slice(0, 50); // Limite à 50 liens
  }

  /**
   * Extrait les métadonnées de la page
   */
  private _extractMetadata($: cheerio.CheerioAPI): ExtractedContent['metadata'] {
    const metadata: ExtractedContent['metadata'] = {};

    // Description
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
    if (description) metadata.description = description.trim();

    // Mots-clés
    const keywords = $('meta[name="keywords"]').attr('content');
    if (keywords) metadata.keywords = keywords.trim();

    // Auteur
    const author = $('meta[name="author"]').attr('content') || 
                  $('meta[property="article:author"]').attr('content');
    if (author) metadata.author = author.trim();

    // Date de publication
    const publishDate = $('meta[property="article:published_time"]').attr('content') ||
                       $('meta[name="date"]').attr('content') ||
                       $('time[datetime]').attr('datetime');
    if (publishDate) metadata.publishDate = publishDate.trim();

    // Langue
    const language = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content');
    if (language) metadata.language = language.trim();

    return metadata;
  }

  /**
   * Effectue une requête HTTP avec retry
   */
  private async _fetchWithRetry(url: string): Promise<string> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this._config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._config.timeout);

        const response = await fetch(url, {
          headers: {
            'User-Agent': this._userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Cache-Control': 'no-cache'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();

      } catch (error: any) {
        lastError = error;
        
        if (attempt < this._config.retryAttempts) {
          await this._delay(this._config.retryDelay * attempt);
          continue;
        }
      }
    }

    throw lastError!;
  }

  /**
   * Filtre les résultats selon la configuration
   */
  private _filterResults(results: SearchResult[]): SearchResult[] {
    return results.filter(result => {
      const domain = this._extractDomain(result.url);
      
      // Exclure les domaines interdits
      if (this._config.excludeDomains.some(excluded => domain.includes(excluded))) {
        return false;
      }

      // Si des domaines sont spécifiquement inclus, ne garder que ceux-ci
      if (this._config.includeDomains.length > 0) {
        return this._config.includeDomains.some(included => domain.includes(included));
      }

      return true;
    });
  }

  /**
   * Nettoie et normalise une URL
   */
  private _cleanUrl(url: string): string {
    try {
      // Gère les URLs de redirection DuckDuckGo
      if (url.includes('duckduckgo.com/l/?uddg=')) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) {
          url = decodeURIComponent(match[1]);
        }
      }

      // Gère les URLs relatives
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        return url; // URL relative, sera ignorée
      }

      // Supprime les paramètres de tracking courants
      const urlObj = new URL(url);
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
      
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (error) {
      console.warn(`Impossible de nettoyer l'URL: ${url}`, error);
      return url;
    }
  }

  /**
   * Extrait le domaine d'une URL
   */
  private _extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Nettoie le texte extrait
   */
  private _cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Normalise les espaces
      .replace(/\n\s*\n/g, '\n') // Supprime les lignes vides multiples
      .trim();
  }

  /**
   * Valide une requête de recherche
   */
  private _validateQuery(query: string): void {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('La requête de recherche ne peut pas être vide');
    }

    if (query.trim().length < 2) {
      throw new Error('La requête de recherche doit contenir au moins 2 caractères');
    }
  }

  /**
   * Valide un tableau d'URLs
   */
  private _validateUrls(urls: string[]): void {
    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error('Le tableau d\'URLs ne peut pas être vide');
    }

    urls.forEach(url => {
      if (typeof url !== 'string') {
        throw new Error('Toutes les URLs doivent être des chaînes de caractères');
      }

      try {
        new URL(url);
      } catch {
        throw new Error(`URL invalide: ${url}`);
      }
    });
  }

  /**
   * Utilitaire pour créer un délai
   */
  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Getters pour accéder à la configuration
   */
  get config(): Readonly<WebSearchConfig> {
    return { ...this._config };
  }

  get userAgent(): string {
    return this._userAgent;
  }
}