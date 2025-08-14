

export const colorize = (text: string, color: string) => `${color}${text}${colors.reset}`;


export const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m',
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m'
};



// Fonctions utilitaires pour les couleurs
export const success = (text: string) => colorize(text, colors.green);
export const error = (text: string) => colorize(text, colors.red);
export const info = (text: string) => colorize(text, colors.cyan);
// const warning = (text: string) => colorize(text, colors.yellow);
export const highlight = (text: string) => colorize(text, colors.bright + colors.white);
export const dim = (text: string) => colorize(text, colors.dim);

export const formatMarkdown = (text: string): string => {
    let formatted = text;

    // Headers (### -> titre coloré)
    formatted = formatted.replace(/^#### (.+)$/gm, (_, title) =>
        `\n${colorize('▶ ' + title.toUpperCase(), colors.bright + colors.yellow)}\n${colorize('─'.repeat(title.length + 2), colors.dim)}`
    );

    formatted = formatted.replace(/^### (.+)$/gm, (_, title) =>
        `\n${colorize('▶ ' + title.toUpperCase(), colors.bright + colors.yellow)}\n${colorize('─'.repeat(title.length + 2), colors.dim)}`
    );

    // Headers (## -> titre principal)
    formatted = formatted.replace(/^## (.+)$/gm, (_, title) =>
        `\n${colorize('◆ ' + title.toUpperCase(), colors.bright + colors.cyan)}\n${colorize('-'.repeat(title.length + 2), colors.cyan)}`
    );

    // Headers (# -> titre majeur)
    formatted = formatted.replace(/^# (.+)$/gm, (_, title) =>
        `\n${colorize('- ' + title.toUpperCase(), colors.bright + colors.magenta)}\n${colorize('='.repeat(title.length + 2), colors.magenta)}`
    );

    // Gras (**text** -> texte en gras)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, (_, text) =>
        colorize(text, colors.bright + colors.white)
    );

    // Italique (*text* -> texte en italique/dim)
    formatted = formatted.replace(/\*([^*]+)\*/g, (_, text) =>
        colorize(text, colors.dim)
    );

    // Code inline (`code` -> code coloré)
    formatted = formatted.replace(/`([^`]+)`/g, (_, code) =>
        colorize(code, colors.bgBlue + colors.white)
    );

    // Listes (- item -> puce colorée)
    formatted = formatted.replace(/^[\s]*[-*+] (.+)$/gm, (_, item) =>
        `  ${colorize('•', colors.green)} ${item}`
    );

    // Listes numérotées (1. item -> numéro coloré)
    formatted = formatted.replace(/^[\s]*(\d+)\. (.+)$/gm, (_, num, item) =>
        `  ${colorize(num + '.', colors.blue)} ${item}`
    );

    // Liens [text](url) -> texte souligné + url
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
        `${colorize(text, colors.bright + colors.blue)} ${dim('(' + url + ')')}`
    );

    // Citations (> text -> texte indenté et coloré)
    formatted = formatted.replace(/^> (.+)$/gm, (_, quote) =>
        `${colorize('│', colors.yellow)} ${colorize(quote, colors.dim)}`
    );

    return formatted;
};
