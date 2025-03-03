import * as vscode from 'vscode';
import { MainPanel } from './webview/panel';
import { ScriptManager } from './script-manager/manager';
import { ChecklistManager } from './file-manager/checklist';
import { PythonRuntime } from './python-runtime/process';
import { ScriptsProvider } from './webview/providers/ScriptsProvider';
import { ChecklistProvider } from './webview/providers/ChecklistProvider';
import { ConfigManager } from './config/config-manager';

export async function activate(context: vscode.ExtensionContext) {
    console.log('DevToolkit extension is now active');

    try {
        // Initialiser ConfigManager en premier
        ConfigManager.initialize(context);

        // Initialisation des autres composants
    const scriptManager = new ScriptManager(context);
    const checklistManager = new ChecklistManager(context);
    const pythonRuntime = new PythonRuntime(await PythonRuntime.findPythonPath());

    // Enregistrement de la commande pour ouvrir le panneau
    let openPanelCommand = vscode.commands.registerCommand('devtoolkit.openPanel', () => {
        MainPanel.createOrShow(context.extensionUri);
    });

    // Commande pour exécuter un script
    let runScriptCommand = vscode.commands.registerCommand('devtoolkit.runScript', async (scriptPath: string) => {
        try {
            const scriptContent = await scriptManager.getScriptContent(scriptPath);
            if (!scriptContent) {
                throw new Error('Script non trouvé');
            }
            const result = await pythonRuntime.executeScript(scriptPath);
            if (result.exitCode === 0) {
                vscode.window.showInformationMessage('Script exécuté avec succès');
            } else {
                vscode.window.showErrorMessage(`Erreur lors de l'exécution: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Erreur: ${error}`);
        }
    });

    // Commande pour ajouter un fichier à la checklist
    let addToChecklistCommand = vscode.commands.registerCommand('devtoolkit.addToChecklist', (uri: vscode.Uri) => {
        checklistManager.addItem(uri.fsPath);
        vscode.window.showInformationMessage('Fichier ajouté à la checklist');
    });

    // Création des providers pour la barre d'activité
    const scriptsProvider = new ScriptsProvider(scriptManager, context.extensionPath);
    const checklistProvider = new ChecklistProvider(checklistManager);

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
    context.subscriptions.push(
        openPanelCommand,
        runScriptCommand,
        addToChecklistCommand,
        checklistManager,
        scriptsView,
        checklistView,
        { dispose: () => { 
            /* Nettoyage du ScriptManager */ 
            console.log('Cleaning up DevToolkit extension...');
        } }
    );
    } catch (error: any) {
        console.error('Erreur lors de l\'initialisation de DevToolkit:', error);
        vscode.window.showErrorMessage(`Erreur d'initialisation de DevToolkit: ${error.message}`);
        throw error;
    }
}

export function deactivate() {
    console.log('DevToolkit extension is now deactivated');
}
