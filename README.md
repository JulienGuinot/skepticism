# RAG Service avec Recherche Web Intelligente

Un service RAG (Retrieval-Augmented Generation) avancé avec recherche web intelligente, suppression des stop words et analyse de sujets, utilisant Ollama pour les embeddings et la génération de réponses.

## 🚀 Nouvelles Fonctionnalités

- 🧠 **Recherche intelligente** avec suppression automatique des stop words
- 🎯 **Extraction de sujets** pour des recherches plus précises  
- 🔄 **Recherche multi-variantes** pour une couverture exhaustive
- 📊 **Analyse de pertinence** des termes de recherche
- 🌐 **Optimisation automatique** des requêtes web

## Fonctionnalités

- 🧠 **RAG intelligent** avec Ollama
- 🌐 **Recherche web** automatique (DuckDuckGo, Google, Bing)
- 🎯 **Suppression des stop words** français et anglais
- 🔍 **Analyse de sujets** avec scoring de pertinence
- 📚 **Gestion de documents** avec chunking intelligent
- 🔍 **Recherche vectorielle** avec similarité cosinus
- 💬 **Interface CLI** interactive enrichie
- 📊 **Statistiques** et monitoring détaillés

## Installation

```bash
npm install
```

## Configuration

Assurez-vous qu'Ollama est installé et en cours d'exécution :

```bash
# Installer Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Démarrer le service
ollama serve

# Télécharger les modèles nécessaires
ollama pull llama3.2:latest
ollama pull nomic-embed-text
```

## Utilisation

### CLI Interactif

```bash
npm start
```

### Commandes disponibles

- `search <query>` - **Recherche intelligente** avec analyse automatique et enrichissement web si nécessaire
- `add-web <query>` - Ajouter du contenu depuis le web avec analyse intelligente
- `add-file <path>` - Ajouter un fichier texte à la base
- `stats` - Afficher les statistiques de la base
- `clear` - Vider la base de connaissances
- `help` - Afficher l'aide
- `exit` - Quitter

### Exemples d'utilisation

#### Recherche intelligente automatique
```
Skepticism> search comment fonctionne le machine learning avec des réseaux de neurones
🔍 Recherche intelligente: "comment fonctionne le machine learning avec des réseaux de neurones"
✓ Recherche dans la base existante...
✓ Base existante insuffisante, recherche comprehensive...

📊 Analyse automatique:
  Sujets identifiés: machine, learning, réseaux, neurones
  Stop words supprimés: comment, fonctionne, le, avec, des, de
  Requête optimisée: "machine learning réseaux neurones"

✓ 8 nouveaux documents ajoutés
  Variantes utilisées: machine learning réseaux neurones | machine learning | réseaux neurones

✓ Recherche terminée!

┌─ RÉPONSE──────────────────────────────────────────────────────
│ Le machine learning avec des réseaux de neurones fonctionne en...
│ [Réponse détaillée basée sur le contenu enrichi]
└─────────────────────────────────────────────────────────────

📚 Sources:
  1 https://example.com/neural-networks-guide
  2 https://example.com/ml-fundamentals
```

#### Ajout de contenu intelligent
```
Skepticism> add-web intelligence artificielle et machine learning pour les débutants
🌐 Ajout de contenu web intelligent: "intelligence artificielle et machine learning pour les débutants"
✓ 5 documents ajoutés avec succès!

📊 Analyse des sujets:
  Sujets identifiés: intelligence, artificielle, machine, learning, débutants
  Stop words supprimés: et, pour, les
  Requête optimisée: "intelligence artificielle machine learning débutants"
```

## Architecture

```
services/
├── rag.service.ts      # Service principal RAG avec recherche intelligente
├── ollama.service.ts   # Interface avec Ollama
├── vector.service.ts   # Store vectoriel en mémoire
└── websearch.service.ts # Recherche web multi-moteurs + intelligence

utils/
├── chunking.ts         # Découpage intelligent de texte
└── stopwords.ts        # 🆕 Gestion des stop words et analyse de sujets

types/
├── rag.ts             # Types pour le RAG
└── webSearch.ts       # Types pour la recherche web
```

## Fonctionnalités de l'analyse intelligente

### Suppression des stop words
- **Français** : le, la, les, de, du, avec, pour, dans, sur, etc.
- **Anglais** : the, a, an, and, or, but, in, on, at, etc.
- **Personnalisable** : ajout de mots spécifiques à ignorer

### Extraction de sujets
- Identification automatique des termes importants
- Préservation des noms propres (majuscules)
- Filtrage par longueur minimale
- Limitation du nombre de sujets

### Génération de variantes
- Requête complète optimisée
- Combinaisons de 2 sujets
- Termes individuels importants
- Déduplication automatique

### Analyse de pertinence
- Score basé sur la longueur, majuscules, chiffres
- Catégorisation : HIGH, MEDIUM, LOW
- Priorisation des termes techniques et spécifiques

## Configuration avancée

```typescript
const config: RAGConfig = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2:latest',
    embeddingModel: 'nomic-embed-text',
    temperature: 0.7,
    maxTokens: 2048
  },
  vectorStore: {
    dimensions: 768,
    similarity: 'cosine'
  },
  chunking: {
    maxChunkSize: 1000,
    overlap: 200
  },
  retrieval: {
    topK: 5,
    threshold: 0.7
  }
};

// Options pour l'extraction de sujets
const topicOptions: TopicExtractionOptions = {
  language: 'both', // 'fr' | 'en' | 'both'
  minWordLength: 3,
  maxTopics: 8,
  customStopWords: ['custom', 'words'],
  preserveCapitalized: true
};
```

## 🎯 Comment utiliser les commandes ?

### Pour **rechercher** et obtenir une réponse :
```bash
search comment fonctionne l'intelligence artificielle
```
→ Recherche intelligente automatique avec enrichissement si nécessaire

### Pour **enrichir** ta base de connaissances :
```bash
add-web transformers attention mechanism deep learning
```
→ Ajoute du contenu web avec analyse intelligente

### Pour **ajouter** tes propres documents :
```bash
add-file ./mon-document.txt
```
→ Ajoute un fichier local à la base

### Pour **voir** l'état de ta base :
```bash
stats
```
→ Statistiques et sources disponibles

La commande **`search`** fait maintenant tout le travail automatiquement : elle analyse ta requête, enrichit la base si nécessaire avec une recherche comprehensive, puis génère une réponse optimale.

## Développement

```bash
# Développement avec rechargement automatique
npm run dev

# Build
npm run build

# Tests
npm test
```

## Licence

MIT