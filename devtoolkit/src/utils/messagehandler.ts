import * as vscode from 'vscode';

/**
 * Interface for message validation results
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Standard message interface for script operations
 */
export interface ScriptMessage {
    type: 'script';
    action: 'execute' | 'cancel' | 'select';
    scriptId: string;
    params?: Record<string, any>;
}

/**
 * Communication utility for WebView-Extension messaging with validation
 */
class MessageHandler {
    private vscodeApi: any;
    private initialized = false;

    /**
     * Initialize the handler with VSCode API for WebView context
     */
    public init(): void {
        if (this.initialized) return;
        
        // Only initialize in WebView context
        if (typeof acquireVsCodeApi === 'function') {
            this.vscodeApi = acquireVsCodeApi();
            this.initialized = true;
            console.log('MessageHandler initialized in WebView context');
        } else {
            console.log('MessageHandler initialized in extension context');
            this.initialized = true;
        }
    }

    /**
     * Post a message to the extension from the WebView
     * @param message The message to send to the extension
     */
    public postMessage(message: any): void {
        this.init();
        
        if (this.vscodeApi) {
            // WebView context - send to extension
            this.vscodeApi.postMessage(message);
        } else {
            // Extension context - this shouldn't be called
            console.warn('Attempted to post message from extension context', message);
        }
    }

    /**
     * Handles message passing from extension to WebView
     * @param message Message to send to WebView
     */
    public sendToWebview(panel: vscode.WebviewPanel, message: any): void {
        try {
            panel.webview.postMessage(message);
        } catch (error) {
            console.error('Error sending message to WebView:', error);
        }
    }

    /**
     * Shows an info notification in the WebView
     * @param message Notification message
     */
    public notifyInfo(message: string): void {
        if (this.vscodeApi) {
            // In WebView context
            // This would be implemented in UI, just log for now
            console.log('INFO: ' + message);
        } else {
            // In extension context
            vscode.window.showInformationMessage(message);
        }
    }

    /**
     * Shows an error notification in the WebView
     * @param message Error message
     */
    public notifyError(message: string): void {
        if (this.vscodeApi) {
            // In WebView context
            console.error('ERROR: ' + message);
        } else {
            // In extension context
            vscode.window.showErrorMessage(message);
        }
    }

    /**
     * Shows a success notification in the WebView
     * @param message Success message
     */
    public notifySuccess(message: string): void {
        if (this.vscodeApi) {
            // In WebView context
            console.log('SUCCESS: ' + message);
        } else {
            // In extension context
            vscode.window.showInformationMessage(message);
        }
    }
}

// Export singleton instance
export const messageHandler = new MessageHandler();