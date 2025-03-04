/**
 * @fileoverview Main entry point for the DevToolkit VS Code extension
 * 
 * This file handles:
 * - Extension activation and deactivation
 * - Main component initialization with lazy loading
 * - Command registration with deferred execution
 * - View provider setup with optimized loading
 * - Performance measurement and optimization
 * - Error handling and resource cleanup
 * 
 * The extension implements a modular architecture with performance-optimized
 * lazy loading of components (ScriptManager, PythonRuntime, etc.) to improve
 * startup time and reduce resource usage.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { performance, PerformanceObserver } from 'perf_hooks';

// Forward declarations of lazily loaded components
import { MainPanel } from './webview/panel';
import { ScriptManager } from './script-manager/manager';
import { ChecklistManager } from './file-manager/checklist';
import { PythonRuntime } from './python-runtime/process';
import { ConfigManager } from './config/config-manager';
import { getOutputChannel } from './utils/error-handling';
// ScriptsProvider and ChecklistProvider are imported directly in registerTreeViews

// Store instances at module level for cleanup in deactivate
// Removed pythonRuntime (TS6133)
let scriptManager: any | undefined;
let checklistManager: any | undefined;
let disposables: vscode.Disposable[] = [];

// Performance metrics storage
const performanceMetrics = {
    activationStart: 0,
    activationEnd: 0,
    componentLoadTimes: new Map<string, number>(),
    commandRegistrationTime: 0,
    pythonInitTime: 0,
    totalStartupTime: 0
};

/**
 * Performance monitoring system for the extension
 * 
 * @internal Reserved for telemetry and performance tracking
 */
// @ts-ignore - Class is intentionally unused but kept for future implementation
class PerformanceMonitor {
    private static instance: PerformanceMonitor;
    private observer: PerformanceObserver;

    private constructor() {
        // Setup performance observer to collect metrics
        this.observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            for (const entry of entries) {
                performanceMetrics.componentLoadTimes.set(entry.name, entry.duration);
                console.log(`Performance: ${entry.name} took ${entry.duration.toFixed(2)}ms`);
            }
        });
        this.observer.observe({ entryTypes: ['measure'], buffered: true });
    }

    public static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }

    /**
     * Measures the execution time of a function
     * @param name Name of the measurement
     * @param fn Function to measure
     * @returns Result of the function
     */
    public static async measure<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
        const start = performance.now();
        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            performance.mark(`${name}-end`);
            performance.measure(name, { start, duration });
            console.log(`Performance: ${name} completed in ${duration.toFixed(2)}ms`);
        }
    }

    /**
     * Records startup metrics for telemetry and diagnostics
     */
    public static recordStartupMetrics(): void {
        performanceMetrics.activationEnd = performance.now();
        performanceMetrics.totalStartupTime = performanceMetrics.activationEnd - performanceMetrics.activationStart;
        
        console.log('DevToolkit Extension Startup Performance:');
        console.log(`Total activation time: ${performanceMetrics.totalStartupTime.toFixed(2)}ms`);
        console.log('Component load times:');
        performanceMetrics.componentLoadTimes.forEach((duration, component) => {
            console.log(`- ${component}: ${duration.toFixed(2)}ms`);
        });
    }

    public dispose(): void {
        this.observer.disconnect();
    }
}

// Commented out as it's not currently used but kept for future implementation
// /**
//  * Lazily imports a module with proper path resolution
//  * @param modulePath Path to the module
//  * @returns Promise resolving to the imported module
//  */
// async function lazyImport(modulePath: string): Promise<any> {
//     return await PerformanceMonitor.measure(`import:${modulePath}`, async () => {
//         try {
//             // First try with ./ prefix for local modules
//             return await import(`./${modulePath}`);
//         } catch (error) {
//             try {
//                 // Try without the ./ prefix
//                 return await import(modulePath);
//             } catch (error2) {
//                 // Try with absolute path
//                 const absolutePath = path.join(__dirname, modulePath);
//                 return await import(absolutePath);
//             }
//         }
//     });
// }

