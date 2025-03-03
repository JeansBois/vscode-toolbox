import * as vscode from 'vscode';

// Message validation schema interfaces
interface MessageSchema {
    requiredProps: string[];
    propValidators: {
        [prop: string]: (value: any) => boolean;
    };
    maxLength?: {
        [prop: string]: number;
    };
}

interface ValidationSchemas {
    [type: string]: MessageSchema;
}

export class MainPanel {
    public static currentPanel: MainPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, private readonly _extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set the webview's initial html content
        this._panel.webview.html = this._getWebviewContent(this._extensionUri);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                // Validate basic message structure
                if (!message || typeof message !== 'object') {
                    console.error('Invalid message format: message is not an object');
                    return;
                }

                // Handle command-based messages
                if (message.command) {
                    if (typeof message.command !== 'string') {
                        console.error('Invalid message format: command is not a string');
                        return;
                    }

                    switch (message.command) {
                        case 'alert':
                            // Validate message.text
                            if (!message.text || typeof message.text !== 'string' || message.text.length > 100) {
                                console.error('Invalid alert message text');
                                return;
                            }
                            vscode.window.showInformationMessage(message.text);
                            return;
                        default:
                            console.error(`Unknown command received: ${message.command}`);
                            return;
                    }
                }
                
                // Handle type-based messages
                if (message.type) {
                    if (typeof message.type !== 'string') {
                        console.error('Invalid message format: type is not a string');
                        return;
                    }

                    // Validate message by type
                    if (!this.validateMessage(message, message.type)) {
                        console.error(`Message validation failed for type: ${message.type}`);
                        return;
                    }
                    
                    switch (message.type) {
                        case 'script':
                            this.handleScriptMessage(message);
                            return;
                        default:
                            console.error(`Unknown message type: ${message.type}`);
                            return;
                    }
                }
                
                console.error('Invalid message: missing command or type property');
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (MainPanel.currentPanel) {
            MainPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'devtoolkit',
            'DevToolkit',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        MainPanel.currentPanel = new MainPanel(panel, extensionUri);
    }

    private readonly messageValidationSchema: ValidationSchemas = {
        'script': {
            requiredProps: ['action', 'scriptId'],
            propValidators: {
                'action': (val) => typeof val === 'string' && ['execute', 'cancel'].includes(val),
                'scriptId': (val) => typeof val === 'string' && val.length > 0,
                'files': (val) => !val || (Array.isArray(val) && val.every(f => typeof f === 'string'))
            },
            maxLength: {
                'scriptId': 100
            }
        }
    };

    private validateMessage(message: any, type: string): boolean {
        const schema = this.messageValidationSchema[type];
        if (!schema) return false;
        
        // Check required properties
        for (const prop of schema.requiredProps) {
            if (message[prop] === undefined) {
                console.error(`Required property missing: ${prop}`);
                return false;
            }
        }
        
        // Validate property types and values
        for (const [prop, validator] of Object.entries(schema.propValidators)) {
            if (message[prop] !== undefined && !validator(message[prop])) {
                console.error(`Property validation failed: ${prop}`);
                return false;
            }
        }
        
        // Check max lengths
        if (schema.maxLength) {
            for (const [prop, maxLen] of Object.entries(schema.maxLength)) {
                if (message[prop] && typeof message[prop] === 'string' && message[prop].length > maxLen) {
                    console.error(`Property exceeds max length: ${prop}`);
                    return false;
                }
            }
        }
        
        return true;
    }

    private handleScriptMessage(message: any): void {
        // Handle validated script messages
        const { action, scriptId, files } = message;
        
        // Process the action
        switch (action) {
            case 'execute':
                // Handle script execution
                // Implement secure handling of scriptId and files
                console.log(`Executing script: ${scriptId}`);
                break;
            case 'cancel':
                // Handle script cancellation
                console.log(`Cancelling script: ${scriptId}`);
                break;
        }
    }

    private _getWebviewContent(extensionUri: vscode.Uri): string {
        const nonce = this.getNonce();
        const resourceUris = this._getResourceUris(extensionUri);
        
        return `<!DOCTYPE html>
            <html lang="en">
            ${this._getHeaderHtml(resourceUris, nonce)}
            ${this._getBodyHtml(resourceUris, nonce)}
            </html>`;
    }
    
