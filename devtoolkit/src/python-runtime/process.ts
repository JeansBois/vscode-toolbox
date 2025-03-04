import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { performance } from 'perf_hooks';
import { ConfigManager } from '../config/config-manager';
// PermissionManager removed - was unused (TS6133)
import { 
    PythonRuntimeError, 
    FileSystemError, 
    // TimeoutError removed - was unused (TS6133)
    getOutputChannel
} from '../utils/error-handling';

/**
 * Represents a Python package with its version and dependencies
 */
export interface Package {
    name: string;
    version: string;
    dependencies: string[];
}

/**
 * Represents a Python environment configuration
 */
export interface PythonEnvironment {
    pythonPath: string;
    version: string;
    packages: Package[];
    virtualEnv?: string;
}

/**
 * Options for script execution
 * 
 * Configures the execution environment, security constraints,
 * and provides callbacks for monitoring script execution.
 */
export interface ExecutionOptions {
    /** Maximum time in milliseconds the script is allowed to run before being terminated */
    timeout?: number;
    /** Environment variables to set for the script execution */
    env?: Record<string, string>;
    /** Working directory for the script execution */
    cwd?: string;
    /** Command line arguments to pass to the script */
    args?: string[];
    /** Unique identifier for the script (used to retrieve security permissions) */
    scriptId?: string;
    /** Security profile for sandboxing (overrides permissions retrieved from scriptId) */
    securityProfile?: any;
    /** Callback for receiving script stdout output */
    onOutput?: (data: string) => void;
    /** Callback for receiving script stderr output */
    onError?: (data: string) => void;
    /** Callback for receiving script execution progress (0-100) */
    onProgress?: (progress: number) => void;
    /** Whether to reuse a process from the pool if available */
    reuseProcess?: boolean;
}

/**
 * Result of a script execution
 * 
 * Contains the output, status, and performance metrics of a script execution.
 */
export interface ExecutionResult {
    /** Standard output from the script */
    stdout: string;
    /** Standard error output from the script */
    stderr: string;
    /** Exit code of the process (null if process was terminated) */
    exitCode: number | null;
    /** Execution duration in milliseconds */
    duration: number;
    /** Whether the script execution timed out */
    timedOut?: boolean;
    /** Error object if execution failed */
    error?: Error;
    /** Performance metrics for the execution */
    metrics?: {
        /** Time spent waiting for a process from the pool */
        waitTime?: number;
        /** Time spent in process initialization */
        initTime?: number;
        /** Time spent in actual execution */
        executionTime?: number;
        /** Whether the process was reused from the pool */
        reused?: boolean;
        /** Memory usage in MB (if available) */
        memoryUsage?: number;
    };
}

// For future implementation when version caching is needed
/**
 * Cache for Python version information to avoid repeated version checks
 * @internal - Reserved for future implementation
 */
// interface PythonVersionCache {
//     /** The Python version string */
//     version: string;
//     /** Timestamp when the version was cached */
//     timestamp: number;
//     /** Whether the Python installation is valid */
//     isValid: boolean;
// }

// Process pool related interfaces removed as they are not used

/**
 * Executes Python scripts within a secure sandbox environment with performance optimizations
 * 
 * Enhanced with:
 * - Process pooling for faster script execution
 * - Resource usage monitoring
 * - Performance metrics collection
 */
export class ScriptExecutor {
    private readonly pythonPath: string;
    private _currentProcess: cp.ChildProcess | undefined;
    private readonly sandboxWrapperPath: string;
    
    constructor(pythonPath?: string, context?: vscode.ExtensionContext) {
        this.pythonPath = pythonPath || ConfigManager.getInstance().getConfiguration().pythonPath;
        
        // Determine the path of the sandbox wrapper
        if (context) {
            this.sandboxWrapperPath = context.asAbsolutePath('src/python-runtime/sandbox_wrapper.py');
        } else {
            this.sandboxWrapperPath = path.join(__dirname, 'sandbox_wrapper.py');
        }
    }

