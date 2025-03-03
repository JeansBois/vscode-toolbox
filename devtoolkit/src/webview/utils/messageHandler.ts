import { themeManager } from './themeManager';

// Types de messages
export interface BaseMessage {
    type: string;
}

export interface ScriptMessage extends BaseMessage {
    type: 'script';
    action: 'select' | 'execute' | 'cancel';
    scriptId: string;
    config?: Record<string, unknown>;
}

export interface FileMessage extends BaseMessage {
    type: 'file';
    action: 'select' | 'deselect';
    paths: string[];
}

export interface ThemeMessage extends BaseMessage {
    type: 'theme';
    theme: 'dark' | 'light' | 'high-contrast';
}

export type WebviewMessage = ScriptMessage | FileMessage | ThemeMessage;

// Gestionnaire de messages
export class MessageHandler {
    private static instance: MessageHandler;
    private vscode: any;
    private messageQueue: WebviewMessage[] = [];
    private isProcessing = false;

    private constructor() {
        // Initialiser la référence à l'API VSCode
        this.vscode = acquireVsCodeApi();
        
        // Configurer les écouteurs de messages
        window.addEventListener('message', this.handleIncomingMessage.bind(this));
    }

    public static getInstance(): MessageHandler {
        if (!MessageHandler.instance) {
            MessageHandler.instance = new MessageHandler();
        }
        return MessageHandler.instance;
    }

    private async handleIncomingMessage(event: MessageEvent): Promise<void> {
        const message = event.data as WebviewMessage;

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

    private handleThemeMessage(message: ThemeMessage): void {
        themeManager.handleThemeChange(message.theme);
    }

    private async handleScriptMessage(message: ScriptMessage): Promise<void> {
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

    private handleFileMessage(message: FileMessage): void {
        this.postMessage({
            type: 'files-updated',
            paths: message.paths,
            action: message.action
        });
    }

    private async executeScript(message: ScriptMessage): Promise<void> {
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
        } catch (error) {
            // Gérer les erreurs d'exécution
            this.postMessage({
                type: 'script-execution-error',
                scriptId: message.scriptId,
                error: error instanceof Error ? error.message : 'Erreur inconnue'
            });
        }
    }

    public postMessage(message: any): void {
        this.messageQueue.push(message);
        this.processMessageQueue();
    }

    private async processMessageQueue(): Promise<void> {
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
        } finally {
            this.isProcessing = false;
        }
    }

    // Méthodes utilitaires pour envoyer des messages spécifiques
    public notifyError(message: string): void {
        this.postMessage({
            type: 'error',
            message
        });
    }

    public notifySuccess(message: string): void {
        this.postMessage({
            type: 'success',
            message
        });
    }

    public notifyWarning(message: string): void {
        this.postMessage({
            type: 'warning',
            message
        });
    }

    public updateProgress(progress: number, message?: string): void {
        this.postMessage({
            type: 'progress-update',
            progress,
            message
        });
    }
}

// Exporter une instance unique
export const messageHandler = MessageHandler.getInstance();
