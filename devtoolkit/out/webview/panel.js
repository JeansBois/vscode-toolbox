"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainPanel = void 0;
const vscode = __importStar(require("vscode"));
class MainPanel {
    constructor(panel, _extensionUri) {
        this._extensionUri = _extensionUri;
        this._disposables = [];
        this._panel = panel;
        // Set the webview's initial html content
        this._panel.webview.html = this._getWebviewContent(this._extensionUri);
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showInformationMessage(message.text);
                    return;
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('devtoolkit', 'DevToolkit', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        MainPanel.currentPanel = new MainPanel(panel, extensionUri);
    }
    _getWebviewContent(extensionUri) {
        // Obtenir les URIs pour les ressources
        const webviewUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
        const mainUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'styles', 'main.css'));
        const themesUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'styles', 'themes.css'));
        const componentsUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'styles', 'components.css'));
        const codiconUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        // Configurer les options de sécurité du webview
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>DevToolkit</title>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource}; script-src 'nonce-${nonce}';">
                <link href="${codiconUri}" rel="stylesheet" nonce="${nonce}" />
                <link href="${mainUri}" rel="stylesheet" nonce="${nonce}" />
                <link href="${themesUri}" rel="stylesheet" nonce="${nonce}" />
                <link href="${componentsUri}" rel="stylesheet" nonce="${nonce}" />
            </head>
            <body>
                <div class="container">
                    <!-- Sidebar -->
                    <div class="sidebar">
                        <div class="scripts-section">
                            <h2 class="section-title">Scripts</h2>
                            <div id="scripts-list"></div>
                        </div>
                        <div class="files-section">
                            <h2 class="section-title">Files</h2>
                            <div id="file-tree"></div>
                        </div>
                    </div>
                    
                    <!-- Main content -->
                    <div class="main-content">
                        <div class="script-config">
                            <div id="script-details"></div>
                            <div id="script-inputs"></div>
                            <div class="script-actions">
                                <button id="run-script" class="primary-button" disabled>
                                    <span class="codicon codicon-play"></span>
                                    Exécuter
                                </button>
                                <button id="cancel-script" class="secondary-button" disabled>
                                    <span class="codicon codicon-stop"></span>
                                    Annuler
                                </button>
                            </div>
                        </div>
                        <div id="output-panel" class="output-panel"></div>
                    </div>
                </div>

                <script nonce="${nonce}" src="${webviewUri}"></script>
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
                                outputPanel.log('Démarrage du script...');
                                break;
                            case 'script-end':
                                document.getElementById('run-script').disabled = false;
                                document.getElementById('cancel-script').disabled = true;
                                outputPanel.success('Script terminé');
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
                </script>
            </body>
            </html>`;
    }
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    dispose() {
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
exports.MainPanel = MainPanel;
//# sourceMappingURL=panel.js.map