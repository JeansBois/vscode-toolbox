import * as vscode from 'vscode';
import { performance } from 'perf_hooks';
import { 
    validateMessage, 
    ValidationResult, 
    ScriptMessage 
} from './utils/messageSchema';

/**
 * Performance metrics for WebView operations
 */
interface PanelMetrics {
    startupTime: number;
    messageProcessingTimes: number[];
    avgMessageProcessingTime: number;
    totalMessages: number;
    invalidMessages: number;
    resourceLoadTime: number;
    lastRenderTime: number;
}

/**
 * Main panel for the WebView UI with performance optimizations
 */
export class MainPanel {
    public static currentPanel: MainPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    
    // HTML content cache to avoid regenerating the same content
    private static _cachedHtmlContent: string | undefined;
    
    // Cache of resource URIs
    private _resourceUris: Record<string, vscode.Uri> | undefined;
    
    // Message queue for batching messages when appropriate
    private _messageQueue: any[] = [];
    private _messageProcessingTimer: NodeJS.Timeout | undefined;
    
    // Performance metrics
    private _metrics: PanelMetrics = {
        startupTime: 0,
        messageProcessingTimes: [],
        avgMessageProcessingTime: 0,
        totalMessages: 0,
        invalidMessages: 0,
        resourceLoadTime: 0,
        lastRenderTime: 0
    };

    private constructor(panel: vscode.WebviewPanel, private readonly _extensionUri: vscode.Uri) {
        const startTime = performance.now();
        this._panel = panel;

        // Set the webview's initial html content - use cached content if available
        this._initializeWebview();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview with enhanced validation
        this._panel.webview.onDidReceiveMessage(
            message => this.handleWebviewMessage(message),
            null,
            this._disposables
        );
        
        // Listen for visibility changes to optimize resource usage
        this._panel.onDidChangeViewState(
            e => this._handleVisibilityChange(e),
            null,
            this._disposables
        );
        
        // Record startup time
        this._metrics.startupTime = performance.now() - startTime;
        console.log(`WebView panel initialized in ${this._metrics.startupTime.toFixed(2)}ms`);
    }

    /**
     * Initialize the webview content with performance optimizations
     */
    private _initializeWebview(): void {
        const resourceStart = performance.now();
        
        if (!this._resourceUris) {
            this._resourceUris = this._getResourceUris(this._extensionUri);
        }
        
        this._metrics.resourceLoadTime = performance.now() - resourceStart;
        
        const renderStart = performance.now();
        this._panel.webview.html = this._getWebviewContent(this._extensionUri);
        this._metrics.lastRenderTime = performance.now() - renderStart;
    }
    
    /**
     * Handle visibility changes to optimize resource usage
     */
    private _handleVisibilityChange(e: vscode.WebviewPanelOnDidChangeViewStateEvent): void {
        if (e.webviewPanel.visible) {
            // Panel became visible - refresh content if needed
            console.log('WebView panel became visible');
            
            // Send any pending updates that were queued while hidden
            this._processMessageQueue(true); // Force processing the queue
        } else {
            // Panel was hidden - release resources
            console.log('WebView panel was hidden');
            
            // Consider releasing resources that aren't needed when hidden
            // Note: Don't clear whole cache as it speeds up reopening
        }
    }

    /**
     * Handle incoming messages from the webview with proper validation and batching
     * @param message The incoming message
     */
    private handleWebviewMessage(message: any): void {
        const startTime = performance.now();
        this._metrics.totalMessages++;
        
        // Perform basic structure validation
        if (!message || typeof message !== 'object') {
            console.error('Invalid message format: message is not an object');
            this._metrics.invalidMessages++;
            return;
        }

        // Handle command-based messages (legacy format)
        if (message.command) {
            this.handleCommandMessage(message);
        }
        // Handle type-based messages (preferred format)
        else if (message.type) {
            this.handleTypedMessage(message);
        }
        // Message has neither command nor type
        else {
            console.error('Invalid message: missing command or type property');
            console.error('Message content:', JSON.stringify(message));
            this._metrics.invalidMessages++;
        }
        
        // Record processing time
        const processingTime = performance.now() - startTime;
        this._metrics.messageProcessingTimes.push(processingTime);
        
        // Keep only the last 100 processing times for memory efficiency
        if (this._metrics.messageProcessingTimes.length > 100) {
            this._metrics.messageProcessingTimes.shift();
        }
        
        // Update average
        this._metrics.avgMessageProcessingTime = this._metrics.messageProcessingTimes.reduce(
            (sum, time) => sum + time, 0
        ) / this._metrics.messageProcessingTimes.length;
    }

    /**
     * Handle legacy command-style messages
     * @param message Command message
     */
    private handleCommandMessage(message: any): void {
        if (typeof message.command !== 'string') {
            console.error('Invalid message format: command is not a string');
            return;
        }

        // For command-based messages, validate based on command type
        switch (message.command) {
            case 'alert':
                // Validate as alert message type
                const validationResult = validateMessage(
                    { ...message, type: 'alert' }, 
                    'alert'
                );
                
                if (!validationResult.valid) {
                    this.logValidationErrors(validationResult, message);
                    return;
                }
                
                vscode.window.showInformationMessage(message.text);
                return;
                
            default:
                console.error(`Unknown command received: ${message.command}`);
                return;
        }
    }