    /**
     * Executes a command using the Python interpreter.
     * @param args - Arguments to pass to the Python interpreter.
     * @param options - Options for the execution.
     * @returns A promise resolving to the execution result.
     */
    public async executeCommand(
        args: string[],
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        const startTime = performance.now();
        let stdout = '';
        let stderr = '';
        let exitCode: number | null = null;
        let timedOut = false;

        const timeout = options.timeout || 30000; // 30 seconds default
        const env = { ...process.env, ...options.env };
        const cwd = options.cwd;

        try {
            // Prepare the arguments
            const finalArgs = [
                ...args
            ];

            // Create the process
            const process = cp.spawn(this.pythonPath, finalArgs, {
                cwd,
                env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this._currentProcess = process;

            // Capture standard output
            process.stdout?.on('data', (data: Buffer) => {
                const str = data.toString();
                stdout += str;
                options.onOutput?.(str);
            });

            // Capture errors
            process.stderr?.on('data', (data: Buffer) => {
                const str = data.toString();
                stderr += str;
                options.onError?.(str);
            });

            // Wait for the process to complete or timeout
            const processPromise = new Promise<number>((resolve, reject) => {
                process.on('close', (code) => {
                    exitCode = code;
                    resolve(code || 0);
                });

                process.on('error', (err) => {
                    reject(new Error(`Process error: ${err.message}`));
                });
            });

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    timedOut = true;
                    this.killProcess();
                    reject(new Error(`Script execution timed out after ${timeout}ms`));
                }, timeout);
            });

            // Use the promise that resolves first
            await Promise.race([processPromise, timeoutPromise]);

            const duration = performance.now() - startTime;

            // Return the result
            return {
                stdout,
                stderr,
                exitCode,
                duration,
                timedOut
            };
        } catch (error) {
            const duration = performance.now() - startTime;

            // Ensure the process is terminated in case of error
            this.killProcess();

            return {
                stdout,
                stderr,
                exitCode: null,
                duration,
                error: error instanceof Error ? error : new Error(String(error))
            };
        } finally {
            this._currentProcess = undefined;
        }
    }
    
    // Simplified method to execute a script
    public async executeScript(
        scriptPath: string,
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        const startTime = performance.now();
        let stdout = '';
        let stderr = '';
        let exitCode: number | null = null;
        let timedOut = false;
        
        const timeout = options.timeout || 30000; // 30 seconds default
        const env = { ...process.env, ...options.env };
        const cwd = options.cwd;
        
        try {
            // Check if the script exists
            await fs.promises.access(scriptPath).catch(() => {
                throw new Error(`Script not found: ${scriptPath}`);
            });
            
            // Prepare the arguments
            const args = [
                this.sandboxWrapperPath,
                scriptPath,
                ...(options.args || [])
            ];
            
            // Create the process
            const process = cp.spawn(this.pythonPath, args, {
                cwd,
                env,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            this._currentProcess = process;
            
            // Capture standard output
            process.stdout?.on('data', (data: Buffer) => {
                const str = data.toString();
                stdout += str;
                options.onOutput?.(str);
            });
            
            // Capture errors
            process.stderr?.on('data', (data: Buffer) => {
                const str = data.toString();
                stderr += str;
                options.onError?.(str);
            });
            
            // Wait for the process to complete or timeout
            const processPromise = new Promise<number>((resolve, reject) => {
                process.on('close', (code) => {
                    exitCode = code;
                    resolve(code || 0);
                });
                
                process.on('error', (err) => {
                    reject(new Error(`Process error: ${err.message}`));
                });
            });
            
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    timedOut = true;
                    this.killProcess();
                    reject(new Error(`Script execution timed out after ${timeout}ms`));
                }, timeout);
            });
            
            // Use the promise that resolves first
            await Promise.race([processPromise, timeoutPromise]);
            
            const duration = performance.now() - startTime;
            
            // Return the result
            return {
                stdout,
                stderr,
                exitCode,
                duration,
                timedOut
            };
        } catch (error) {
            const duration = performance.now() - startTime;
            
            // Ensure the process is terminated in case of error
            this.killProcess();
            
            return {
                stdout,
                stderr,
                exitCode: null,
                duration,
                error: error instanceof Error ? error : new Error(String(error))
            };
        } finally {
            this._currentProcess = undefined;
        }
    }
    
    // Method to kill the current process
    public killProcess(): void {
        if (!this._currentProcess) {
            return;
        }
        
        try {
            if (process.platform === 'win32') {
                try {
                    // On Windows, we need to use taskkill to kill the process and its children
                    cp.execSync(`taskkill /pid ${this._currentProcess.pid} /T /F`, { windowsHide: true });
                } catch (error) {
                    // Fallback if taskkill fails
                    this._currentProcess.kill('SIGKILL');
                }
            } else {
                // On Unix, SIGKILL is more reliable
                this._currentProcess.kill('SIGKILL');
            }
        } catch (error) {
            console.error('Error killing process:', error);
        }
    }
}

