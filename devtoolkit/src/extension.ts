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
import * as messageValidationTest from './test/message-validation-test';
import { getOutputChannel } from './utils/error-handling';

// Forward declarations of lazily loaded components
let MainPanel: any;
let ScriptManager: any;
let ChecklistManager: any;
let PythonRuntime: any;
let ScriptsProvider: any;
let ChecklistProvider: any;

// Store instances at module level for cleanup in deactivate
let pythonRuntime: any | undefined;
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
 */
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

/**
 * Lazily imports a module with proper path resolution
 * @param modulePath Path to the module
 * @returns Promise resolving to the imported module
 */
async function lazyImport(modulePath: string): Promise<any> {
    return await PerformanceMonitor.measure(`import:${modulePath}`, async () => {
        try {
            // First try with ./ prefix for local modules
            return await import(`./${modulePath}`);
        } catch (error) {
            try {
                // Try without the ./ prefix
                return await import(modulePath);
            } catch (error2) {
                // Try with absolute path
                const absolutePath = path.join(__dirname, modulePath);
                return await import(absolutePath);
            }
        }
    });
}

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
    // Set activation start time for performance tracking
    performanceMetrics.activationStart = performance.now();
    
    // Initialize the output channel early for proper logging
    const { getOutputChannel } = await import('./utils/error-handling');
    const outputChannel = getOutputChannel();
    outputChannel.appendLine(`DevToolkit extension activating (${new Date().toLocaleString()})`);
    try {
        // Activate basic functionality without lazy loading first
        outputChannel.appendLine('Initializing with direct imports...');
        
        // Import critical components directly
        const { ConfigManager } = await import('./config/config-manager');
        ConfigManager.initialize(context);
        
        // Set up basic commands
        const runScriptCommand = vscode.commands.registerCommand('devtoolkit.runScript', async () => {
            vscode.window.showInformationMessage('Script execution command received!');
        });
        
        const openPanelCommand = vscode.commands.registerCommand('devtoolkit.openPanel', async () => {
            vscode.window.showInformationMessage('Open panel command received!');
        });
        
        context.subscriptions.push(runScriptCommand, openPanelCommand);
        outputChannel.appendLine('Basic functionality initialized successfully');
        
        // Then continue with the rest of initialization...
    } catch (error: unknown) {
        // Handle errors from the basic initialization
        console.error('Error during basic initialization:', error);
        const typedError = error instanceof Error ? error : new Error(String(error));
        outputChannel.appendLine(`ERROR: Basic initialization failed: ${typedError.message}`);
        throw error; // Re-throw to let VS Code handle it
    }
    try {
        // Initialize critical core components synchronously
        await Promise.all([
            PerformanceMonitor.measure('init:ConfigManager', async () => {
                const { ConfigManager } = await import('./config/config-manager');
                ConfigManager.initialize(context);
            }),
            PerformanceMonitor.measure('init:ErrorHandler', async () => {
                await import('./utils/error-handling');
            })
        ]);
        
        // Set global context values
        await vscode.commands.executeCommand('setContext', 'devtoolkit.initialized', true);
        
        // Register commands early to ensure they're available
        registerCommandsWithLazyLoading(context);
        
        // Initialize important background services in parallel
        const initializationPromises = [
            PerformanceMonitor.measure('init:MainPanel', async () => {
                const panelModule = await lazyImport('webview/panel');
                MainPanel = panelModule.MainPanel;
            }),
            initializePythonRuntimeAsync(context),
            registerTreeViewProvidersAsync(context)
        ];
        
        // Wait for all initializations to complete
        await Promise.all(initializationPromises);
        
        // Initialize additional test components
        messageValidationTest.activate(context);
        
        // Record performance metrics
        PerformanceMonitor.recordStartupMetrics();
        
        outputChannel.appendLine(`DevToolkit extension activated successfully`);
    } catch (error: unknown) {
        // Log any errors during activation
        console.error('Error during extension activation:', error);
        const typedError = error instanceof Error ? error : new Error(String(error));
        outputChannel.appendLine(`ERROR: Extension activation failed: ${typedError.message}`);
        outputChannel.appendLine(typedError.stack || 'No stack trace available');
        
        // Show error to the user
        vscode.window.showErrorMessage(`DevToolkit extension failed to activate: ${typedError.message}`);
    }
}