    /**
     * Handle typed messages (preferred format)
     * @param message Typed message with 'type' field
     */
    private handleTypedMessage(message: any): void {
        if (typeof message.type !== 'string') {
            console.error('Invalid message format: type is not a string');
            return;
        }

        // Validate message by type using the central validation system
        const validationResult = validateMessage(message, message.type);
        if (!validationResult.valid) {
            this.logValidationErrors(validationResult, message);
            return;
        }
        
        // Process validated message by type
        switch (message.type) {
            case 'script':
                this.handleScriptMessage(message as ScriptMessage);
                return;
                
            case 'file':
                this.handleFileMessage(message);
                return;
                
            case 'theme':
                this.handleThemeMessage(message);
                return;
                
            case 'form':
                this.handleFormMessage(message);
                return;
                
            default:
                console.error(`Unknown message type: ${message.type}`);
                console.error('Message content:', JSON.stringify(message));
                return;
        }
    }

    /**
     * Logs detailed validation errors
     * @param result Validation result
     * @param message The original message
     */
    private logValidationErrors(result: ValidationResult, message: any): void {
        console.error('Message validation failed:');
        result.errors.forEach(err => console.error(`- ${err}`));
        console.error('Invalid message:', JSON.stringify(message));
        
        // Optional: Add telemetry or security logging for validation failures
        // this.logSecurityEvent('message_validation_failure', { errors: result.errors });
    }

    /**
     * Handle script messages
     * @param message Validated script message
     */
    private handleScriptMessage(message: ScriptMessage): void {
        // Handle validated script messages
        const { action, scriptId } = message;
        
        // Process the action
        switch (action) {
            case 'execute':
                // Handle script execution
                console.log(`Executing script: ${scriptId}`);
                this._panel.webview.postMessage({
                    type: 'script-start',
                    scriptId
                });
                // Add proper script execution handling code here
                break;
                
            case 'cancel':
                // Handle script cancellation
                console.log(`Cancelling script: ${scriptId}`);
                // Add proper cancellation handling code here
                break;
                
            case 'select':
                // Handle script selection
                console.log(`Selected script: ${scriptId}`);
                // Retrieve script config and send it to the webview
                this._panel.webview.postMessage({
                    type: 'update-script-config',
                    scriptId,
                    config: {
                        // Mock config - would be retrieved from actual script
                        name: `Script ${scriptId}`,
                        description: 'Script description',
                        fields: []
                    }
                });
                break;
        }
    }
    
    /**
     * Handle file messages
     * @param message Validated file message
     */
    private handleFileMessage(message: any): void {
        const { action, paths } = message;
        console.log(`File ${action} action with ${paths.length} paths`);
        // Add implementation for file handling
    }
    
    /**
     * Handle theme messages
     * @param message Validated theme message
     */
    private handleThemeMessage(message: any): void {
        const { theme } = message;
        console.log(`Theme change to: ${theme}`);
        // Add implementation for theme handling
    }
    
    /**
     * Handle form submission messages
     * @param message Validated form message
     */
    private handleFormMessage(message: any): void {
        const { formId, values } = message;
        console.log(`Form submission for ${formId}:`, values);
        // Add implementation for form handling
    }

    /**
     * Add message to queue for batched processing
     * @param message Message to send to WebView
     */
    public postMessage(message: any): void {
        this._messageQueue.push(message);
        
        // Process immediately if it's a high-priority message
        if (message.priority === 'high') {
            this._processMessageQueue(true);
            return;
        }
        
        // Otherwise, batch messages for better performance
        if (!this._messageProcessingTimer) {
            this._messageProcessingTimer = setTimeout(() => {
                this._processMessageQueue();
            }, 16); // Process every ~16ms (roughly one frame)
        }
    }
    
    /**
     * Process queued messages in batches for better performance
     */
    private _processMessageQueue(force: boolean = false): void {
        // Skip if hidden and not forced
        if (!force && !this._panel.visible) {
            return;
        }
        
        // Clear timer
        if (this._messageProcessingTimer) {
            clearTimeout(this._messageProcessingTimer);
            this._messageProcessingTimer = undefined;
        }
        
        // No messages to process
        if (this._messageQueue.length === 0) {
            return;
        }
        
        // Consider batching similar messages
        const messagesMap = new Map<string, any[]>();
        
        // Group messages by type when possible
        for (const message of this._messageQueue) {
            const type = message.type || message.command || 'unknown';
            if (!messagesMap.has(type)) {
                messagesMap.set(type, []);
            }
            messagesMap.get(type)!.push(message);
        }
        
        // Process batches where possible, individual messages otherwise
        messagesMap.forEach((messages, type) => {
            if (messages.length > 1 && type === 'log') {
                // Example of batching log messages
                this._panel.webview.postMessage({
                    type: 'batch-log',
                    entries: messages.map(m => m.content)
                });
            } else {
                // Send messages individually
                for (const message of messages) {
                    this._panel.webview.postMessage(message);
                }
            }
        });
        
        // Clear the queue
        this._messageQueue = [];
    }