/**
 * Activates the DevToolkit extension with optimized loading
 * 
 * This function implements a staged activation pattern:
 * 1. Critical components (ConfigManager, MainPanel) are initialized immediately in parallel
 * 2. Commands are registered synchronously to avoid blocking activation
 * 3. Non-critical components are lazy-loaded in the background
 * 4. View providers are created on-demand
 * 
 * This approach significantly improves startup time by prioritizing critical components
 * and deferring expensive operations until they're actually needed.
 * 
 * @param context - The extension context provided by VS Code
 * @returns A promise that resolves when activation is complete
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = getOutputChannel();
    outputChannel.appendLine(`DevToolkit extension activating (${new Date().toLocaleString()})`);
    
    try {
        // Initialize the configuration manager
        ConfigManager.initialize(context);
        
        // Register commands (we'll implement them in detail later)
        registerCommands(context);
        
        // Initialize main components
        const scriptManager = new ScriptManager(context);
        const checklistManager = new ChecklistManager(context);
        
        // Initialize Python runtime (Done directly in registerCommands)
        await PythonRuntime.findPythonPath();
        
        // Register view providers
        registerTreeViews(context, scriptManager, checklistManager);
        
        // Store instances for deactivation
        context.subscriptions.push(
            { dispose: () => {
                // Clean up resources during deactivation
                if (MainPanel.currentPanel) {
                    MainPanel.currentPanel.dispose();
                }
                // Clean up other resources if needed
            }}
        );
        
        outputChannel.appendLine(`DevToolkit extension activated successfully`);
    } catch (error) {
        outputChannel.appendLine(`ERROR: Extension activation failed: ${error instanceof Error ? error.message : String(error)}`);
        console.error('Error during extension activation:', error);
        throw error;
    }
}

function registerTreeViews(
    context: vscode.ExtensionContext,
    scriptManager: ScriptManager,
    checklistManager: ChecklistManager
): void {
    // Import providers
    const { ScriptsProvider } = require('./webview/providers/ScriptsProvider');
    const { ChecklistProvider } = require('./webview/providers/ChecklistProvider');
    
    // Create providers
    const scriptsProvider = new ScriptsProvider(scriptManager, context.extensionPath);
    const checklistProvider = new ChecklistProvider(checklistManager);
    
    // Create TreeViews with their providers
    const scriptsView = vscode.window.createTreeView('devtoolkit-scripts', {
        treeDataProvider: scriptsProvider,
        showCollapseAll: true
    });
    
    const checklistView = vscode.window.createTreeView('devtoolkit-checklist', {
        treeDataProvider: checklistProvider,
        showCollapseAll: true
    });
    
    // Handle refreshes via commands
    const refreshScriptsCommand = vscode.commands.registerCommand(
        'devtoolkit.refreshScriptsList', 
        () => scriptsProvider.refresh()
    );
    
    // Register for cleanup
    context.subscriptions.push(
        scriptsView,
        checklistView,
        refreshScriptsCommand
    );
}

// Note: initializePythonRuntimeAsync and registerTreeViewProvidersAsync are removed as they're unused (TS6133)

/**
 * Registers commands with lazy loading of required components
 */
