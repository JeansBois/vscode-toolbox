import * as vscode from 'vscode';
import { MainPanel } from './webview/panel';
import { ScriptManager } from './script-manager/manager';
import { ChecklistManager } from './file-manager/checklist';
import { PythonRuntime } from './python-runtime/process';
import { ScriptsProvider } from './webview/providers/ScriptsProvider';
import { ChecklistProvider } from './webview/providers/ChecklistProvider';
import { ConfigManager } from './config/config-manager';

// Store instances at module level for cleanup in deactivate
let pythonRuntime: PythonRuntime | undefined;
let scriptManager: ScriptManager | undefined;
let checklistManager: ChecklistManager | undefined;
let disposables: vscode.Disposable[] = [];

export async function activate(context: vscode.ExtensionContext) {
    console.log('DevToolkit extension is now active');

    try {
        // Initialiser ConfigManager en premier
        ConfigManager.initialize(context);

        // Initialisation des autres composants
    scriptManager = new ScriptManager(context);
    checklistManager = new ChecklistManager(context);
    pythonRuntime = new PythonRuntime(await PythonRuntime.findPythonPath());

    // Enregistrement de la commande pour ouvrir le panneau
    let openPanelCommand = vscode.commands.registerCommand('devtoolkit.openPanel', () => {
        MainPanel.createOrShow(context.extensionUri);
    });

    // Commande pour exécuter un script
    let runScriptCommand = vscode.commands.registerCommand('devtoolkit.runScript', async (scriptPath: string) => {
        if (!scriptManager || !pythonRuntime) {
            vscode.window.showErrorMessage('Extension not properly initialized');
            return;
        }

        try {
            const scriptContent = await scriptManager.getScriptContent(scriptPath);
            if (!scriptContent) {
                throw new Error('Script not found');
            }
            const result = await pythonRuntime.executeScript(scriptPath);
            if (result.exitCode === 0) {
                vscode.window.showInformationMessage('Script executed successfully');
            } else {
                vscode.window.showErrorMessage(`Execution error: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Commande pour ajouter un fichier à la checklist
    let addToChecklistCommand = vscode.commands.registerCommand('devtoolkit.addToChecklist', (uri: vscode.Uri) => {
        if (!checklistManager) {
            vscode.window.showErrorMessage('Extension not properly initialized');
            return;
        }
        checklistManager.addItem(uri.fsPath);
        vscode.window.showInformationMessage('File added to checklist');
    });

    // Création des providers pour la barre d'activité
    const scriptsProvider = new ScriptsProvider(scriptManager!, context.extensionPath);
    const checklistProvider = new ChecklistProvider(checklistManager!);

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
        console.error('Error initializing DevToolkit:', error);
        vscode.window.showErrorMessage(`DevToolkit initialization error: ${error.message}`);
        throw error;
    }
}

export function deactivate(): Promise<void> | undefined {
    console.log('DevToolkit extension is now deactivated');
    
    try {
        // Terminate any running Python processes
        if (pythonRuntime) {
            console.log('Terminating Python processes...');
            pythonRuntime.killProcess();
            pythonRuntime = undefined;
        }
        
        // Clean up MainPanel if it exists (handles webview and its disposables)
        if (MainPanel.currentPanel) {
            console.log('Disposing WebView panel...');
            MainPanel.currentPanel.dispose();
            // The dispose method already sets MainPanel.currentPanel to undefined
        }
        
        // Dispose the ChecklistManager (handles file watchers and storage)
        if (checklistManager) {
            console.log('Disposing ChecklistManager resources...');
            checklistManager.dispose();
            checklistManager = undefined;
        }
        
        // Release any other manager resources
        if (scriptManager) {
            console.log('Cleaning up ScriptManager resources...');
            // Currently scriptManager doesn't have a dispose method
            // If any event listeners or watchers are added in the future,
            // implement a dispose method in the ScriptManager class
            scriptManager = undefined;
        }
        
        // Nothing to clean up for ConfigManager - it's a singleton without active resources
        
        // Dispose any additional module-level disposables
        if (disposables.length) {
            console.log(`Disposing ${disposables.length} additional resources...`);
            disposables.forEach(d => {
                try {
                    d.dispose();
                } catch (disposeError) {
                    console.error('Error disposing resource:', disposeError);
                }
            });
            disposables = [];
        }
        
        // Note: VS Code will automatically clean up resources in context.subscriptions
        // when the extension is deactivated, but our explicit cleanup above ensures
        // that we properly handle any resources not in that array
        
        console.log('All DevToolkit resources have been cleaned up successfully');
    } catch (error) {
        console.error('Error during DevToolkit deactivation:', error);
        // Return the error so VS Code can log it
        return Promise.reject(error);
    }
    
    // Return undefined as we've handled cleanup synchronously
    return undefined;
}
