"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageHandler = exports.MessageHandler = void 0;
const themeManager_1 = require("./themeManager");
// Gestionnaire de messages
class MessageHandler {
    constructor() {
        this.messageQueue = [];
        this.isProcessing = false;
        // Initialiser la référence à l'API VSCode
        this.vscode = acquireVsCodeApi();
        // Configurer les écouteurs de messages
        window.addEventListener('message', this.handleIncomingMessage.bind(this));
    }
    static getInstance() {
        if (!MessageHandler.instance) {
            MessageHandler.instance = new MessageHandler();
        }
        return MessageHandler.instance;
    }
    async handleIncomingMessage(event) {
        const message = event.data;
        switch (message.type) {
            case 'theme':
                this.handleThemeMessage(message);
                break;
            case 'script':
                await this.handleScriptMessage(message);
                break;
            case 'file':
                this.handleFileMessage(message);
                break;
            default:
                console.warn('Message type non géré:', message);
        }
    }
    handleThemeMessage(message) {
        themeManager_1.themeManager.handleThemeChange(message.theme);
    }
    async handleScriptMessage(message) {
        switch (message.action) {
            case 'select':
                this.postMessage({
                    type: 'script-selected',
                    scriptId: message.scriptId
                });
                break;
            case 'execute':
                await this.executeScript(message);
                break;
            case 'cancel':
                this.postMessage({
                    type: 'script-cancelled',
                    scriptId: message.scriptId
                });
                break;
        }
    }
    handleFileMessage(message) {
        this.postMessage({
            type: 'files-updated',
            paths: message.paths,
            action: message.action
        });
    }
    async executeScript(message) {
        try {
            // Notifier le début de l'exécution
            this.postMessage({
                type: 'script-execution-start',
                scriptId: message.scriptId
            });
            // Simuler l'exécution du script (à remplacer par la vraie logique)
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Notifier la fin de l'exécution
            this.postMessage({
                type: 'script-execution-complete',
                scriptId: message.scriptId,
                success: true
            });
        }
        catch (error) {
            // Gérer les erreurs d'exécution
            this.postMessage({
                type: 'script-execution-error',
                scriptId: message.scriptId,
                error: error instanceof Error ? error.message : 'Erreur inconnue'
            });
        }
    }
    postMessage(message) {
        this.messageQueue.push(message);
        this.processMessageQueue();
    }
    async processMessageQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) {
            return;
        }
        this.isProcessing = true;
        try {
            while (this.messageQueue.length > 0) {
                const message = this.messageQueue.shift();
                if (message) {
                    this.vscode.postMessage(message);
                    // Petit délai pour éviter de surcharger le webview
                    await new Promise(resolve => setTimeout(resolve, 16));
                }
            }
        }
        finally {
            this.isProcessing = false;
        }
    }
    // Méthodes utilitaires pour envoyer des messages spécifiques
    notifyError(message) {
        this.postMessage({
            type: 'error',
            message
        });
    }
    notifySuccess(message) {
        this.postMessage({
            type: 'success',
            message
        });
    }
    notifyWarning(message) {
        this.postMessage({
            type: 'warning',
            message
        });
    }
    updateProgress(progress, message) {
        this.postMessage({
            type: 'progress-update',
            progress,
            message
        });
    }
}
exports.MessageHandler = MessageHandler;
// Exporter une instance unique
exports.messageHandler = MessageHandler.getInstance();
//# sourceMappingURL=messageHandler.js.map