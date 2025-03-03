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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const panel_1 = require("./webview/panel");
const manager_1 = require("./script-manager/manager");
const checklist_1 = require("./file-manager/checklist");
const process_1 = require("./python-runtime/process");
const ScriptsProvider_1 = require("./webview/providers/ScriptsProvider");
const ChecklistProvider_1 = require("./webview/providers/ChecklistProvider");
const config_manager_1 = require("./config/config-manager");
async function activate(context) {
    console.log('DevToolkit extension is now active');
    try {
        // Initialiser ConfigManager en premier
        config_manager_1.ConfigManager.initialize(context);
        // Initialisation des autres composants
        const scriptManager = new manager_1.ScriptManager(context);
        const checklistManager = new checklist_1.ChecklistManager(context);
        const pythonRuntime = new process_1.PythonRuntime(await process_1.PythonRuntime.findPythonPath());
        // Enregistrement de la commande pour ouvrir le panneau
        let openPanelCommand = vscode.commands.registerCommand('devtoolkit.openPanel', () => {
            panel_1.MainPanel.createOrShow(context.extensionUri);
        });
        // Commande pour exécuter un script
        let runScriptCommand = vscode.commands.registerCommand('devtoolkit.runScript', async (scriptPath) => {
            try {
                const scriptContent = await scriptManager.getScriptContent(scriptPath);
                if (!scriptContent) {
                    throw new Error('Script non trouvé');
                }
                const result = await pythonRuntime.executeScript(scriptPath);
                if (result.exitCode === 0) {
                    vscode.window.showInformationMessage('Script exécuté avec succès');
                }
                else {
                    vscode.window.showErrorMessage(`Erreur lors de l'exécution: ${result.stderr}`);
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Erreur: ${error}`);
            }
        });
        // Commande pour ajouter un fichier à la checklist
        let addToChecklistCommand = vscode.commands.registerCommand('devtoolkit.addToChecklist', (uri) => {
            checklistManager.addItem(uri.fsPath);
            vscode.window.showInformationMessage('Fichier ajouté à la checklist');
        });
        // Création des providers pour la barre d'activité
        const scriptsProvider = new ScriptsProvider_1.ScriptsProvider(scriptManager, context.extensionPath);
        const checklistProvider = new ChecklistProvider_1.ChecklistProvider(checklistManager);
        // Enregistrement des vues
        const scriptsView = vscode.window.createTreeView('devtoolkit-scripts', {
            treeDataProvider: scriptsProvider,
            showCollapseAll: true
        });
        const checklistView = vscode.window.createTreeView('devtoolkit-checklist', {
            treeDataProvider: checklistProvider,
            showCollapseAll: true
        });
        // Ajout des commandes et vues au contexte
        context.subscriptions.push(openPanelCommand, runScriptCommand, addToChecklistCommand, checklistManager, scriptsView, checklistView, { dispose: () => {
                /* Nettoyage du ScriptManager */
                console.log('Cleaning up DevToolkit extension...');
            } });
    }
    catch (error) {
        console.error('Erreur lors de l\'initialisation de DevToolkit:', error);
        vscode.window.showErrorMessage(`Erreur d'initialisation de DevToolkit: ${error.message}`);
        throw error;
    }
}
function deactivate() {
    console.log('DevToolkit extension is now deactivated');
}
//# sourceMappingURL=extension.js.map