    /**
     * Create or show the panel with performance optimizations
     */
    public static createOrShow(extensionUri: vscode.Uri) {
        const startTime = performance.now();
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Reuse existing panel if available
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel._panel.reveal(column);
            console.log(`Reused existing panel in ${(performance.now() - startTime).toFixed(2)}ms`);
            return;
        }

        // Configure WebView with optimized options
        const panel = vscode.window.createWebviewPanel(
            'devtoolkit',
            'DevToolkit',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist'),
                    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist')
                ]
            }
        );

        // Create new panel instance
        MainPanel.currentPanel = new MainPanel(panel, extensionUri);
        console.log(`Created new panel in ${(performance.now() - startTime).toFixed(2)}ms`);
    }

    /**
     * Generate the full HTML content for the webview with caching
     */
    private _getWebviewContent(extensionUri: vscode.Uri): string {
        // Use cached content if available and valid
        if (MainPanel._cachedHtmlContent && this._resourceUris) {
            return MainPanel._cachedHtmlContent;
        }
        
        const nonce = this._getNonce();
        const resourceUris = this._resourceUris || this._getResourceUris(extensionUri);
        
        // Create optimized HTML content
        const htmlContent = `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>DevToolkit</title>
                    <meta http-equiv="Content-Security-Policy" content="
                        default-src 'none';
                        style-src ${this._panel.webview.cspSource} 'unsafe-inline';
                        script-src 'nonce-${nonce}';
                        img-src ${this._panel.webview.cspSource} https:;
                        font-src ${this._panel.webview.cspSource};
                    ">
                    <!-- Base styles loaded immediately -->
                    <link href="${resourceUris.baseStylesCss}" rel="stylesheet" />
                    
                    <!-- Non-critical styles loaded with low priority -->
                    <link href="${resourceUris.codiconCss}" rel="stylesheet" media="print" onload="this.media='all'" />
                    <link href="${resourceUris.stylesCss}" rel="stylesheet" media="print" onload="this.media='all'" />
                    
                    <!-- Performance monitoring script -->
                    <script nonce="${nonce}">
                        window.devToolkitPerf = {
                            loadStart: performance.now(),
                            mountTime: 0,
                            renderCount: 0,
                            lastRenderTime: 0
                        };
                        // Report performance metrics back to extension
                        setInterval(() => {
                            if (window.vscode) {
                                window.vscode.postMessage({
                                    type: 'performance',
                                    metrics: window.devToolkitPerf
                                });
                            }
                        }, 30000); // Report every 30 seconds
                    </script>
                </head>
                <body>
                    <div id="loading">Loading DevToolkit...</div>
                    <div id="root"></div>
                    
                    <!-- Critical initialization script -->
                    <script nonce="${nonce}">
                        // Show loading state immediately
                        document.getElementById('loading').style.display = 'block';
                        
                        // Record script execution in performance metrics
                        if (window.devToolkitPerf) {
                            window.devToolkitPerf.scriptLoadTime = performance.now();
                        }
                    </script>
                    
                    <!-- Main app script -->
                    <script nonce="${nonce}" src="${resourceUris.webviewJs}" 
                            onload="if(window.devToolkitPerf) window.devToolkitPerf.mainScriptLoaded = performance.now()"></script>
                </body>
            </html>`;
        
        // Cache the generated content
        MainPanel._cachedHtmlContent = htmlContent;
        
        return htmlContent;
    }
    
    /**
     * Gets all resource URIs needed for the webview with caching
     */
    private _getResourceUris(extensionUri: vscode.Uri): Record<string, vscode.Uri> {
        // Return cached URIs if available
        if (this._resourceUris) {
            return this._resourceUris;
        }
        
        // Generate and cache URIs
        const uris = {
            webviewJs: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')),
            baseStylesCss: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'base.css')),
            stylesCss: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'styles.css')),
            codiconCss: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')),
        };
        
        // Cache for reuse
        this._resourceUris = uris;
        
        return uris;
    }

    /**
     * Generate a nonce for the CSP header
     */
    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Gets performance metrics for the WebView panel
     */
    public getPerformanceMetrics(): PanelMetrics {
        return { ...this._metrics };
    }

    /**
     * Clean up resources properly to prevent memory leaks
     */
    public dispose() {
        // Clear message processing timer if running
        if (this._messageProcessingTimer) {
            clearTimeout(this._messageProcessingTimer);
            this._messageProcessingTimer = undefined;
        }
        
        // Clear message queue
        this._messageQueue = [];
        
        // Remove from static reference
        MainPanel.currentPanel = undefined;
        
        // Dispose of panel
        this._panel.dispose();

        // Dispose of all collected disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        
        console.log('WebView panel resources have been cleaned up');
    }
}
