import * as vscode from 'vscode';

// Note: PanelMetrics interface removed - was unused (TS6196)
// Unused imports removed (TS6133, TS6192)

/**
 * Main panel for the WebView UI with performance optimizations
 */
export class MainPanel {
    public static currentPanel: MainPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static async createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, show it
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel._panel.reveal(column);
            // Refresh the scripts list when shown
            await MainPanel.currentPanel._listScripts();
            return;
        }

        // Create a new panel
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

        MainPanel.currentPanel = new MainPanel(panel, extensionUri);
        
        // Initialize with scripts data after a short delay to ensure WebView is ready
        setTimeout(async () => {
            if (MainPanel.currentPanel) {
                try {
                    await MainPanel.currentPanel._listScripts();
                    console.log('Initial scripts list sent to WebView');
                } catch (error) {
                    console.error('Error loading initial scripts list:', error);
                }
            }
        }, 500);
    }

    private constructor(panel: vscode.WebviewPanel, private readonly _extensionUri: vscode.Uri) {
        this._panel = panel;
        
        // Set initial HTML content
        this._update();
        
        // Listen for panel close events
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    private _handleMessage(message: any) {
        console.log('Message received from webview:', message);
        
        // Process different message types
        if (message.type === 'script') {
            this._handleScriptMessage(message);
        } else if (message.type === 'file') {
            this._handleFileMessage(message);
        } else if (message.command === 'alert') {
            vscode.window.showInformationMessage(message.text);
        }
    }

    private _handleScriptMessage(message: any) {
        // Process script messages
        console.log('Script message received:', message);
        
        if (message.action === 'execute') {
            this._executeScript(message.scriptId);
        } else if (message.action === 'list') {
            this._listScripts();
        } else if (message.action === 'details') {
            this._getScriptDetails(message.scriptId);
        }
    }

    private _handleFileMessage(message: any) {
        // Process file messages
        console.log('File message received:', message);
        
        if (message.action === 'open') {
            this._openFile(message.path);
        } else if (message.action === 'save') {
            this._saveFile(message.path, message.content);
        }
    }

    private async _executeScript(scriptId: string) {
        try {
            // Run the script via the command
            await vscode.commands.executeCommand('devtoolkit.runScript', scriptId);
            
            // Send success message back to WebView
            this.postMessage({
                type: 'script-success',
                scriptId: scriptId,
                content: `Script ${scriptId} executed successfully`
            });
        } catch (error) {
            // Log and send error back to WebView
            console.error(`Error executing script ${scriptId}:`, error);
            this.postMessage({
                type: 'script-error',
                scriptId: scriptId,
                content: `Error executing script: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _listScripts() {
        try {
            // Dynamically import the script manager to avoid circular dependencies
            const { ScriptManager } = require('../script-manager/manager');
            const context = { extensionUri: this._extensionUri };
            const scriptManager = new ScriptManager(context);
            
            // Get available scripts
            const scripts = await scriptManager.getAvailableScripts();
            
            // Transform to a simpler format for the WebView
            interface ScriptInfo {
                id: string;
                name: string;
                description: string;
                version: string;
                category: string;
            }

            interface Script {
                script_info: ScriptInfo;
            }

            const scriptList: ScriptInfo[] = scripts.map((script: Script) => ({
                id: script.script_info.id,
                name: script.script_info.name,
                description: script.script_info.description,
                version: script.script_info.version,
                category: script.script_info.category
            }));
            
            // Send to WebView
            this.postMessage({
                type: 'update-scripts',
                scripts: scriptList
            });
        } catch (error) {
            console.error('Error listing scripts:', error);
            this.postMessage({
                type: 'script-error',
                content: `Error listing scripts: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _getScriptDetails(scriptId: string) {
        try {
            // Dynamically import the script manager
            const { ScriptManager } = require('../script-manager/manager');
            const context = { extensionUri: this._extensionUri };
            const scriptManager = new ScriptManager(context);
            
            // Get script manifest
            const manifest = await scriptManager.loadScriptManifest(scriptId);
            
            if (manifest) {
                // Send manifest to WebView
                this.postMessage({
                    type: 'script-details',
                    scriptId: scriptId,
                    details: manifest
                });
            } else {
                throw new Error(`Script ${scriptId} not found`);
            }
        } catch (error) {
            console.error(`Error getting script details for ${scriptId}:`, error);
            this.postMessage({
                type: 'script-error',
                scriptId: scriptId,
                content: `Error getting script details: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _openFile(filePath: string) {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document);
            
            this.postMessage({
                type: 'file-opened',
                path: filePath
            });
        } catch (error) {
            console.error(`Error opening file ${filePath}:`, error);
            this.postMessage({
                type: 'file-error',
                path: filePath,
                content: `Error opening file: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async _saveFile(filePath: string, content: string) {
        try {
            const uri = vscode.Uri.file(filePath);
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            
            await vscode.workspace.fs.writeFile(uri, data);
            
            this.postMessage({
                type: 'file-saved',
                path: filePath
            });
        } catch (error) {
            console.error(`Error saving file ${filePath}:`, error);
            this.postMessage({
                type: 'file-error',
                path: filePath,
                content: `Error saving file: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    public postMessage(message: any) {
        this._panel.webview.postMessage(message);
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        const webviewUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );
        
        const codiconsUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );
        
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DevToolkit</title>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${this._panel.webview.cspSource} https:; font-src ${this._panel.webview.cspSource};">
            <link href="${codiconsUri}" rel="stylesheet">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    width: 100%;
                    height: 100vh;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                }
                #main {
                    display: grid;
                    grid-template-rows: auto 1fr;
                    height: 100vh;
                }
                .toolbar {
                    padding: 8px;
                    display: flex;
                    background-color: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .content {
                    display: grid;
                    grid-template-columns: 250px 1fr;
                    height: 100%;
                }
                .sidebar {
                    border-right: 1px solid var(--vscode-panel-border);
                    overflow: auto;
                }
                .panel {
                    overflow: auto;
                    padding: 16px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div id="main">
                <div class="toolbar">
                    <button id="runButton">Run Script</button>
                </div>
                <div class="content">
                    <div class="sidebar">
                        <div id="file-tree"></div>
                        <div id="scripts-list"></div>
                    </div>
                    <div class="panel">
                        <div id="output-panel"></div>
                    </div>
                </div>
            </div>
            <script nonce="${nonce}" src="${webviewUri}"></script>
        </body>
        </html>`;
    }

    private _getNonce() {
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