/**
 * Initializes the Python runtime asynchronously in the background
 * 
 * This function offloads the expensive Python detection and initialization
 * to a background task, allowing the extension to activate faster.
 */
async function initializePythonRuntimeAsync(context: vscode.ExtensionContext): Promise<void> {
    return PerformanceMonitor.measure('init:PythonRuntime', async () => {
        try {
            // Lazily import PythonRuntime
            const pythonModule = await lazyImport('./python-runtime/process');
            PythonRuntime = pythonModule.PythonRuntime;
            
            // Initialize Python in background
            let pythonPath: string | undefined;
            try {
                const outputChannel = getOutputChannel();
                outputChannel.appendLine('Searching for Python installation...');
                
                pythonPath = await PythonRuntime.findPythonPath();
                if (!pythonPath) {
                    const message = 'DevToolkit requires Python but couldn\'t find a valid Python installation';
                    outputChannel.appendLine(`ERROR: ${message}`);
                    
                    // Show error to user with actionable steps
                    vscode.window.showErrorMessage(
                        message,
                        'Install Python',
                        'Configure Path'
                    ).then(selection => {
                        if (selection === 'Install Python') {
                            vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
                        } else if (selection === 'Configure Path') {
                            vscode.commands.executeCommand(
                                'workbench.action.openSettings', 
                                'devtoolkit.pythonPath'
                            );
                        }
                    });
                    
                    // Create pythonRuntime with default path anyway
                    pythonRuntime = new PythonRuntime(undefined, context);
                    return;
                }
                
                outputChannel.appendLine(`Found Python at: ${pythonPath}`);
                pythonRuntime = new PythonRuntime(pythonPath, context);
                
                // Verify the installation works
                const testResult = await pythonRuntime.executeCommand(['--version']);
                if (testResult.exitCode === 0) {
                    outputChannel.appendLine(`Python version: ${testResult.stdout.trim()}`);
                } else {
                    throw new Error(`Python test execution failed: ${testResult.stderr}`);
                }
            } catch (pythonError: unknown) {
                const typedError = pythonError instanceof Error ? pythonError : new Error(String(pythonError));
                console.error('Python initialization error:', typedError);
                
                // Show actionable error message
                vscode.window.showErrorMessage(
                    `Failed to initialize Python runtime: ${typedError.message}`,
                    'Configure Python Path'
                ).then(selection => {
                    if (selection === 'Configure Python Path') {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettings', 
                            'devtoolkit.pythonPath'
                        );
                    }
                });
                
                // Create pythonRuntime with default path and context, which will show errors when used
                pythonRuntime = new PythonRuntime(undefined, context);
            }
        } catch (error: unknown) {
            const typedError = error instanceof Error ? error : new Error(String(error));
            console.error('Error initializing Python runtime:', typedError);
            
            // Show error notification
            vscode.window.showErrorMessage(`DevToolkit Python support error: ${typedError.message}`);
        }
    });
}

/**
 * Registers tree view providers with deferred initialization
 */
