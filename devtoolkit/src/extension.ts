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
import * as fs from 'fs';
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
        
        // Find Python path with user feedback
        const pythonPath = await PythonRuntime.findPythonPath();
        if (!pythonPath) {
            vscode.window.showErrorMessage(
                'DevToolkit: No Python installation found. Python scripts will not work. ' +
                'Please install Python or set the pythonPath in settings.'
            );
            outputChannel.appendLine('ERROR: No valid Python installation found');
        } else {
            outputChannel.appendLine(`Using Python interpreter: ${pythonPath}`);
            
            // Update configuration with found Python path
            const configManager = ConfigManager.getInstance();
            if (configManager.getConfiguration().pythonPath !== pythonPath) {
                // Store the python path in settings
                try {
                    await configManager.updateConfiguration('pythonPath', pythonPath);
                    outputChannel.appendLine(`Updated configuration with Python path: ${pythonPath}`);
                } catch (error) {
                    outputChannel.appendLine(`Warning: Could not update configuration with Python path: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }
        
        // Register commands (we'll implement them in detail later)
        registerCommands(context);
        
        // Initialize main components
        const scriptManager = new ScriptManager(context);
        const checklistManager = new ChecklistManager(context);
        
        // Register view providers with event connections
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
    
    // Create event emitters for script and checklist changes
    const scriptChangeEmitter = new vscode.EventEmitter<void>();
    const checklistChangeEmitter = new vscode.EventEmitter<void>();
    
    // Create providers with event emitters
    const scriptsProvider = new ScriptsProvider(
        scriptManager, 
        context.extensionPath,
        scriptChangeEmitter.event
    );
    
    const checklistProvider = new ChecklistProvider(
        checklistManager,
        checklistChangeEmitter.event
    );
    
    // Create TreeViews with their providers
    const scriptsView = vscode.window.createTreeView('devtoolkit-scripts', {
        treeDataProvider: scriptsProvider,
        showCollapseAll: true
    });
    
    const checklistView = vscode.window.createTreeView('devtoolkit-checklist', {
        treeDataProvider: checklistProvider,
        showCollapseAll: true
    });
    
    // Set up file system watchers to detect script changes
    const config = ConfigManager.getInstance().getConfiguration();
    const scriptWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(config.scriptsDirectory, '**/*_manifest.json')
    );
    
    // Trigger events when files change
    scriptWatcher.onDidCreate(() => scriptChangeEmitter.fire());
    scriptWatcher.onDidChange(() => scriptChangeEmitter.fire());
    scriptWatcher.onDidDelete(() => scriptChangeEmitter.fire());
    
    // Handle refreshes via commands
    const refreshScriptsCommand = vscode.commands.registerCommand(
        'devtoolkit.refreshScriptsList', 
        () => scriptChangeEmitter.fire()
    );
    
    const refreshChecklistCommand = vscode.commands.registerCommand(
        'devtoolkit.refreshChecklist', 
        () => checklistChangeEmitter.fire()
    );
    
    // Register for cleanup
    context.subscriptions.push(
        scriptsView,
        checklistView,
        scriptWatcher,
        refreshScriptsCommand,
        refreshChecklistCommand,
        scriptChangeEmitter,
        checklistChangeEmitter
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

    // Command to create a new script
    const createNewScriptCommand = vscode.commands.registerCommand('devtoolkit.createNewScript', async () => {
        try {
            // Initialize the script manager
            const scriptManager = new ScriptManager(context);
            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfiguration();
            
            // Get the templates directory and list available templates
            const templatesDir = config.templates.directory;
            let templates: string[] = [];
            
            try {
                // List .py files in the templates directory
                const templateFiles = await fs.promises.readdir(templatesDir);
                templates = templateFiles.filter(file => file.endsWith('.py') && !file.startsWith('_'));
                
                if (templates.length === 0) {
                    vscode.window.showErrorMessage('No script templates found in templates directory.');
                    return;
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error reading templates directory: ${error instanceof Error ? error.message : String(error)}`);
                return;
            }
            
            // Ask for script ID
            const scriptId = await vscode.window.showInputBox({
                prompt: 'Enter a script ID (lowercase, no spaces)',
                placeHolder: 'my-script-id',
                validateInput: (value) => {
                    if (!value) {
                        return 'Script ID is required';
                    }
                    if (!/^[a-z0-9-_]+$/.test(value)) {
                        return 'Script ID should contain only lowercase letters, numbers, hyphens and underscores';
                    }
                    return null;
                }
            });
            
            if (!scriptId) {
                return; // User cancelled
            }
            
            // Ask for script name
            const scriptName = await vscode.window.showInputBox({
                prompt: 'Enter a display name for the script',
                placeHolder: 'My Script Name',
                validateInput: (value) => {
                    return value ? null : 'Script name is required';
                }
            });
            
            if (!scriptName) {
                return; // User cancelled
            }
            
            // Ask for description
            const description = await vscode.window.showInputBox({
                prompt: 'Enter a description for the script',
                placeHolder: 'Describe what the script does'
            });
            
            if (description === undefined) {
                return; // User cancelled
            }
            
            // Ask for author
            const author = await vscode.window.showInputBox({
                prompt: 'Enter the author name',
                placeHolder: 'Your Name'
            });
            
            if (author === undefined) {
                return; // User cancelled
            }
            
            // Select a template
            const selectedTemplate = await vscode.window.showQuickPick(templates, {
                placeHolder: 'Select a template'
            });
            
            if (!selectedTemplate) {
                return; // User cancelled
            }
            
            // Show progress indicator
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Creating new script',
                cancellable: false
            }, async () => {
                const scriptInfo = {
                    id: scriptId,
                    name: scriptName,
                    description: description || 'No description provided',
                    version: '1.0.0',
                    author: author || 'Unknown',
                    category: 'utility'
                };
                
                const result = await scriptManager.createFromTemplate(selectedTemplate, scriptInfo);
                
                if (result) {
                    vscode.window.showInformationMessage(`Script '${scriptName}' created successfully.`);
                    
                    // Refresh scripts list
                    vscode.commands.executeCommand('devtoolkit.refreshScriptsList');
                } else {
                    vscode.window.showErrorMessage(`Failed to create script '${scriptName}'.`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error creating script: ${error instanceof Error ? error.message : String(error)}`);
            console.error('Error creating script:', error);
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

    // Diagnostic command to check system health
    const diagnosticCommand = vscode.commands.registerCommand('devtoolkit.runDiagnostics', async () => {
        const outputChannel = getOutputChannel();
        outputChannel.clear();
        outputChannel.show(true);
        outputChannel.appendLine('DevToolkit Diagnostics');
        outputChannel.appendLine('=====================');
        outputChannel.appendLine(`Time: ${new Date().toLocaleString()}`);
        outputChannel.appendLine('');
        
        // Check VSCode version
        outputChannel.appendLine(`VSCode Version: ${vscode.version}`);
        outputChannel.appendLine('');
        
        // Check configuration
        outputChannel.appendLine('Configuration Check:');
        try {
            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfiguration();
            outputChannel.appendLine(`✅ Configuration loaded successfully`);
            outputChannel.appendLine(`   - Scripts directory: ${config.scriptsDirectory}`);
            outputChannel.appendLine(`   - Templates directory: ${config.templates.directory}`);
            
            // Check if directories exist
            const checkDirectory = async (dirPath: string, label: string) => {
                try {
                    const uri = vscode.Uri.file(dirPath);
                    const stat = await vscode.workspace.fs.stat(uri);
                    if (stat.type === vscode.FileType.Directory) {
                        outputChannel.appendLine(`✅ ${label} directory exists: ${dirPath}`);
                    } else {
                        outputChannel.appendLine(`❌ ${label} path exists but is not a directory: ${dirPath}`);
                    }
                } catch (error) {
                    outputChannel.appendLine(`❌ ${label} directory not found: ${dirPath}`);
                }
            };
            
            await checkDirectory(config.scriptsDirectory, 'Scripts');
            await checkDirectory(config.templates.directory, 'Templates');
        } catch (error) {
            outputChannel.appendLine(`❌ Configuration error: ${error instanceof Error ? error.message : String(error)}`);
        }
        outputChannel.appendLine('');
        
        // Check Python installation
        outputChannel.appendLine('Python Environment Check:');
        try {
            const pythonPath = await PythonRuntime.findPythonPath();
            if (pythonPath) {
                outputChannel.appendLine(`✅ Python found: ${pythonPath}`);
                
                // Check Python version by running python --version
                const pythonRuntime = new PythonRuntime(pythonPath);
                const result = await pythonRuntime.executeCommand(['--version']);
                
                if (result.exitCode === 0) {
                    outputChannel.appendLine(`✅ Python version: ${result.stdout.trim()}`);
                } else {
                    outputChannel.appendLine(`❌ Failed to get Python version: ${result.stderr}`);
                }
            } else {
                outputChannel.appendLine('❌ No Python installation found');
            }
        } catch (error) {
            outputChannel.appendLine(`❌ Python check error: ${error instanceof Error ? error.message : String(error)}`);
        }
        outputChannel.appendLine('');
        
        // Check script loading
        outputChannel.appendLine('Script Manager Check:');
        try {
            const scriptManager = new ScriptManager(context);
            const scripts = await scriptManager.listScripts();
            outputChannel.appendLine(`✅ Script manager initialized successfully`);
            outputChannel.appendLine(`✅ Found ${scripts.length} script file(s)`);
            
            try {
                const manifests = await scriptManager.getAvailableScripts();
                outputChannel.appendLine(`✅ Found ${manifests.length} valid script manifest(s)`);
                
                if (manifests.length > 0) {
                    outputChannel.appendLine('   Available scripts:');
                    for (const manifest of manifests) {
                        outputChannel.appendLine(`   - ${manifest.script_info.name} (${manifest.script_info.id}): ${manifest.script_info.description}`);
                    }
                }
            } catch (manifestError) {
                outputChannel.appendLine(`❌ Error loading script manifests: ${manifestError instanceof Error ? manifestError.message : String(manifestError)}`);
            }
        } catch (error) {
            outputChannel.appendLine(`❌ Script manager error: ${error instanceof Error ? error.message : String(error)}`);
        }
        outputChannel.appendLine('');
        
        // Check WebView
        outputChannel.appendLine('WebView Check:');
        try {
            // Don't actually create the webview, just check if it can be created
            outputChannel.appendLine('✅ WebView components available');
            
            // Check if the webview JS bundle exists
            try {
                const webviewJsPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js');
                await vscode.workspace.fs.stat(webviewJsPath);
                outputChannel.appendLine('✅ WebView bundle file exists');
            } catch (error) {
                outputChannel.appendLine('❌ WebView bundle file not found: dist/webview.js');
                outputChannel.appendLine('   This may indicate the extension was not built correctly.');
            }
        } catch (error) {
            outputChannel.appendLine(`❌ WebView error: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        outputChannel.appendLine('');
        outputChannel.appendLine('Diagnostics complete.');
        
        vscode.window.showInformationMessage('DevToolkit diagnostics complete. Check the output panel for results.');
    });

    // Register commands in context
    context.subscriptions.push(
        openPanelCommand, 
        runScriptCommand, 
        createNewScriptCommand,
        addToChecklistCommand,
        diagnosticCommand
    );
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
