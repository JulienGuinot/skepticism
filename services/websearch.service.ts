import * as cheerio from "cheerio";
import { WebSearchConfig, ExtractedContent, SearchResult } from "../types/webSearch";
import { extractTopics, analyzeTopicRelevance, generateSearchVariants, TopicExtractionOptions } from "../utils/stopwords";

type SearchPlanStep = {
  query: string;
  reason: string;
  optional?: boolean;
  limit?: number;
};

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
      excludeDomains: config.excludeDomains ?? [],
      includeDomains: config.includeDomains ?? []
    };
  }


  async getTopUrls(
    query: string,
    searchEngine: 'google' | 'bing' | 'duckduckgo' = 'bing',
    limit?: number
  ): Promise<string[]> {
    try {
      this._validateQuery(query);

      const searchResults = await this._performSearch(query, searchEngine);
      const filteredResults = this._filterResults(searchResults);

      const effectiveLimit = limit ?? this._config.maxResults;

      return filteredResults
        .slice(0, effectiveLimit)
        .map(result => result.url);

    } catch (error: any) {
      throw new Error(`Erreur lors de la recherche: ${error.message}`);
    }
  }

  async smartSearch(
    query: string,
    searchEngine: 'google' | 'bing' | 'duckduckgo' = 'duckduckgo',
    topicOptions: TopicExtractionOptions = {},
    options: { maxResults?: number } = {}
  ): Promise<{
    results: ExtractedContent[];
    topicAnalysis: ReturnType<typeof extractTopics>;
    topics: string[];
    executedQueries: string[];
  }> {
    try {
      this._validateQuery(query);

      const desiredResults = Math.max(1, options.maxResults ?? this._config.maxResults);

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


      // Analyse de pertinence
      const relevanceAnalysis = analyzeTopicRelevance(topicAnalysis.topics);
      const highRelevanceTopics = relevanceAnalysis
        .filter(t => t.category === 'high')
        .map(t => t.topic);

      const highPriorityLimit = Math.min(2, Math.max(0, highRelevanceTopics.length));
      const searchPlan = this._buildSearchPlan(
        query,
        topicAnalysis,
        highRelevanceTopics,
        desiredResults,
        highPriorityLimit
      );
      console.log(
        `🎯 Stratégie de recherche: ${searchPlan
          .map(step => `${step.reason} → "${step.query}"`)
          .join(' | ')}`
      );

      const runResult = await this._runSearchPlan(searchPlan, searchEngine, desiredResults);

      if (runResult.executedQueries.length > 0) {
        console.log(`🔁 Requêtes exécutées: ${runResult.executedQueries.join(' | ')}`);
      }

      return {
        results: runResult.results,
        topicAnalysis,
        topics: topicAnalysis.topics,
        executedQueries: runResult.executedQueries
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
  async searchAndExtract(
    query: string,
    searchEngine: 'google' | 'bing' | 'duckduckgo' = 'duckduckgo',
    limit?: number
  ): Promise<ExtractedContent[]> {
    try {
      const urls = await this.getTopUrls(query, searchEngine, limit);
      return await this.extractContents(urls);
    } catch (error: any) {
      throw new Error(`Erreur lors de la recherche et extraction: ${error.message}`);
    }
  }

  /**
   * Recherche exhaustive sur les plusierus sujets
   */
  async comprehensiveSearch(
    query: string,
    searchEngine: 'google' | 'bing' | 'duckduckgo' = 'google',
    options: {
      maxVariants?: number;
      topicOptions?: TopicExtractionOptions;
      deduplicateResults?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<{
    allResults: ExtractedContent[];
    resultsByVariant: Array<{
      topic: string;
      results: ExtractedContent[];
    }>;
    topicAnalysis: ReturnType<typeof extractTopics>;
    executedQueries: string[];
  }> {
    try {
      const { maxVariants = 3, topicOptions = {}, deduplicateResults = true, maxResults } = options;

      const desiredResults = Math.max(1, maxResults ?? Math.max(this._config.maxResults, 10));

      const topicAnalysis = extractTopics(query, {
        language: 'both',
        minWordLength: 3,
        maxTopics: 8,
        preserveCapitalized: true,
        ...topicOptions
      });

      const relevanceAnalysis = analyzeTopicRelevance(topicAnalysis.topics);
      const prioritizedTopics = relevanceAnalysis.map(t => t.topic);
      const prioritizedLimit = Math.min(maxVariants, prioritizedTopics.length);

      const searchPlan = this._buildSearchPlan(
        query,
        topicAnalysis,
        prioritizedTopics,
        desiredResults,
        prioritizedLimit
      );

      const existingQueries = new Set<string>(searchPlan.map(step => step.query));
      const variantQueries = generateSearchVariants(topicAnalysis.topics)
        .filter(variant => !existingQueries.has(variant))
        .slice(0, Math.max(0, maxVariants - prioritizedLimit));

      variantQueries.forEach(variant => {
        searchPlan.push({
          query: variant,
          reason: 'variante combinée',
          optional: true,
          limit: Math.max(1, Math.ceil(desiredResults / 3))
        });
      });

      console.log(`🔍 Recherche exhaustive pour: "${query}"`);

      const runResult = await this._runSearchPlan(searchPlan, searchEngine, desiredResults);

      let allResults = runResult.results;
      if (deduplicateResults) {
        allResults = this._filterNewResults(allResults, new Set<string>());
      }

      const resultsByVariant = runResult.stepResults.map(({ step, results }) => ({
        topic: step.query,
        results
      }));

      console.log(`✅ Recherche terminée: ${allResults.length} résultats uniques`);

      return {
        allResults,
        resultsByVariant,
        topicAnalysis,
        executedQueries: runResult.executedQueries
      };

    } catch (error: any) {
      throw new Error(`Erreur lors de la recherche exhaustive: ${error.message}`);
    }
  }





  private async _performSearch(query: string, searchEngine: string): Promise<SearchResult[]> {
    switch (searchEngine) {
      case 'duckduckgo':
        return await this._searchDuckDuckGo(query);
      default:
        return await this._searchDuckDuckGo(query);
    }
  }


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


  private _extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const links: string[] = [];

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


  private _extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }


  private _cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Normalise les espaces
      .replace(/\n\s*\n/g, '\n') // Supprime les lignes vides multiples
      .trim();
  }


  private async _runSearchPlan(
    searchPlan: SearchPlanStep[],
    searchEngine: 'google' | 'bing' | 'duckduckgo',
    desiredResults: number
  ): Promise<{
    results: ExtractedContent[];
    executedQueries: string[];
    stepResults: Array<{ step: SearchPlanStep; results: ExtractedContent[] }>;
  }> {
    const aggregatedResults: ExtractedContent[] = [];
    const seenUrls = new Set<string>();
    const executedQueries: string[] = [];
    const stepResults: Array<{ step: SearchPlanStep; results: ExtractedContent[] }> = [];

    for (const step of searchPlan) {
      if (step.optional && aggregatedResults.length >= desiredResults) {
        continue;
      }

      const remainingSlots = desiredResults - aggregatedResults.length;
      if (remainingSlots <= 0) {
        break;
      }

      const queryLimit = step.limit ? Math.min(step.limit, remainingSlots) : remainingSlots;
      const stepRawResults = await this.searchAndExtract(
        step.query,
        searchEngine,
        Math.max(queryLimit, 1)
      );
      const newResults = this._filterNewResults(stepRawResults, seenUrls).slice(0, remainingSlots);

      executedQueries.push(step.query);

      if (newResults.length > 0) {
        aggregatedResults.push(...newResults);
      }

      stepResults.push({ step, results: newResults });

      if (aggregatedResults.length >= desiredResults) {
        break;
      }
    }

    return {
      results: aggregatedResults,
      executedQueries,
      stepResults
    };
  }


  private _buildSearchPlan(
    originalQuery: string,
    topicAnalysis: ReturnType<typeof extractTopics>,
    highRelevanceTopics: string[],
    desiredResults: number,
    maxHighPriorityTopics: number = 2
  ): SearchPlanStep[] {
    const normalizedOriginal = originalQuery.trim();
    const cleanedQuery = topicAnalysis.cleanedQuery.trim();
    const plan: SearchPlanStep[] = [];

    const fallbackToOriginal = this._shouldFallbackToOriginal(normalizedOriginal, topicAnalysis);

    if (fallbackToOriginal || cleanedQuery.length === 0) {
      plan.push({
        query: normalizedOriginal,
        reason: 'requête originale conservée'
      });

      if (cleanedQuery.length > 0 && cleanedQuery !== normalizedOriginal) {
        plan.push({
          query: cleanedQuery,
          reason: 'variante sans stop words',
          optional: true,
          limit: Math.max(2, Math.ceil(desiredResults / 2))
        });
      }
    } else {
      plan.push({
        query: cleanedQuery,
        reason: 'requête optimisée'
      });

      if (cleanedQuery !== normalizedOriginal) {
        plan.push({
          query: normalizedOriginal,
          reason: 'requête originale (contexte)',
          optional: true,
          limit: Math.max(2, Math.ceil(desiredResults / 2))
        });
      }
    }

    const highPriorityCap = Math.max(0, maxHighPriorityTopics);
    if (highPriorityCap > 0) {
      highRelevanceTopics
        .filter(topic => topic.length > 0 && topic !== cleanedQuery && topic !== normalizedOriginal)
        .slice(0, highPriorityCap)
        .forEach(topic => {
          plan.push({
            query: topic,
            reason: 'sujet prioritaire',
            optional: true,
            limit: Math.max(1, Math.ceil(desiredResults / 3))
          });
        });
    }

    return plan;
  }


  private _shouldFallbackToOriginal(
    originalQuery: string,
    topicAnalysis: ReturnType<typeof extractTopics>
  ): boolean {
    const normalized = originalQuery.trim();

    if (normalized.length === 0) {
      return true;
    }

    const cleanedQuery = topicAnalysis.cleanedQuery.trim();
    if (cleanedQuery.length === 0) {
      return true;
    }

    const { originalWordCount, finalWordCount, stopWordsRemoved } = topicAnalysis.stats;
    const removalRatio = originalWordCount > 0 ? stopWordsRemoved / originalWordCount : 0;

    const questionWords = ['comment', 'pourquoi', 'quel', 'quelle', 'quels', 'quelles', 'où', 'où', 'qui', 'combien'];
    const startsWithQuestionWord = questionWords.some(word =>
      normalized.toLowerCase().startsWith(`${word} `)
    );

    if (startsWithQuestionWord && removalRatio > 0.4) {
      return true;
    }

    if (finalWordCount <= 2 && removalRatio >= 0.5) {
      return true;
    }

    return false;
  }


  private _filterNewResults(
    results: ExtractedContent[],
    seenUrls: Set<string>
  ): ExtractedContent[] {
    const filtered: ExtractedContent[] = [];

    for (const result of results) {
      const url = result.url?.trim();
      if (!url) {
        continue;
      }

      if (seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      filtered.push(result);
    }

    return filtered;
  }


  private _validateQuery(query: string): void {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('La requête de recherche ne peut pas être vide');
    }

    if (query.trim().length < 2) {
      throw new Error('La requête de recherche doit contenir au moins 2 caractères');
    }
  }


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


  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get config(): Readonly<WebSearchConfig> {
    return { ...this._config };
  }

  get userAgent(): string {
    return this._userAgent;
  }
}