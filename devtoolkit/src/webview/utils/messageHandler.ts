/**
 * @fileoverview WebView message handler for secure communication between the extension and WebView
 * 
 * This module implements a secure communication channel between the VS Code extension
 * and the WebView, including:
 * - Message validation and sanitization
 * - Bidirectional message passing
 * - Message queueing and throttling
 * - Type-safe messaging with TypeScript
 * 
 * Security features:
 * - All messages are validated against a schema
 * - Messages are sanitized to remove unexpected properties
 * - Error handling for invalid messages
 * - Messages are processed sequentially to prevent race conditions
 */
import { themeManager } from './themeManager';
import { 
    validateMessage, 
    createMessage,
    sanitizeMessage,
    WebviewToExtensionMessage, 
    ExtensionToWebviewMessage,
    ScriptMessage,
    FileMessage,
    ThemeMessage,
    ValidationResult
} from './messageSchema';

/**
 * Union type representing messages that can be exchanged between the WebView and extension
 * 
 * Used for message queue typing and general message handling
 */
export type WebviewMessage = ExtensionToWebviewMessage | WebviewToExtensionMessage;

// Export message types from messageSchema for use elsewhere
export type { 
    ScriptMessage, 
    FileMessage, 
    ThemeMessage,
    WebviewToExtensionMessage,
    ExtensionToWebviewMessage
};

/**
 * Handles secure message communication between WebView and extension
 * 
 * This singleton class provides a structured, type-safe interface for bidirectional
 * communication, ensuring all messages are validated, properly formatted, and
 * sequentially processed.
 * 
 * Key features:
 * - Singleton pattern ensures one message handler per WebView
 * - Message validation against schema definitions
 * - Message queue to prevent race conditions
 * - Throttling to avoid UI blocking
 * - Helper methods for common message types
 * 
 * Security implications:
 * - Messages are validated to prevent injection attacks
 * - Messages are sanitized to remove unexpected properties
 * - Type safety through TypeScript interfaces
 */
export class MessageHandler {
    private static instance: MessageHandler;
    private vscode: any;
    private messageQueue: WebviewMessage[] = [];
    private isProcessing = false;

    /**
     * Private constructor for singleton pattern
     * 
     * Initializes the VS Code API reference and sets up message event listeners
     */
    private constructor() {
        // Initialize VS Code API reference
        this.vscode = acquireVsCodeApi();
        
        // Set up message event listeners
        window.addEventListener('message', this.handleIncomingMessage.bind(this));
    }

    /**
     * Gets the singleton instance of MessageHandler
     * 
     * @returns The MessageHandler instance
     */
    public static getInstance(): MessageHandler {
        if (!MessageHandler.instance) {
            MessageHandler.instance = new MessageHandler();
        }
        return MessageHandler.instance;
    }

    /**
     * Handles incoming messages from the extension
     * 
     * This method processes messages from the extension, validates them against
     * the expected schema, and routes them to the appropriate handler based on
     * message type.
     * 
     * Security implications:
     * - All messages are validated before processing
     * - Invalid messages are logged and discarded
     * - Type checking ensures proper message handling
     * 
     * @param event - Message event containing data from extension
     */
    private async handleIncomingMessage(event: MessageEvent): Promise<void> {
        const message = event.data;
        
        // Basic validation
        if (!message || typeof message !== 'object') {
            console.error('Invalid incoming message format: Not an object');
            return;
        }
        
        if (!message.type || typeof message.type !== 'string') {
            console.error('Invalid incoming message: Missing or invalid type property');
            return;
        }
        
        // Validate the message structure
        const validationResult = validateMessage(message);
        if (!validationResult.valid) {
            this.logValidationErrors(validationResult, message);
            return;
        }
        
        // Process validated message
        switch (message.type) {
            case 'theme':
                this.handleThemeMessage(message as ThemeMessage);
                break;
            case 'script':
                await this.handleScriptMessage(message as ScriptMessage);
                break;
            case 'file':
                this.handleFileMessage(message as FileMessage);
                break;
            // Handle extension-to-webview message types
            case 'update-scripts':
            case 'update-files':
            case 'script-output':
            case 'script-start':
            case 'script-end':
            case 'script-error':
                // These are handled by the webview directly through event listeners
                // in the HTML page, but we could add handling here if needed
                break;
            default:
                console.warn('Unhandled message type:', message.type);
                console.warn('Message content:', JSON.stringify(message));
        }
    }

    private handleThemeMessage(message: ThemeMessage): void {
        themeManager.handleThemeChange(message.theme);
    }

    /**
     * Processes script-related messages
     * 
     * Handles script selection, execution, and cancellation messages,
     * sending appropriate responses back to the extension.
     * 
     * @param message - Script message to process
     */
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
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Sends a message to the VS Code extension with validation
     * 
     * This method validates and sanitizes messages before adding them to the
     * message queue. Messages in the queue are processed sequentially to
     * prevent race conditions.
     * 
     * Security implications:
     * - Messages are validated against schema definitions
     * - Invalid messages are logged and rejected
     * - Messages are sanitized to remove unexpected properties
     * - Sequential processing prevents message interleaving
     * 
     * @param message - Message to send to the extension
     * @returns Boolean indicating whether the message was valid and successfully queued
     * 
     * @example
     * // Send a simple notification
     * messageHandler.postMessage({
     *   type: 'notification',
     *   severity: 'info',
     *   message: 'Operation completed successfully'
     * });
     */
    public postMessage(message: any): boolean {
        // Skip validation for null or undefined messages
        if (!message) {
            console.error('Cannot send null or undefined message');
            return false;
        }

        // Attempt to validate the message
        const validationResult = validateMessage(message);
        
        if (!validationResult.valid) {
            this.logValidationErrors(validationResult, message);
            return false;
        }
        
        // Sanitize the message before sending to remove any unexpected properties
        const sanitizedMessage = sanitizeMessage(message, message.type);
        
        // Queue the sanitized message for sending
        this.messageQueue.push(sanitizedMessage as WebviewMessage);
        this.processMessageQueue();
        return true;
    }
    
