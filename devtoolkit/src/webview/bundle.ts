import { ScriptsList } from './components/ScriptsList';
import { FileTree } from './components/FileTree';
import { OutputPanel } from './components/OutputPanel';
import { messageHandler } from './utils/messageHandler';
import { themeManager } from './utils/themeManager';

// Exporter les classes pour l'utilisation dans le webview
(window as any).ScriptsList = ScriptsList;
(window as any).FileTree = FileTree;
(window as any).OutputPanel = OutputPanel;
(window as any).messageHandler = messageHandler;
(window as any).themeManager = themeManager;

// Initialiser le gestionnaire de thème
document.addEventListener('DOMContentLoaded', () => {
    themeManager.handleThemeChange(
        document.body.classList.contains('vscode-dark') ? 'dark' :
        document.body.classList.contains('vscode-high-contrast') ? 'high-contrast' : 'light'
    );
});

// Écouter les changements de thème
window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'theme-change') {
        themeManager.handleThemeChange(message.theme);
    }
});