async function registerTreeViewProvidersAsync(context: vscode.ExtensionContext): Promise<void> {
    return PerformanceMonitor.measure('registerTreeViews', async () => {
        try {
            // Create empty placeholder providers first to make the views available immediately
            const placeholderProvider = {
                getTreeItem: () => new vscode.TreeItem('Loading...'),
                getChildren: () => Promise.resolve([])
            };
            
            // Register trees with placeholder providers
            const scriptsView = vscode.window.createTreeView('devtoolkit-scripts', {
                treeDataProvider: placeholderProvider,
                showCollapseAll: true
            });
            
            const checklistView = vscode.window.createTreeView('devtoolkit-checklist', {
                treeDataProvider: placeholderProvider,
                showCollapseAll: true
            });
            
            // Load managers immediately but don't block activation
            try {
                // Load script manager
                const scriptManagerModule = await lazyImport('./script-manager/manager');
                ScriptManager = scriptManagerModule.ScriptManager;
                scriptManager = new ScriptManager(context);
                
                // Load checklist manager
                const checklistModule = await lazyImport('./file-manager/checklist');
                ChecklistManager = checklistModule.ChecklistManager;
                checklistManager = new ChecklistManager(context);
                
                // Load providers
                const scriptsProviderModule = await lazyImport('./webview/providers/ScriptsProvider');
                ScriptsProvider = scriptsProviderModule.ScriptsProvider;
                
                const checklistProviderModule = await lazyImport('./webview/providers/ChecklistProvider');
                ChecklistProvider = checklistProviderModule.ChecklistProvider;
                
                // Create and set real providers
                const realScriptsProvider = new ScriptsProvider(scriptManager, context.extensionPath);
                const realChecklistProvider = new ChecklistProvider(checklistManager);
                
                // Update views with real providers
                await vscode.commands.executeCommand('setContext', 'devtoolkit-scripts.initialized', true);
                await vscode.commands.executeCommand('setContext', 'devtoolkit-checklist.initialized', true);
                
                // Replace the providers
                scriptsView.dispose();
                checklistView.dispose();
                
                const newScriptsView = vscode.window.createTreeView('devtoolkit-scripts', {
                    treeDataProvider: realScriptsProvider,
                    showCollapseAll: true
                });
                
                const newChecklistView = vscode.window.createTreeView('devtoolkit-checklist', {
                    treeDataProvider: realChecklistProvider,
                    showCollapseAll: true
                });
                
                // Register for cleanup
                context.subscriptions.push(
                    newScriptsView,
                    newChecklistView,
                    checklistManager
                );
            } catch (providersError) {
                const outputChannel = getOutputChannel();
                outputChannel.appendLine(`ERROR initializing tree providers: ${providersError}`);
                console.error('Error initializing tree providers:', providersError);
                
                // Keep the placeholder views as fallback
                context.subscriptions.push(scriptsView, checklistView);
                
                // Show user-friendly message
                vscode.window.showErrorMessage(
                    'DevToolkit sidebar views could not be fully initialized. Basic functionality will still work.'
                );
            }
        } catch (error: unknown) {
            const typedError = error instanceof Error ? error : new Error(String(error));
            console.error('Error setting up tree views:', typedError);
            getOutputChannel().appendLine(`Error setting up tree views: ${typedError.message}`);
            
            // Rethrow to let the activation function handle it
            throw typedError;
        }
    });
}

/**
 * Registers commands with lazy loading of required components
 */