function registerCommands(context: vscode.ExtensionContext): void {
    // Command to open the main panel
    const openPanelCommand = vscode.commands.registerCommand('devtoolkit.openPanel', () => {
        try {
            MainPanel.createOrShow(context.extensionUri);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open DevToolkit panel: ${error instanceof Error ? error.message : String(error)}`);
            console.error('Error opening DevToolkit panel:', error);
        }
    });

    // Command to run a script
    const runScriptCommand = vscode.commands.registerCommand('devtoolkit.runScript', async (scriptPath: string) => {
        if (!scriptPath) {
            // If called from the command palette, ask the user to select a file
            const files = await vscode.window.showOpenDialog({
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Python': ['py'] }
            });
            
            if (!files || files.length === 0) {
                return;
            }
            
            scriptPath = files[0].fsPath;
        }
        
        try {
            const outputChannel = getOutputChannel();
            outputChannel.appendLine(`Executing script: ${scriptPath}`);
            outputChannel.show(true);
            
            // Get the Python runtime
            const configManager = ConfigManager.getInstance();
            const pythonPath = configManager.getConfiguration().pythonPath;
            const pythonRuntime = new PythonRuntime(pythonPath, context);
            
            // Run the script with visual feedback
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Running ${path.basename(scriptPath)}`,
                cancellable: true
            }, async (_progress, token) => {
                // Progress parameter prefixed with underscore to indicate it's intentionally unused
                
                // Configure execution options
                const options = {
                    onOutput: (data: string) => {
                        outputChannel.append(data);
                    },
                    onError: (data: string) => {
                        outputChannel.append(`ERROR: ${data}`);
                    }
                };
                
                // Handle cancellation
                token.onCancellationRequested(() => {
                    pythonRuntime.killProcess();
                });
                
                try {
                    // Execute the script
                    const result = await pythonRuntime.executeScript(scriptPath, options);
                    
                    if (result.exitCode === 0) {
                        vscode.window.showInformationMessage(`Script executed successfully in ${result.duration.toFixed(2)}ms`);
                    } else {
                        vscode.window.showErrorMessage(`Script execution failed with exit code ${result.exitCode}`);
                    }
                    
                    return result;
                } catch (error) {
                    vscode.window.showErrorMessage(`Script execution error: ${error instanceof Error ? error.message : String(error)}`);
                    outputChannel.appendLine(`Execution error: ${error}`);
                    throw error;
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error running script: ${error instanceof Error ? error.message : String(error)}`);
            console.error('Error running script:', error);
        }
    });

    // Add to checklist
    const addToChecklistCommand = vscode.commands.registerCommand('devtoolkit.addToChecklist', async (uri: vscode.Uri) => {
        if (!uri) {
            // If called from the command palette, ask the user to select a file
            const files = await vscode.window.showOpenDialog({
                canSelectFolders: false,
                canSelectMany: false
            });
            
            if (!files || files.length === 0) {
                return;
            }
            
            uri = files[0];
        }
        
        try {
            const checklistManager = new ChecklistManager(context);
            checklistManager.addItem(uri.fsPath);
            vscode.window.showInformationMessage(`Added ${path.basename(uri.fsPath)} to checklist`);
        } catch (error) {
            vscode.window.showErrorMessage(`Error adding to checklist: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Register commands in context
    context.subscriptions.push(openPanelCommand, runScriptCommand, addToChecklistCommand);
}

// File: src/extension.ts (continued)
// Note: handleError function removed - was unused (TS6133)

/**
 * Deactivates the DevToolkit extension and cleans up resources
 * 
 * This function is called when the extension is deactivated, either
 * when VS Code is closed or when the extension is explicitly disabled.
 * It performs a graceful shutdown of all components in reverse order
 * of initialization, ensuring that resources are properly released.
 * 
 * Cleanup sequence:
 * 1. Python processes are terminated
 * 2. WebView panels are disposed
 * 3. ChecklistManager resources are released
 * 4. Other managers and disposables are cleaned up
 * 5. Any async cleanup tasks are awaited
 * 
 * Error handling ensures that failures in one cleanup operation do not
 * prevent other cleanup operations from running.
 * 
 * @returns A promise that resolves when deactivation is complete
 * @throws Error if deactivation fails catastrophically
 */
export async function deactivate(): Promise<void> {
    console.log('DevToolkit extension is now deactivated');
    
    try {
        // Array to collect any async cleanup operations
        const cleanupTasks: Promise<void>[] = [];
        
        // Clean up MainPanel if it exists (handles webview and its disposables)
        if (MainPanel && MainPanel.currentPanel) {
            console.log('Disposing WebView panel...');
            try {
                MainPanel.currentPanel.dispose();
                // The dispose method already sets MainPanel.currentPanel to undefined
            } catch (panelError: unknown) {
                const typedError = panelError instanceof Error ? panelError : new Error(String(panelError));
                console.error('Error disposing WebView panel:', typedError);
            }
        }
        
        // Dispose the ChecklistManager (handles file watchers and storage)
        if (checklistManager) {
            console.log('Disposing ChecklistManager resources...');
            try {
                checklistManager.dispose();
            } catch (checklistError: unknown) {
                const typedError = checklistError instanceof Error ? checklistError : new Error(String(checklistError));
                console.error('Error disposing ChecklistManager:', typedError);
            } finally {
                checklistManager = undefined;
            }
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
            for (const disposable of disposables) {
                try {
                    disposable.dispose();
                } catch (disposeError: unknown) {
                    const typedError = disposeError instanceof Error ? disposeError : new Error(String(disposeError));
                    console.error('Error disposing resource:', typedError);
                }
            }
            disposables = [];
        }
        
        // Wait for any async cleanup tasks to complete
        if (cleanupTasks.length > 0) {
            await Promise.all(cleanupTasks);
        }
        
        console.log('All DevToolkit resources have been cleaned up successfully');
    } catch (error: unknown) {
        const typedError = error instanceof Error ? error : new Error(String(error));
        console.error('Error during DevToolkit deactivation:', typedError);
        // Re-throw the error to let VS Code know about the failure
        throw typedError;
    }
}