    /**
     * Gets all resource URIs needed for the webview
     */
    private _getResourceUris(extensionUri: vscode.Uri): Record<string, vscode.Uri> {
        return {
            webview: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js')),
            mainCss: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'styles', 'main.css')),
            themesCss: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'styles', 'themes.css')),
            componentsCss: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'styles', 'components.css')),
            codiconCss: this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')),
        };
    }
    
    /**
     * Generates the HTML for the head section including all necessary meta tags and stylesheets
     */
    private _getHeaderHtml(resourceUris: Record<string, vscode.Uri>, nonce: string): string {
        return `<head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>DevToolkit</title>
                <meta http-equiv="Content-Security-Policy" content="
                    default-src 'none';
                    style-src ${this._panel.webview.cspSource};
                    script-src 'nonce-${nonce}';
                    img-src ${this._panel.webview.cspSource} https:;
                    connect-src 'none';
                    font-src ${this._panel.webview.cspSource};
                ">
                <link href="${resourceUris.codiconCss}" rel="stylesheet" nonce="${nonce}" />
                <link href="${resourceUris.mainCss}" rel="stylesheet" nonce="${nonce}" />
                <link href="${resourceUris.themesCss}" rel="stylesheet" nonce="${nonce}" />
                <link href="${resourceUris.componentsCss}" rel="stylesheet" nonce="${nonce}" />
            </head>`;
    }
    
    /**
     * Generates the HTML for the body section including sidebar, main content, and scripts
     */
    private _getBodyHtml(resourceUris: Record<string, vscode.Uri>, nonce: string): string {
        return `<body>
                <div class="container">
                    ${this._getSidebarHtml()}
                    ${this._getMainContentHtml()}
                </div>
                ${this._getScriptsHtml(resourceUris, nonce)}
            </body>`;
    }
    
    /**
     * Generates the HTML for the sidebar section
     */
    private _getSidebarHtml(): string {
        return `<!-- Sidebar -->
                <div class="sidebar">
                    <div class="scripts-section">
                        <h2 class="section-title">Scripts</h2>
                        <div id="scripts-list"></div>
                    </div>
                    <div class="files-section">
                        <h2 class="section-title">Files</h2>
                        <div id="file-tree"></div>
                    </div>
                </div>`;
    }
    
    /**
     * Generates the HTML for the main content section
     */
    private _getMainContentHtml(): string {
        return `<!-- Main content -->
                <div class="main-content">
                    <div class="script-config">
                        <div id="script-details"></div>
                        <div id="script-inputs"></div>
                        <div class="script-actions">
                            <button id="run-script" class="primary-button" disabled>
                                <span class="codicon codicon-play"></span>
                                Execute
                            </button>
                            <button id="cancel-script" class="secondary-button" disabled>
                                <span class="codicon codicon-stop"></span>
                                Cancel
                            </button>
                        </div>
                    </div>
                    <div id="output-panel" class="output-panel"></div>
                </div>`;
    }
    
    /**
     * Generates the HTML for the scripts section including initialization code
     */
    private _getScriptsHtml(resourceUris: Record<string, vscode.Uri>, nonce: string): string {
        return `<script nonce="${nonce}" src="${resourceUris.webview}"></script>
                <script nonce="${nonce}">
                    // Initialisation des composants
                    const scriptsList = new ScriptsList('scripts-list');
                    const fileTree = new FileTree('file-tree');
                    const outputPanel = new OutputPanel('output-panel');

                    // Gestionnaire de thème
                    const theme = document.body.classList.contains('vscode-dark') ? 'dark' :
                                document.body.classList.contains('vscode-high-contrast') ? 'high-contrast' : 'light';
                    outputPanel.setTheme(theme);

                    // Gestionnaire de messages
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'update-scripts':
                                scriptsList.updateScripts(message.scripts);
                                break;
                            case 'update-files':
                                fileTree.updateFiles(message.files);
                                break;
                            case 'script-output':
                                outputPanel.appendLine(message.text, message.level);
                                break;
                            case 'script-start':
                                document.getElementById('run-script').disabled = true;
                                document.getElementById('cancel-script').disabled = false;
                                outputPanel.clear();
                                outputPanel.log('Starting script...');
                                break;
                            case 'script-end':
                                document.getElementById('run-script').disabled = false;
                                document.getElementById('cancel-script').disabled = true;
                                outputPanel.success('Script completed');
                                break;
                            case 'script-error':
                                document.getElementById('run-script').disabled = false;
                                document.getElementById('cancel-script').disabled = true;
                                outputPanel.error(message.error);
                                break;
                        }
                    });

                    // Gestionnaire d'événements pour les boutons
                    document.getElementById('run-script').addEventListener('click', () => {
                        const scriptId = scriptsList.getSelectedScriptId();
                        if (scriptId) {
                            vscode.postMessage({
                                type: 'script',
                                action: 'execute',
                                scriptId,
                                files: fileTree.getSelectedFiles()
                            });
                        }
                    });

                    document.getElementById('cancel-script').addEventListener('click', () => {
                        const scriptId = scriptsList.getSelectedScriptId();
                        if (scriptId) {
                            vscode.postMessage({
                                type: 'script',
                                action: 'cancel',
                                scriptId
                            });
                        }
                    });
                </script>`;
    }

    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose() {
        MainPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