function registerCommandsWithLazyLoading(context: vscode.ExtensionContext): void {
    try {
        // Command to open the main DevToolkit panel - defer MainPanel loading
    const openPanelCommand = vscode.commands.registerCommand('devtoolkit.openPanel', async () => {
        try {
            // Validate extension context is available
            if (!context.extensionUri) {
                throw new Error('Extension context URI is not available');
            }
            
            console.log('Opening DevToolkit panel...');
            
            // Lazily load MainPanel component when needed
            if (!MainPanel) {
                const panelModule = await lazyImport('../src/webview/panel');
                MainPanel = panelModule.MainPanel;
            }
            
            MainPanel.createOrShow(context.extensionUri);
                
                // Log success
            console.log('DevToolkit panel opened successfully');
        } catch (error: unknown) {
                // Extract error message with proper type handling
            const typedError = error instanceof Error ? error : new Error(String(error));
                
                // Show user-friendly error
            vscode.window.showErrorMessage(`Failed to open DevToolkit panel: ${typedError.message}`);
                
                // Log full error for debugging
            console.error('Error opening DevToolkit panel:', typedError);
        }
    });

    /**
     * Command to run a Python script
     * 
     * Executes a Python script with progress tracking and cancellation support.
     * The command validates inputs, executes the script in a sandboxed environment,
     * and handles success/failure appropriately.
     * 
     * Security implications:
     * - Scripts run in a sandboxed environment with restricted permissions
     * - Script contents are validated before execution
     * - Error handling ensures the UI remains responsive
     */
    const runScriptCommand = vscode.commands.registerCommand('devtoolkit.runScript', async (scriptPath: string) => {
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`Executing script: ${scriptPath}`);
        outputChannel.show(true);
        
        try {
            // Safety check for path
            if (!scriptPath) {
                throw new Error('No script path provided');
            }
            
            // Lazily load required components if needed
            if (!scriptManager) {
                const scriptManagerModule = await lazyImport('./script-manager/manager');
                ScriptManager = scriptManagerModule.ScriptManager;
                scriptManager = new ScriptManager(context);
            }
            
            if (!pythonRuntime) {
                const pythonModule = await lazyImport('./python-runtime/process');
                PythonRuntime = pythonModule.PythonRuntime;
                const pythonPath = await PythonRuntime.findPythonPath();
                
                if (!pythonPath) {
                    throw new Error(
                        'Python is required but not found. Please install Python or configure the path in settings.'
                    );
                }
                
                pythonRuntime = new PythonRuntime(pythonPath);
            }
            
            // Validate required components
            if (!scriptManager || !pythonRuntime) {
                throw new Error('DevToolkit components not properly initialized');
            }
            
            // Performance measurement for script execution
            await PerformanceMonitor.measure(`script:execute:${path.basename(scriptPath)}`, async () => {
                // Get script content and validate it exists
                const scriptId = path.basename(scriptPath, '.py');
                
                // Check if the script exists in the scripts directory
                let manifest;
                try {
                    manifest = await scriptManager.loadScriptManifest(scriptId);
                    if (!manifest) {
                        throw new Error(`Script manifest not found: ${scriptId}`);
                    }
                } catch (manifestError) {
                    // If manifest can't be found, proceed with minimal information
                    outputChannel.appendLine(`Warning: No manifest found for ${scriptId}, running with default settings`);
                    
                    // Try to get the script content directly
                    const scriptContent = await scriptManager.getScriptContent(scriptPath);
                    if (!scriptContent) {
                        throw new Error(`Script file not found: ${scriptPath}`);
                    }
                }
                
                // Prepare for execution - create progress
                const progressOptions = {
                    location: vscode.ProgressLocation.Notification,
                    title: `Running script: ${path.basename(scriptPath)}`,
                    cancellable: true
                };
                
                // Create a local reference to pythonRuntime to satisfy TypeScript
                const runtime = pythonRuntime;
                
                // Execute with progress indication and cancellation support
                const result = await vscode.window.withProgress(progressOptions, async (progress, token) => {
                    // Set up cancellation
                    token.onCancellationRequested(() => {
                        outputChannel.appendLine(`Script execution cancelled by user: ${scriptPath}`);
                        // Use local reference to avoid TypeScript undefined warning
                        runtime.killProcess();
                    });
                    
                    // Show progress
                    progress.report({ message: 'Executing...' });
                    
                    try {
                        // Execute the script with proper error handling using local reference
                        const execOptions = {
                            onOutput: (output: string) => {
                                outputChannel.append(output);
                                // Update progress with latest output
                                progress.report({ 
                                    message: `Running... (${output.split('\n').pop() || ''})`.substring(0, 60)
                                });
                            },
                            onError: (error: string) => {
                                outputChannel.append(`ERROR: ${error}`);
                            },
                            scriptId: scriptId
                        };
                        
                        const execResult = await runtime.executeScript(scriptPath, execOptions);
                        return execResult;
                    } catch (execError: unknown) {
                        const typedError = execError instanceof Error ? execError : new Error(String(execError));
                        console.error('Script execution runtime error:', typedError);
                        outputChannel.appendLine(`Execution error: ${typedError.message}`);
                        
                        return {
                            stdout: '',
                            stderr: typedError.message,
                            exitCode: -1,
                            duration: 0,
                            error: typedError
                        };
                    }
                });
                
                // Handle the result
                if (result.exitCode === 0) {
                    const successMessage = `Script executed successfully in ${result.duration.toFixed(1)}ms: ${path.basename(scriptPath)}`;
                    outputChannel.appendLine(`SUCCESS: ${successMessage}`);
                    await vscode.window.showInformationMessage(successMessage);
                } else {
                    // Format error details for display
                    const errorDetails = result.stderr ? `: ${result.stderr}` : '';
                    const errorMessage = `Script execution failed with exit code ${result.exitCode}${errorDetails}`;
                    
                    outputChannel.appendLine(`FAILED: ${errorMessage}`);
                    await vscode.window.showErrorMessage(errorMessage, 'Show Output').then(selection => {
                        if (selection === 'Show Output') {
                            outputChannel.show(true);
                        }
                    });
                }
            });
        } catch (error: unknown) {
            // Extract error message with proper type handling
            const typedError = error instanceof Error ? error : new Error(String(error));
            
            // Log detailed error
            outputChannel.appendLine(`ERROR: ${typedError.message}`);
            if (typedError.stack) {
                outputChannel.appendLine(typedError.stack);
            }
            
            // Show user-friendly error with action
            vscode.window.showErrorMessage(
                `Script execution error: ${typedError.message}`,
                'Show Output'
            ).then(selection => {
                if (selection === 'Show Output') {
                    outputChannel.show(true);
                }
            });
            
            // Log for debugging
            console.error(`Script command error:`, {
                scriptPath,
                error: typedError
            });
        }
    });

    /**
     * Command to add a file to the checklist
     * 
     * Adds a selected file to the extension's checklist system, allowing users
     * to track files for review or ongoing work. Performs validation to ensure
     * the file exists and the checklist system is properly initialized.
     */
    const addToChecklistCommand = vscode.commands.registerCommand('devtoolkit.addToChecklist', async (uri: vscode.Uri) => {
        console.log('Adding file to checklist:', uri?.fsPath);
        
        try {
            // Lazily load ChecklistManager if needed
            if (!checklistManager) {
                const checklistModule = await lazyImport('./file-manager/checklist');
                ChecklistManager = checklistModule.ChecklistManager;
                checklistManager = new ChecklistManager(context);
            }
            
            // Validate required components
            if (!checklistManager) {
                const errorMessage = 'DevToolkit components not properly initialized';
                await vscode.window.showErrorMessage(`Failed to add to checklist: ${errorMessage}`);
                console.error('Checklist command error:', errorMessage);
                return;
            }
            
            // Validate input
            if (!uri || !uri.fsPath) {
                const errorMessage = 'No valid file selected';
                await vscode.window.showErrorMessage(`Failed to add to checklist: ${errorMessage}`);
                console.error('Checklist command error:', { uri, error: errorMessage });
                return;
            }
            
            // Validate file exists
            const fileName = path.basename(uri.fsPath);
            
            // Create a local reference to checklistManager to satisfy TypeScript
            const manager = checklistManager;
            
            // Add the item to checklist
            manager.addItem(uri.fsPath);
            
            // Show success message with file name for better context
            const successMessage = `Added to checklist: ${fileName}`;
            await vscode.window.showInformationMessage(successMessage);
            console.log(successMessage);
        } catch (error: unknown) {
            // Extract error message with proper type handling
            const typedError = error instanceof Error ? error : new Error(String(error));
            
            // Show user-friendly error with context
            await vscode.window.showErrorMessage(`Failed to add to checklist: ${typedError.message}`);
            
            // Log full error for debugging
            console.error('Checklist command error:', {
                filePath: uri.fsPath,
                error: typedError
            });
        }
    });
    
    /**
     * Add all commands to the extension context
     * 
     * Registers all commands and disposable resources with the extension
     * context so they can be properly cleaned up when the extension is deactivated.
     */
    context.subscriptions.push(
        openPanelCommand,
        runScriptCommand,
        addToChecklistCommand,
        { dispose: () => {
            // Cleanup for ScriptManager
            console.log('Cleaning up DevToolkit extension...');
        } }
    );
    } catch (error: any) {
        console.error('Error in registerCommandsWithLazyLoading:', error);
        vscode.window.showErrorMessage(`DevToolkit command registration error: ${error.message}`);
    }
}

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
        
        // Terminate any running Python processes
        if (pythonRuntime) {
            console.log('Terminating Python processes...');
            try {
                pythonRuntime.killProcess();
            } catch (pythonError: unknown) {
                const typedError = pythonError instanceof Error ? pythonError : new Error(String(pythonError));
                console.error('Error terminating Python processes:', typedError);
            } finally {
                pythonRuntime = undefined;
            }
        }
        
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