    /**
     * Logs validation errors to help with debugging
     * 
     * Outputs detailed information about message validation failures,
     * including specific validation errors and the original invalid message.
     * 
     * @param result - Validation result with errors
     * @param message - Original message that failed validation
     */
    private logValidationErrors(result: ValidationResult, message: any): void {
        console.error('Message validation failed:');
        result.errors.forEach(err => console.error(`- ${err}`));
        console.error('Invalid message:', JSON.stringify(message));
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

    // Utility methods for sending specific messages with proper validation
    
    /**
     * Sends an error notification to the extension
     * 
     * Creates and sends a properly formatted error notification message.
     * The extension typically displays these as error notifications in the UI.
     * 
     * @param message - Error message text
     * 
     * @example
     * messageHandler.notifyError('Failed to load script: File not found');
     */
    public notifyError(message: string): void {
        const validMessage = createMessage('error', { message });
        if (validMessage) {
            this.postMessage(validMessage);
        } else {
            console.error('Failed to create error notification with message:', message);
        }
    }

    /**
     * Sends a success notification to the extension
     * 
     * Creates and sends a properly formatted success notification message.
     * The extension typically displays these as success notifications in the UI.
     * 
     * @param message - Success message text
     * 
     * @example
     * messageHandler.notifySuccess('Script executed successfully');
     */
    public notifySuccess(message: string): void {
        const validMessage = createMessage('success', { message });
        if (validMessage) {
            this.postMessage(validMessage);
        } else {
            console.error('Failed to create success notification with message:', message);
        }
    }

    /**
     * Sends a warning notification to the extension
     * 
     * Creates and sends a properly formatted warning notification message.
     * The extension typically displays these as warning notifications in the UI.
     * 
     * @param message - Warning message text
     * 
     * @example
     * messageHandler.notifyWarning('Some dependencies are outdated');
     */
    public notifyWarning(message: string): void {
        const validMessage = createMessage('warning', { message });
        if (validMessage) {
            this.postMessage(validMessage);
        } else {
            console.error('Failed to create warning notification with message:', message);
        }
    }

    /**
     * Updates progress for long-running operations
     * 
     * Sends a progress update message to the extension, which typically
     * updates a progress indicator in the UI.
     * 
     * @param progress - Progress value between 0 and 100
     * @param message - Optional status message describing the current progress state
     * 
     * @example
     * // Update progress to 50% with status message
     * messageHandler.updateProgress(50, 'Processing file 5 of 10');
     */
    public updateProgress(progress: number, message?: string): void {
        // Validate progress range
        if (progress < 0 || progress > 100) {
            console.error('Progress value must be between 0 and 100');
            progress = Math.max(0, Math.min(100, progress)); // Clamp to valid range
        }
        
        const validMessage = createMessage('progress-update', { 
            progress, 
            message 
        });
        
        if (validMessage) {
            this.postMessage(validMessage);
        } else {
            console.error('Failed to create progress update with progress:', progress);
        }
    }
    
    /**
     * Sends a script-related message to the extension
     * 
     * Creates and sends a properly formatted script message for script
     * selection, execution, or cancellation.
     * 
     * @param action - Script action type ('select', 'execute', or 'cancel')
     * @param scriptId - Script identifier
     * @param config - Optional script configuration parameters
     * @param files - Optional array of file paths for script input
     * 
     * @example
     * // Execute a script with configuration
     * messageHandler.sendScriptMessage(
     *   'execute',
     *   'analyze-data-script',
     *   { verbose: true, maxItems: 100 },
     *   ['/path/to/input.json']
     * );
     */
    public sendScriptMessage(
        action: 'select' | 'execute' | 'cancel',
        scriptId: string,
        config?: Record<string, unknown>,
        files?: string[]
    ): void {
        const validMessage = createMessage<ScriptMessage>('script', {
            action,
            scriptId,
            config,
            files
        });
        
        if (validMessage) {
            this.postMessage(validMessage);
        } else {
            console.error(`Failed to create script message with action: ${action}`);
        }
    }
    
    /**
     * Sends a file selection message to the extension
     * 
     * Creates and sends a properly formatted file message for selecting
     * or deselecting files.
     * 
     * @param action - File action ('select' or 'deselect')
     * @param paths - Array of file paths to select or deselect
     * 
     * @example
     * // Select multiple files
     * messageHandler.sendFileMessage(
     *   'select',
     *   ['/path/to/file1.txt', '/path/to/file2.txt']
     * );
     */
    public sendFileMessage(
        action: 'select' | 'deselect',
        paths: string[]
    ): void {
        const validMessage = createMessage<FileMessage>('file', {
            action,
            paths
        });
        
        if (validMessage) {
            this.postMessage(validMessage);
        } else {
            console.error(`Failed to create file message with action: ${action}`);
        }
    }
}

// Exporter une instance unique
export const messageHandler = MessageHandler.getInstance();
