import { RAGService } from './services/rag.service';
import { RAGConfig } from './types/rag';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { colors, colorize, success, error, info, formatMarkdown, dim, highlight } from './utils/cli.formatting';




// Configuration par défaut
const defaultConfig: RAGConfig = {
    ollama: {
        baseUrl: 'http://localhost:11434',
        model: 'gemma3:12b',
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

export class RAGCLI {
    private ragService: RAGService;
    private rl: readline.Interface;

    constructor() {
        this.ragService = new RAGService(defaultConfig);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    private showLoadingSpinner(message: string): NodeJS.Timeout {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        return setInterval(() => {
            process.stdout.write(`\r${colorize(frames[i], colors.cyan)} ${message}`);
            i = (i + 1) % frames.length;
        }, 100);
    }

    private stopSpinner(spinner: NodeJS.Timeout, message: string) {
        clearInterval(spinner);
        process.stdout.write(`\r${success('✓')} ${message}\n`);
    }

    async start() {

        const spinner = this.showLoadingSpinner('Initialisation du service RAG...');

        try {
            await this.ragService.initialize();
            this.stopSpinner(spinner, 'Service RAG initialisé avec succès!');
            console.log('');
            this.showHelp();
            this.startInteractiveMode();
        } catch (error: any) {
            clearInterval(spinner);
            console.log(`\r erreur ✗  Erreur lors de l'initialisation: ${error}`);
            process.exit(1);
        }
    }

    private showHelp() {
        const helpBox = `
${colorize('┌────────────────────────────────────────────────────────────────┐', colors.blue)}
${colorize('│', colors.blue)} ${highlight('📚 COMMANDES DISPONIBLES')}                                       ${colorize('│', colors.blue)}
${colorize('├────────────────────────────────────────────────────────────────┤', colors.blue)}
${colorize('│', colors.blue)} ${info('search')} ${dim('<query>')}      ${colorize('│', colors.blue)} Recherche intelligente avec analyse auto ${colorize('│', colors.blue)}
${colorize('│', colors.blue)} ${info('add-web')} ${dim('<query>')}     ${colorize('│', colors.blue)} Ajouter du contenu depuis le web         ${colorize('│', colors.blue)}
${colorize('│', colors.blue)} ${info('add-file')} ${dim('<path>')}     ${colorize('│', colors.blue)} Ajouter un fichier texte à la base       ${colorize('│', colors.blue)}
${colorize('│', colors.blue)} ${info('stats')}               ${colorize('│', colors.blue)} Afficher les statistiques                ${colorize('│', colors.blue)}
${colorize('│', colors.blue)} ${info('clear')}               ${colorize('│', colors.blue)} Vider la base de connaissances           ${colorize('│', colors.blue)}
${colorize('│', colors.blue)} ${info('help')}                ${colorize('│', colors.blue)} Afficher cette aide                      ${colorize('│', colors.blue)}
${colorize('│', colors.blue)} ${info('exit')}                ${colorize('│', colors.blue)} Quitter le CLI                           ${colorize('│', colors.blue)}
${colorize('└────────────────────────────────────────────────────────────────┘', colors.blue)}
        `;
        console.log(helpBox);
    }

    private startInteractiveMode() {
        const prompt = `${colorize('Skepticism', colors.bright + colors.magenta)}${colorize('>', colors.cyan)} `;
        this.rl.question(prompt, async (input) => {
            const [command, ...args] = input.trim().split(' ');

            try {
                switch (command.toLowerCase()) {
                    case 'search':
                        await this.handleSearch(args.join(' '));
                        break;
                    case 'add-web':
                        await this.handleAddWeb(args.join(' '));
                        break;
                    case 'add-file':
                        await this.handleAddFile(args.join(' '));
                        break;
                    case 'stats':
                        await this.handleStats();
                        break;
                    case 'clear':
                        await this.handleClear();
                        break;
                    case 'help':
                        this.showHelp();
                        break;
                    case 'exit':
                        console.log(`\n${success('👋 Au revoir!')}`);
                        this.rl.close();
                        return;
                    default:
                        if (command) {
                            await this.handleSearch(command + ' ' + args.join(' '))
                        }
                }
            } catch (error: any) {
                console.log(`✗ Erreur: ${error}`);
            }

            this.startInteractiveMode();
        });
    }

    private async handleSearch(query: string) {
        if (!query) {
            console.log(`✗ Veuillez fournir une requête de recherche.`);
            return;
        }

        console.log(`\n${info('🔍 Recherche intelligente:')} ${highlight('"' + query + '"')}`);

        let currentSpinner: NodeJS.Timeout | null = null;

        try {
            // Étape 1: Vérifier d'abord dans la base existante
            currentSpinner = this.showLoadingSpinner('Recherche dans la base existante...');

            const initialResult = await this.ragService.search({
                query,
                includeWebSearch: false, // Pas de recherche web pour le moment
            });

            // Si on a peu de résultats ou une réponse générique, on fait une recherche comprehensive
            const needsMoreContent = initialResult.sources.length < 3 ||
                initialResult.answer.includes("Je n'ai pas trouvé") ||
                initialResult.answer.length < 200;

            if (needsMoreContent) {
                this.stopSpinner(currentSpinner, 'Base existante insuffisante, enrichissement nécessaire');

                // Import dynamique pour l'analyse
                const { extractTopics } = await import('./utils/stopwords');

                // Analyse de la requête
                const topicAnalysis = extractTopics(query, {
                    language: 'both',
                    minWordLength: 3,
                    maxTopics: 6,
                    preserveCapitalized: true
                });

                console.log(`\n${highlight('📊 Analyse automatique:')}`);
                console.log(`  ${info('Sujets identifiés:')} ${topicAnalysis.topics.join(', ')}`);
                console.log(`  ${info('Stop words supprimés:')} ${topicAnalysis.removedWords.join(', ')}`);
                console.log(`  ${info('Requête optimisée:')} "${topicAnalysis.cleanedQuery}"`);

                // Recherche comprehensive en mode silencieux
                currentSpinner = this.showLoadingSpinner('Recherche web exhaustive en cours...');

                const comprehensiveResult = await this.ragService.addFromComprehensiveSearch(query, {
                    maxResults: 10,
                    maxVariants: 4,
                    silent: true // Mode silencieux pour éviter les conflits d'affichage
                });

                this.stopSpinner(currentSpinner, 'Recherche web terminée');
                currentSpinner = null;

                console.log(`${success('✓')} ${comprehensiveResult.documentsAdded} nouveaux documents ajoutés`);
                console.log(`  ${info('Variantes utilisées:')} ${comprehensiveResult.searchVariants.join(' | ')}`);

                // Nouvelle recherche avec le contenu enrichi
                currentSpinner = this.showLoadingSpinner('Génération de la réponse finale...');

                // Recherche finale (avec ou sans enrichissement)
                const finalResult = await this.ragService.search({
                    query,
                    includeWebSearch: false, // On a déjà enrichi si nécessaire
                });

                this.stopSpinner(currentSpinner, 'Recherche terminée!');
                currentSpinner = null;

                // Affichage de la réponse
                this.displaySearchResult(finalResult);
            } else {
                // Pas besoin d'enrichissement, utiliser le résultat initial
                this.stopSpinner(currentSpinner, 'Recherche terminée!');
                currentSpinner = null;
                this.displaySearchResult(initialResult);
            }

        } catch (error: any) {
            if (currentSpinner) {
                clearInterval(currentSpinner);
            }
            console.log(`\r ✗ Erreur lors de la recherche: ${error}`);
        }
    }

    private displaySearchResult(result: any) {
        // Formatage et affichage de la réponse markdown
        const formattedAnswer = formatMarkdown(result.answer);
        console.log(`\n${colorize('┌─ RÉPONSE', colors.green)}${colorize('─'.repeat(50), colors.green)}`);

        const answerLines = formattedAnswer.split('\n');

        // Fonction pour découper les lignes trop longues
        function splitLines(lines: string[], maxWidth: number = 80): string[] {
            const splittedLines: string[] = [];

            lines.forEach((line) => {
                // Enlever les codes couleur ANSI pour calculer la vraie longueur
                const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '');

                if (cleanLine.length <= maxWidth) {
                    splittedLines.push(line);
                } else {
                    // Découper la ligne en respectant les mots
                    const words = line.split(' ');
                    let currentLine = '';
                    let currentCleanLine = '';

                    for (const word of words) {
                        const cleanWord = word.replace(/\x1b\[[0-9;]*m/g, '');
                        const testCleanLine = currentCleanLine + (currentCleanLine ? ' ' : '') + cleanWord;

                        if (testCleanLine.length <= maxWidth) {
                            currentLine += (currentLine ? ' ' : '') + word;
                            currentCleanLine = testCleanLine;
                        } else {
                            if (currentLine) {
                                splittedLines.push(currentLine);
                            }
                            currentLine = word;
                            currentCleanLine = cleanWord;
                        }
                    }

                    if (currentLine) {
                        splittedLines.push(currentLine);
                    }
                }
            });

            return splittedLines;
        }

        const processedLines = splitLines(answerLines, 75); // Limite à 75 caractères
        processedLines.forEach(line => {
            console.log(`${colorize('│', colors.green)} ${line}`);
        });

        console.log(`${colorize('└', colors.green)}${colorize('─'.repeat(57), colors.green)}`);

        // Affichage des sources
        if (result.sources.length > 0) {
            const urls = result.sources
                .map((source: { metadata: { url: any; }; }) => source.metadata.url)
                .filter((url: any) => url)
                .filter((url: any, index: any, array: string | any[]) => array.indexOf(url) === index);

            if (urls.length > 0) {
                console.log(`\n${highlight('📚 Sources:')}`);
                urls.forEach((url: string, index: number) => {
                    console.log(`  ${colorize((index + 1).toString(), colors.dim)} ${info(url!)}`);
                });
            }
        }
        console.log('');
    }

    private async handleAddWeb(query: string) {
        if (!query) {
            console.log(`✗ Veuillez fournir une requête de recherche web.`);
            return;
        }

        console.log(`\n${info('🌐 Ajout de contenu web intelligent:')} ${highlight('"' + query + '"')}`);
        const spinner = this.showLoadingSpinner('Analyse et recherche web...');

        try {
            const result = await this.ragService.addFromWebSearch(query, 8, true, true); // true = recherche intelligente, true = silent
            this.stopSpinner(spinner, `${result.documentsAdded} documents ajoutés avec succès!`);

            if (result.topicAnalysis) {
                console.log(`\n${highlight('📊 Analyse des sujets:')}`);
                console.log(`  ${info('Sujets identifiés:')} ${result.topicAnalysis.topics.join(', ')}`);
                console.log(`  ${info('Stop words supprimés:')} ${result.topicAnalysis.removedWords.join(', ')}`);
                console.log(`  ${info('Requête optimisée:')} "${result.topicAnalysis.cleanedQuery}"`);
            }
            console.log('');
        } catch (error: any) {
            clearInterval(spinner);
            console.log(`\r ✗ Erreur lors de l'ajout: ${error}`);
        }
    }



    private async handleAddFile(filePath: string) {
        if (!filePath) {
            console.log('❌ Veuillez fournir le chemin du fichier.');
            return;
        }

        try {
            if (!fs.existsSync(filePath)) {
                console.log(`❌ Fichier non trouvé: ${filePath}`);
                return;
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            const fileName = path.basename(filePath);

            await this.ragService.addDocuments([{
                id: `file_${Date.now()}`,
                content,
                metadata: {
                    title: fileName,
                    source: "upload",
                    timestamp: new Date()
                }
            }]);

            console.log(`✅ Fichier "${fileName}" ajouté avec succès!\n`);
        } catch (error) {
            console.error(`❌ Erreur lors de l'ajout du fichier:`, error);
        }
    }

    private async handleStats() {
        console.log('📊 Statistiques du RAG:');
        const stats = await this.ragService.getStats();

        console.log(`  Documents: ${stats.vectorStore.sources.length}`);
        console.log(`  Chunks: ${stats.vectorStore.totalChunks}`);
        console.log(`  Dimensions de la matrice: ${stats.vectorStore.dimensions}`);
        console.log("  Sources: ")

        stats.vectorStore.sources.forEach((source, index) => {
            console.log(`    ${index + 1}: ${source.source.substring(0, 80)}`)
        })
    }





    private async handleClear() {
        this.rl.question('⚠️  Êtes-vous sûr de vouloir vider la base de connaissances? (oui/non): ', async (answer) => {
            if (answer.toLowerCase() === 'oui' || answer.toLowerCase() === 'o') {
                const stats = await this.ragService.getStats()
                const sources = stats.vectorStore.sources
                await this.ragService.clear();
                sources.length <= 0 ? console.log("Rien à supprimer") : console.log(`Suppression de ${sources.length} sources`)
            } else {
                console.log('❌ Opération annulée.\n');
            }
            this.startInteractiveMode();
        });
        return; // Évite le double appel à startInteractiveMode
    }
}

// Point d'entrée
async function main() {
    const cli = new RAGCLI();
    await cli.start();
}

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\n👋 Au revoir!');
    process.exit(0);
});

if (require.main === module) {
    main().catch(console.error);
}