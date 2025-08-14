
export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    rank: number;
  }
  

export interface ExtractedContent {
    url: string;
    title: string;
    content: string;
    headings: string[];
    links: string[];
    metadata: {
      description?: string;
      keywords?: string;
      author?: string;
      publishDate?: string;
      language?: string;
    };
    extractedAt: Date;
    success: boolean;
    error?: string;
  }
  

export interface WebSearchConfig {
    maxResults?: number;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    minContentLength?: number;
    excludeDomains?: string[];
    includeDomains?: string[];
  }
  