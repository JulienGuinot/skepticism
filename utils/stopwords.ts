/**
 * Utilitaires pour le traitement des stop words et l'extraction de sujets
 */

// Stop words français les plus courants
const FRENCH_STOP_WORDS = new Set([
  // Articles
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'da', 'au', 'aux',
  
  // Prépositions
  'à', 'avec', 'dans', 'pour', 'sur', 'sous', 'par', 'entre', 'vers', 'chez',
  'sans', 'contre', 'depuis', 'pendant', 'avant', 'après', 'devant', 'derrière',
  
  // Conjonctions
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'quoi', 'dont',
  'où', 'quand', 'comment', 'pourquoi', 'si', 'comme', 'lorsque', 'puisque',
  
  // Pronoms
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se',
  'lui', 'leur', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta',
  'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  
  // Verbes auxiliaires et courants
  'être', 'avoir', 'faire', 'aller', 'venir', 'voir', 'savoir', 'pouvoir',
  'vouloir', 'devoir', 'falloir', 'est', 'sont', 'était', 'étaient', 'sera',
  'seront', 'a', 'ont', 'avait', 'avaient', 'aura', 'auront', 'fait', 'font',
  'faisait', 'faisaient', 'fera', 'feront', 'va', 'vont', 'allait', 'allaient',
  'ira', 'iront',
  
  // Adverbes courants
  'très', 'plus', 'moins', 'aussi', 'encore', 'déjà', 'toujours', 'jamais',
  'souvent', 'parfois', 'bien', 'mal', 'mieux', 'beaucoup', 'peu', 'assez',
  'trop', 'tout', 'tous', 'toute', 'toutes', 'rien', 'quelque', 'quelques',
  'chaque', 'plusieurs', 'certains', 'certaines',
  
  // Mots de liaison
  'alors', 'ainsi', 'cependant', 'néanmoins', 'toutefois', 'pourtant',
  'en effet', 'par exemple', 'notamment', 'c\'est-à-dire', 'autrement dit',
  
  // Autres mots courants
  'oui', 'non', 'peut-être', 'voici', 'voilà', 'ici', 'là', 'maintenant',
  'aujourd\'hui', 'hier', 'demain', 'année', 'mois', 'jour', 'heure',
  'temps', 'fois', 'chose', 'façon', 'manière', 'cas', 'exemple'
]);

// Stop words anglais pour les requêtes mixtes
const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
  'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now'
]);

export interface TopicExtractionOptions {
  /** Langue principale pour les stop words ('fr' | 'en' | 'both') */
  language?: 'fr' | 'en' | 'both';
  /** Longueur minimale des mots à conserver */
  minWordLength?: number;
  /** Nombre maximum de sujets à retourner */
  maxTopics?: number;
  /** Mots personnalisés à ignorer */
  customStopWords?: string[];
  /** Conserver les mots avec des majuscules (noms propres) */
  preserveCapitalized?: boolean;
}

export interface ExtractedTopics {
  /** Sujets principaux identifiés */
  topics: string[];
  /** Requête originale nettoyée */
  cleanedQuery: string;
  /** Mots supprimés (stop words) */
  removedWords: string[];
  /** Statistiques */
  stats: {
    originalWordCount: number;
    finalWordCount: number;
    stopWordsRemoved: number;
  };
}

/**
 * Supprime les stop words et extrait les sujets principaux d'une requête
 */
export function extractTopics(
  query: string, 
  options: TopicExtractionOptions = {}
): ExtractedTopics {
  const {
    language = 'both',
    minWordLength = 2,
    maxTopics = 10,
    customStopWords = [],
    preserveCapitalized = true
  } = options;

  // Normalisation de la requête
  const originalWords = query
    .toLowerCase()
    .replace(/[^\w\s\-']/g, ' ') // Garde les tirets et apostrophes
    .split(/\s+/)
    .filter(word => word.length > 0);

  // Construction du set de stop words selon la langue
  let stopWords = new Set<string>();
  
  if (language === 'fr' || language === 'both') {
    stopWords = new Set([...stopWords, ...FRENCH_STOP_WORDS]);
  }
  
  if (language === 'en' || language === 'both') {
    stopWords = new Set([...stopWords, ...ENGLISH_STOP_WORDS]);
  }
  
  // Ajout des stop words personnalisés
  customStopWords.forEach(word => stopWords.add(word.toLowerCase()));

  const removedWords: string[] = [];
  const topics: string[] = [];

  // Traitement de chaque mot
  originalWords.forEach(word => {
    const cleanWord = word.trim();
    
    // Vérifications
    if (cleanWord.length < minWordLength) {
      removedWords.push(cleanWord);
      return;
    }
    
    if (stopWords.has(cleanWord)) {
      removedWords.push(cleanWord);
      return;
    }
    
    // Vérification des mots avec majuscules (noms propres potentiels)
    const originalWord = query.split(/\s+/).find(w => 
      w.toLowerCase().replace(/[^\w\s\-']/g, '') === cleanWord
    );
    
    if (preserveCapitalized && originalWord && /^[A-Z]/.test(originalWord)) {
      topics.push(originalWord);
    } else {
      topics.push(cleanWord);
    }
  });

  // Limitation du nombre de sujets
  const finalTopics = topics.slice(0, maxTopics);
  
  // Construction de la requête nettoyée
  const cleanedQuery = finalTopics.join(' ');

  return {
    topics: finalTopics,
    cleanedQuery,
    removedWords,
    stats: {
      originalWordCount: originalWords.length,
      finalWordCount: finalTopics.length,
      stopWordsRemoved: removedWords.length
    }
  };
}

/**
 * Génère des variantes de recherche basées sur les sujets extraits
 */
export function generateSearchVariants(topics: string[]): string[] {
  if (topics.length === 0) return [];
  
  const variants: string[] = [];
  
  // Requête complète avec tous les sujets
  variants.push(topics.join(' '));
  
  // Combinaisons de 2 sujets si on a plus de 2 sujets
  if (topics.length > 2) {
    for (let i = 0; i < topics.length - 1; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        variants.push(`${topics[i]} ${topics[j]}`);
      }
    }
  }
  
  // Sujets individuels pour les termes importants (plus de 4 caractères)
  topics
    .filter(topic => topic.length > 4)
    .forEach(topic => variants.push(topic));
  
  // Suppression des doublons et limitation
  return [...new Set(variants)].slice(0, 5);
}

/**
 * Analyse la pertinence des sujets extraits
 */
export function analyzeTopicRelevance(topics: string[]): Array<{
  topic: string;
  relevanceScore: number;
  category: 'high' | 'medium' | 'low';
}> {
  return topics.map(topic => {
    let score = 0;
    
    // Longueur du mot (plus long = plus spécifique)
    score += Math.min(topic.length / 10, 1) * 30;
    
    // Présence de majuscules (nom propre potentiel)
    if (/^[A-Z]/.test(topic)) score += 25;
    
    // Présence de chiffres (données spécifiques)
    if (/\d/.test(topic)) score += 20;
    
    // Mots composés (plus spécifiques)
    if (topic.includes('-') || topic.includes('_')) score += 15;
    
    // Mots techniques (contiennent des caractères spéciaux)
    if (/[A-Z]{2,}/.test(topic)) score += 20; // Acronymes
    
    // Base score pour tous les mots
    score += 10;
    
    let category: 'high' | 'medium' | 'low';
    if (score >= 70) category = 'high';
    else if (score >= 40) category = 'medium';
    else category = 'low';
    
    return {
      topic,
      relevanceScore: Math.min(score, 100),
      category
    };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}