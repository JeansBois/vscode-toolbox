"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputPanel = void 0;
const messageHandler_1 = require("../utils/messageHandler");
class OutputPanel {
    constructor(containerId) {
        this.lines = [];
        this.autoScroll = true;
        this.filterLevel = new Set(['info', 'error', 'warning', 'success']);
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        this.container = container;
        this.init();
    }
    init() {
        // Créer la barre d'outils
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'output-toolbar';
        this.container.appendChild(this.toolbar);
        // Créer les boutons de la barre d'outils
        this.createToolbarButtons();
        // Créer le conteneur de contenu
        this.content = document.createElement('div');
        this.content.className = 'output-content';
        this.container.appendChild(this.content);
        // Écouter le défilement pour gérer l'auto-scroll
        this.content.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = this.content;
            this.autoScroll = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
        });
    }
    createToolbarButtons() {
        // Bouton pour effacer
        const clearButton = document.createElement('button');
        clearButton.className = 'toolbar-button';
        clearButton.innerHTML = '<span class="codicon codicon-clear-all"></span>';
        clearButton.title = 'Effacer la sortie';
        clearButton.onclick = () => this.clear();
        this.toolbar.appendChild(clearButton);
        // Bouton pour copier
        const copyButton = document.createElement('button');
        copyButton.className = 'toolbar-button';
        copyButton.innerHTML = '<span class="codicon codicon-copy"></span>';
        copyButton.title = 'Copier la sortie';
        copyButton.onclick = () => this.copyToClipboard();
        this.toolbar.appendChild(copyButton);
        // Filtres de niveau
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filter-container';
        ['info', 'error', 'warning', 'success'].forEach(level => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `filter-${level}`;
            checkbox.checked = true;
            checkbox.onchange = () => {
                if (checkbox.checked) {
                    this.filterLevel.add(level);
                }
                else {
                    this.filterLevel.delete(level);
                }
                this.render();
            };
            const label = document.createElement('label');
            label.htmlFor = `filter-${level}`;
            label.className = `filter-label filter-${level}`;
            label.textContent = level.charAt(0).toUpperCase() + level.slice(1);
            filterContainer.appendChild(checkbox);
            filterContainer.appendChild(label);
        });
        this.toolbar.appendChild(filterContainer);
        // Toggle auto-scroll
        const scrollToggle = document.createElement('button');
        scrollToggle.className = 'toolbar-button';
        scrollToggle.innerHTML = '<span class="codicon codicon-scroll-mode"></span>';
        scrollToggle.title = 'Activer/désactiver le défilement automatique';
        scrollToggle.onclick = () => {
            this.autoScroll = !this.autoScroll;
            scrollToggle.classList.toggle('active', this.autoScroll);
            if (this.autoScroll) {
                this.scrollToBottom();
            }
        };
        this.toolbar.appendChild(scrollToggle);
    }
    appendLine(text, type = 'info') {
        const line = {
            text,
            type,
            timestamp: Date.now()
        };
        this.lines.push(line);
        if (this.filterLevel.has(type)) {
            this.appendLineElement(line);
        }
    }
    appendLineElement(line) {
        const lineElement = document.createElement('div');
        lineElement.className = `output-line output-${line.type}`;
        const timestamp = document.createElement('span');
        timestamp.className = 'output-timestamp';
        timestamp.textContent = new Date(line.timestamp).toLocaleTimeString();
        const content = document.createElement('span');
        content.className = 'output-text';
        content.textContent = line.text;
        lineElement.appendChild(timestamp);
        lineElement.appendChild(content);
        this.content.appendChild(lineElement);
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }
    scrollToBottom() {
        this.content.scrollTop = this.content.scrollHeight;
    }
    clear() {
        this.lines = [];
        this.content.innerHTML = '';
    }
    render() {
        this.content.innerHTML = '';
        this.lines
            .filter(line => this.filterLevel.has(line.type))
            .forEach(line => this.appendLineElement(line));
    }
    async copyToClipboard() {
        const text = this.lines
            .filter(line => this.filterLevel.has(line.type))
            .map(line => `[${new Date(line.timestamp).toLocaleTimeString()}] ${line.text}`)
            .join('\n');
        try {
            await navigator.clipboard.writeText(text);
            messageHandler_1.messageHandler.notifySuccess('Sortie copiée dans le presse-papiers');
        }
        catch (error) {
            messageHandler_1.messageHandler.notifyError('Erreur lors de la copie dans le presse-papiers');
        }
    }
    setTheme(theme) {
        this.container.setAttribute('data-theme', theme);
    }
    // Méthodes utilitaires pour ajouter différents types de messages
    log(message) {
        this.appendLine(message, 'info');
    }
    error(message) {
        this.appendLine(message, 'error');
    }
    warning(message) {
        this.appendLine(message, 'warning');
    }
    success(message) {
        this.appendLine(message, 'success');
    }
}
exports.OutputPanel = OutputPanel;
//# sourceMappingURL=OutputPanel.js.map