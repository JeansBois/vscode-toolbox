"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ScriptsList_1 = require("./components/ScriptsList");
const FileTree_1 = require("./components/FileTree");
const OutputPanel_1 = require("./components/OutputPanel");
const messageHandler_1 = require("./utils/messageHandler");
const themeManager_1 = require("./utils/themeManager");
// Exporter les classes pour l'utilisation dans le webview
window.ScriptsList = ScriptsList_1.ScriptsList;
window.FileTree = FileTree_1.FileTree;
window.OutputPanel = OutputPanel_1.OutputPanel;
window.messageHandler = messageHandler_1.messageHandler;
window.themeManager = themeManager_1.themeManager;
// Initialiser le gestionnaire de thème
document.addEventListener('DOMContentLoaded', () => {
    themeManager_1.themeManager.handleThemeChange(document.body.classList.contains('vscode-dark') ? 'dark' :
        document.body.classList.contains('vscode-high-contrast') ? 'high-contrast' : 'light');
});
// Écouter les changements de thème
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'theme-change') {
        themeManager_1.themeManager.handleThemeChange(message.theme);
    }
});
//# sourceMappingURL=bundle.js.map