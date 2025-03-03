import * as vscode from 'vscode';
import * as path from 'path';
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
        try {
            // Validate extension context is available
            if (!context.extensionUri) {
                throw new Error('Extension context URI is not available');
            }
            
            console.log('Opening DevToolkit panel...');
            MainPanel.createOrShow(context.extensionUri);
            
            // Log success
            console.log('DevToolkit panel opened successfully');
        } catch (error: unknown) {
            // Extract error message with proper type handling
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
                
            // Show user-friendly error
            vscode.window.showErrorMessage(`Failed to open DevToolkit panel: ${errorMessage}`);
            
            // Log full error for debugging
            console.error('Error opening DevToolkit panel:', error);
        }
    });

    // Commande pour exécuter un script
    let runScriptCommand = vscode.commands.registerCommand('devtoolkit.runScript', async (scriptPath: string) => {
        console.log(`Executing script: ${scriptPath}`);
        
        // Validate required components
        if (!scriptManager || !pythonRuntime) {
            const errorMessage = 'DevToolkit components not properly initialized';
            vscode.window.showErrorMessage(`Script execution failed: ${errorMessage}`);
            console.error('Script command error:', errorMessage);
            return;
        }
        
        // Validate input
        if (!scriptPath) {
            const errorMessage = 'No script path provided';
            vscode.window.showErrorMessage(`Script execution failed: ${errorMessage}`);
            console.error('Script command error:', { scriptPath, error: errorMessage });
            return;
        }
        
        try {
            // Get script content - validate it exists
            const scriptContent = await scriptManager.getScriptContent(scriptPath);
            if (!scriptContent) {
                throw new Error(`Script not found: ${path.basename(scriptPath)}`);
            }
            
            // Execute with progress indication and cancellation support
            const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Running script: ${path.basename(scriptPath)}`,
                cancellable: true
            }, async (progress, token) => {
                // Set up cancellation
                token.onCancellationRequested(() => {
                    console.log(`Script execution cancelled by user: ${scriptPath}`);
                    pythonRuntime!.killProcess();
                });
                
                // Show progress
                progress.report({ message: 'Executing...' });
                
                // Execute the script
                return await pythonRuntime!.executeScript(scriptPath);
            });
            
            // Handle the result
            if (result.exitCode === 0) {
                const successMessage = `Script executed successfully: ${path.basename(scriptPath)}`;
                vscode.window.showInformationMessage(successMessage);
                console.log(successMessage);
            } else {
                // Format error details for display
                const errorDetails = result.stderr ? `: ${result.stderr}` : '';
                const errorMessage = `Script execution failed with exit code ${result.exitCode}${errorDetails}`;
                
                vscode.window.showErrorMessage(errorMessage);
                
                // Log full error for debugging
                console.error(`Script execution error:`, {
                    scriptPath,
                    exitCode: result.exitCode,
                    stderr: result.stderr,
                    stdout: result.stdout
                });
            }
        } catch (error: unknown) {
            // Extract error message with proper type handling
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
                
            vscode.window.showErrorMessage(`Script execution error: ${errorMessage}`);
            
            // Log full error for debugging
            console.error(`Script command error:`, {
                scriptPath,
                error
            });
        }
    });

    // Commande pour ajouter un fichier à la checklist
    let addToChecklistCommand = vscode.commands.registerCommand('devtoolkit.addToChecklist', (uri: vscode.Uri) => {
        console.log('Adding file to checklist:', uri?.fsPath);
        
        // Validate required components
        if (!checklistManager) {
            const errorMessage = 'DevToolkit components not properly initialized';
            vscode.window.showErrorMessage(`Failed to add to checklist: ${errorMessage}`);
            console.error('Checklist command error:', errorMessage);
            return;
        }
        
        // Validate input
        if (!uri || !uri.fsPath) {
            const errorMessage = 'No valid file selected';
            vscode.window.showErrorMessage(`Failed to add to checklist: ${errorMessage}`);
            console.error('Checklist command error:', { uri, error: errorMessage });
            return;
        }
        
        try {
            // Validate file exists
            const fileName = path.basename(uri.fsPath);
            
            // Add the item to checklist
            checklistManager.addItem(uri.fsPath);
            
            // Show success message with file name for better context
            const successMessage = `Added to checklist: ${fileName}`;
            vscode.window.showInformationMessage(successMessage);
            console.log(successMessage);
        } catch (error: unknown) {
            // Extract error message with proper type handling
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            
            // Show user-friendly error with context
            vscode.window.showErrorMessage(`Failed to add to checklist: ${errorMessage}`);
            
            // Log full error for debugging
            console.error('Checklist command error:', {
                filePath: uri.fsPath,
                error
            });
        }
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