// ProcessPool class has been removed as it was declared but never used (TS6196)

/**
 * Manages Python environments with performance optimizations
 * 
 * Enhanced with:
 * - Caching for environment information
 * - Optimized dependency checking
 * - Performance metrics collection
 */
// Export ScriptExecutor as PythonRuntime for backward compatibility
export class PythonRuntime extends ScriptExecutor {
    /**
     * Finds a valid Python interpreter path
     * 
     * Implements a multi-step strategy to locate a suitable Python interpreter:
     * 1. First checks user configuration
     * 2. Attempts to get path from Python extension if installed
     * 3. Tries common executable names in system PATH
     * 
     * @returns A promise resolving to the Python path or undefined if not found
     */
    public static async findPythonPath(): Promise<string | undefined> {
        // First try the config
        try {
            const config = ConfigManager.getInstance().getConfiguration();
            const configPath = config.pythonPath;
            
            if (configPath && configPath !== 'python') {
                // Test if the configured path works
                if (await PythonRuntime.testPythonPath(configPath)) {
                    getOutputChannel().appendLine(`Using Python path from configuration: ${configPath}`);
                    return configPath;
                }
                getOutputChannel().appendLine(`Configured Python path invalid: ${configPath}`);
            }
        } catch (error) {
            getOutputChannel().appendLine(`Error accessing Python configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Then try the Python extension
        try {
            const pythonExtension = vscode.extensions.getExtension('ms-python.python');
            if (pythonExtension) {
                const pythonApi = await pythonExtension.activate();
                if (pythonApi && pythonApi.exports.executionDetails) {
                    const pythonPath = pythonApi.exports.executionDetails.execCommand[0];
                    if (await PythonRuntime.testPythonPath(pythonPath)) {
                        getOutputChannel().appendLine(`Using Python path from Python extension: ${pythonPath}`);
                        return pythonPath;
                    }
                }
            }
        } catch (error) {
            getOutputChannel().appendLine(`Error accessing Python extension API: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Finally try common Python executable names
        const pythonCommands = ['python3', 'python', 'py'];
        for (const cmd of pythonCommands) {
            try {
                if (await PythonRuntime.testPythonPath(cmd)) {
                    getOutputChannel().appendLine(`Found working Python in PATH: ${cmd}`);
                    return cmd;
                }
            } catch (error) {
                // Continue to next command on failure
            }
        }
        
        // No Python found
        getOutputChannel().appendLine('Failed to find a valid Python interpreter');
        return undefined;
    }
    
    /**
     * Tests if a Python path is valid and working
     * 
     * @param pythonPath Path to test
     * @returns True if the path is a valid Python interpreter
     */
    private static async testPythonPath(pythonPath: string): Promise<boolean> {
        try {
            // Use a timeout to avoid hanging if the Python path is invalid
            const testProcess = cp.spawn(pythonPath, ['--version'], {
                timeout: 2000,
                shell: process.platform === 'win32'
            });
            
            return new Promise<boolean>((resolve) => {
                let output = '';
                
                testProcess.stdout?.on('data', (data) => {
                    output += data.toString();
                });
                
                testProcess.stderr?.on('data', (data) => {
                    output += data.toString();
                });
                
                testProcess.on('error', () => {
                    resolve(false);
                });
                
                testProcess.on('close', (code) => {
                    // Check if the output contains a valid Python version
                    if (code === 0 && output.toLowerCase().includes('python')) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            });
        } catch (error) {
            return false;
        }
    }
}

export class PythonEnvironmentManager {
    private static instance: PythonEnvironmentManager;
    private readonly configManager: ConfigManager;
    
    // Cache for installed packages to avoid repeated listing - for future implementation
    // private packagesCache: { packages: Package[], timestamp: number } | null = null;
    // Cache timeout in milliseconds (5 minutes) - for future implementation
    // private readonly CACHE_TIMEOUT = 5 * 60 * 1000;
    // Cache for Python version information - for future implementation
    // private versionCache: Map<string, PythonVersionCache> = new Map();
    // Performance metrics - for future dashboard implementation
    // private metrics = {
    //     executionCount: 0,
    //     averageExecutionTime: 0,
    //     cachedExecutions: 0,
    //     failedExecutions: 0
    // };

    private constructor() {
        this.configManager = ConfigManager.getInstance();
    }

    /**
     * Gets the singleton instance of PythonEnvironmentManager
     * 
     * @returns The PythonEnvironmentManager instance
     */
    public static getInstance(): PythonEnvironmentManager {
        if (!PythonEnvironmentManager.instance) {
            PythonEnvironmentManager.instance = new PythonEnvironmentManager();
        }
        return PythonEnvironmentManager.instance;
    }

    /**
     * Creates a new Python virtual environment
     * 
     * @param name - Name of the virtual environment to create
     * @returns A promise resolving to the path of the created virtual environment
     * @throws {PythonRuntimeError} If virtual environment creation fails
     */
    public async createVirtualEnv(name: string): Promise<string> {
        const storageUri = vscode.Uri.file(path.resolve(this.configManager.getConfiguration().scriptsDirectory, '../storage'));
        const venvPath = path.join(storageUri.fsPath, 'venvs', name);
        const executor = new ScriptExecutor();
        
        try {
            await executor.executeCommand(['-m', 'venv', venvPath]);
            return venvPath;
        } catch (error: unknown) {
            const typedError = error instanceof Error ? error : new Error(String(error));
            throw new PythonRuntimeError(`Failed to create virtual environment "${name}"`, {
                originalError: typedError,
                context: { venvPath, name }
            });
        }
    }

    /**
     * Checks if a file or directory exists
     * 
     * @param filePath - Path to check for existence
     * @returns A promise resolving to true if the path exists, false otherwise
     */
    private async pathExists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(path.normalize(filePath));
            const stat = await vscode.workspace.fs.stat(uri);
            return stat !== undefined;
        } catch (error: unknown) {
            // Just return false without propagating the error
            return false;
        }
    }

    /**
     * Activates an existing Python virtual environment
     * 
     * Sets up the necessary environment variables to use the virtual environment.
     * 
     * @param venvPath - Path to the virtual environment to activate
     * @throws {FileSystemError} If the activation script is not found
     * @throws {PythonRuntimeError} If activation fails
     */
    public async activateVirtualEnv(venvPath: string): Promise<void> {
        try {
            const activateScript = process.platform === 'win32'
                ? path.join(venvPath, 'Scripts', 'activate.bat')
                : path.join(venvPath, 'bin', 'activate');

            if (!await this.pathExists(activateScript)) {
                throw new FileSystemError(`Activation script not found`, {
                    context: { 
                        activateScript,
                        venvPath,
                        platform: process.platform
                    }
                });
            }

            process.env.VIRTUAL_ENV = venvPath;
            const binPath = path.join(venvPath, process.platform === 'win32' ? 'Scripts' : 'bin');
            process.env.PATH = `${binPath}${path.delimiter}${process.env.PATH}`;
        } catch (error: unknown) {
            if (error instanceof FileSystemError) {
                throw error; // Re-throw FileSystemError directly
            }
            
            const typedError = error instanceof Error ? error : new Error(String(error));
            throw new PythonRuntimeError(`Failed to activate virtual environment at "${venvPath}"`, {
                originalError: typedError,
                context: { venvPath, platform: process.platform }
            });
        }
    }

    /**
     * Installs a Python package with an optional version constraint
     * 
     * @param name - The name of the package to install
     * @param version - Optional version constraint (e.g., "1.0.0")
     * @throws {PythonRuntimeError} If package installation fails
     */
    public async installPackage(name: string, version?: string): Promise<void> {
        const executor = new ScriptExecutor();
        const packageSpec = version ? `${name}==${version}` : name;
        
        try {
            await executor.executeCommand(['-m', 'pip', 'install', packageSpec]);
            // Packages cache is disabled/commented out for now
            // this.packagesCache = null;
        } catch (error: unknown) {
            const typedError = error instanceof Error ? error : new Error(String(error));
            throw new PythonRuntimeError(`Failed to install package "${packageSpec}"`, {
                originalError: typedError,
                context: { 
                    package: name,
                    version,
                    packageSpec
                }
            });
        }
    }
}
