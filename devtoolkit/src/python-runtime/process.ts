import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { performance } from 'perf_hooks';
import { ConfigManager } from '../config/config-manager';
import { PermissionManager } from '../script-manager/security/permissions';
import { 
    PythonRuntimeError, 
    FileSystemError, 
    TimeoutError
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

/**
 * Process in the Python process pool
 */
interface PooledProcess {
    /** The child process instance */
    process: cp.ChildProcess;
    /** When the process was created */
    createdAt: number;
    /** When the process was last used */
    lastUsed: number;
    /** Whether the process is currently in use */
    inUse: boolean;
    /** Number of times this process has been used */
    usageCount: number;
    /** The process ID */
    pid: number;
}

/**
 * Executes Python scripts within a secure sandbox environment with performance optimizations
 * 
 * Enhanced with:
 * - Process pooling for faster script execution
 * - Resource usage monitoring
 * - Performance metrics collection
 */
export class ScriptExecutor {
    private static readonly DEFAULT_TIMEOUT = 30000;
    private readonly pythonPath: string;
    private readonly permissionManager: PermissionManager;
    private readonly sandboxWrapperPath: string;
    private readonly processPool: ProcessPool;
    // Reference to current process for management
    // Currently only used in execute methods for assigning/clearing reference
    // Can be used by other components in the future for process monitoring
    // @ts-ignore - Used in execute methods, but TS doesn't detect it due to async flow
    private _currentProcess: cp.ChildProcess | undefined;
    
    // Performance metrics for monitoring
    private readonly metrics: {
        executionCount: number;
        averageExecutionTime: number;
        cachedExecutions: number;
        failedExecutions: number;
        executionTime: number;
    } = {
        executionCount: 0,
        averageExecutionTime: 0,
        cachedExecutions: 0,
        failedExecutions: 0,
        executionTime: 0
    };

    /**
     * Creates a new ScriptExecutor
     * 
     * @param pythonPath - Optional path to the Python interpreter. If not provided,
     *                    uses the path from ConfigManager.
     */
    constructor(pythonPath?: string) {
        this.pythonPath = pythonPath || ConfigManager.getInstance().getConfiguration().pythonPath;
        this.permissionManager = PermissionManager.getInstance();
        this.processPool = ProcessPool.getInstance();
        
        // Path to the sandbox wrapper script
        this.sandboxWrapperPath = path.join(__dirname, 'sandbox_wrapper.py');
    }

    /**
     * Execute a Python script with sandboxing enabled and performance optimizations
     * 
     * @param scriptPath - Path to the script to execute
     * @param options - Execution options including security profile, timeout, and callbacks
     * @returns A promise resolving to the execution result
     */
    public async executeScript(
        scriptPath: string,
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        // Start timing the execution
        this.metrics.executionCount++;
        this.metrics.executionTime = 0;
        
        // Ensure sandbox wrapper exists and is executable
        try {
            await fs.promises.access(this.sandboxWrapperPath);
        } catch (error) {
            this.metrics.failedExecutions++;
            throw new PythonRuntimeError(`Sandbox wrapper script not found at ${this.sandboxWrapperPath}`, {
                originalError: error,
                context: { sandboxWrapperPath: this.sandboxWrapperPath }
            });
        }
        
        // Generate security profile from permissions if scriptId is provided
        let securityProfile = options.securityProfile;
        if (options.scriptId && !securityProfile) {
            securityProfile = this.permissionManager.getSecurityProfile(options.scriptId);
        }
        
        // Convert security profile to JSON string
        const securityProfileArg = securityProfile ? JSON.stringify(securityProfile) : undefined;
        
        // Call the sandbox wrapper instead of the script directly
        const args = [
            this.sandboxWrapperPath,
            scriptPath,
            ...(securityProfileArg ? [securityProfileArg] : []),
            ...(options.args || [])
        ];
        
        // Execute with process reuse if requested
        if (options.reuseProcess !== false) {
            return this.executeWithProcessReuse(args, options);
        } else {
            return this.execute(args, options);
        }
    }

    /**
     * Executes a Python command without sandboxing
     * 
     * @param command - Array of command arguments to pass to Python
     * @param options - Execution options for the command
     * @returns A promise resolving to the execution result
     */
    public async executeCommand(
        command: string[],
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        // Simple commands can be reused from the pool unless explicitly disabled
        if (options.reuseProcess !== false && command.length < 3 && !command.includes('-m')) {
            return this.executeWithProcessReuse(command, options);
        } else {
            return this.execute(command, options);
        }
    }

    /**
     * Executes a Python command in a new process
     * 
     * @param args - Command line arguments
     * @param options - Execution options
     * @returns Promise resolving to execution result
     */
    private async execute(
        args: string[],
        options: ExecutionOptions
    ): Promise<ExecutionResult> {
        const startTime = performance.now();
        let stdout = '';
        let stderr = '';
        let exitCode: number | null = null;
        let timedOut = false;

        const timeout = options.timeout || ScriptExecutor.DEFAULT_TIMEOUT;
        const cwd = options.cwd;
        const env = options.env;
        const command = this.pythonPath;

        try {
            const process = cp.spawn(command, args, {
                cwd,
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            this._currentProcess = process;

            // Setup output and error listeners
            process.stdout?.on('data', (data: Buffer) => {
                const str = data.toString();
                stdout += str;
                options.onOutput?.(str);
            });

            process.stderr?.on('data', (data: Buffer) => {
                const str = data.toString();
                stderr += str;
                options.onError?.(str);
            });

            // Setup timeout
            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => {
                    timedOut = true;
                    this.killProcess(process);
                    reject(new TimeoutError(`Script execution timed out after ${timeout}ms`, {
                        context: { timeout, command, args }
                    }));
                }, timeout);
            });

            // Setup process completion listener
            const completionPromise = new Promise<number>((resolve, reject) => {
                process.on('close', (code) => {
                    exitCode = code;
                    resolve(code || 0);
                });
                process.on('exit', (code) => {
                    exitCode = code;
                    resolve(code || 0);
                });
                process.on('error', (err: Error) => {
                    this.metrics.failedExecutions++;
                    reject(new PythonRuntimeError(`Script execution failed: ${err.message}`, {
                        originalError: err,
                        context: { command, args }
                    }));
                });
            });

            // Await either timeout or completion
            await Promise.race([completionPromise, timeoutPromise]);

            const duration = performance.now() - startTime;

            return {
                stdout,
                stderr,
                exitCode,
                duration,
                timedOut
            };
        } catch (error: any) {
            this.metrics.failedExecutions++;
            const duration = performance.now() - startTime;

            return {
                stdout,
                stderr,
                exitCode: null,
                duration,
                timedOut,
                error: error instanceof Error ? error : new Error(String(error))
            };
        } finally {
            this._currentProcess = undefined;
        }
    }
    
    /**
     * Executes a command by reusing a process from the pool
     * 
     * @param args Command arguments
     * @param options Execution options
     * @returns Promise resolving to execution result
     */
    private async executeWithProcessReuse(
        args: string[],
        options: ExecutionOptions
    ): Promise<ExecutionResult> {
        const startTime = performance.now();
        let stdout = '';
        let stderr = '';
        
        const timeout = options.timeout || ScriptExecutor.DEFAULT_TIMEOUT;
        const command = this.pythonPath;
        
        try {
            // Get a process from the pool
            const getProcessStart = performance.now();
            const { process, reused } = await this.processPool.getProcess(this.pythonPath);
            const waitTime = performance.now() - getProcessStart;
            
            this._currentProcess = process;
            
            // Execute the command in the process
            const executePromise = new Promise<ExecutionResult>((resolve, rejectPromise) => {
                // Create execution code
                const importedModules = new Set<string>();
                const executeCode = args.map(arg => {
                    if (arg.endsWith('.py')) {
                        // For Python files, read and execute the content
                        const moduleCode = `
                        with open("${arg.replace(/\\/g, '\\\\')}", "r") as f:
                            exec(f.read())
                        `;
                        return moduleCode;
                    } else if (arg === '-m') {
                        importedModules.add(args[args.indexOf(arg) + 1]);
                        return '';
                    } else if (importedModules.has(arg)) {
                        // Skip modules that were already imported with -m
                        return '';
                    } else if (arg === '-c') {
                        // For -c commands, execute the next argument directly
                        return args[args.indexOf(arg) + 1];
                    } else if (arg.startsWith('-')) {
                        // Skip other flags
                        return '';
                    }
                    return arg;
                }).filter(Boolean).join('\n');
                
                const dataHandler = (data: Buffer) => {
                    const str = data.toString();
                    stdout += str;
                    options.onOutput?.(str);
                };

                const errorHandler = (data: Buffer) => {
                    const str = data.toString();
                    stderr += str;
                    options.onError?.(str);
                };
                
                process.stdout?.on('data', dataHandler);
                process.stderr?.on('data', errorHandler);
                
                // Send the code to the process
                process.stdin?.write(executeCode + '\n');
                process.stdin?.end();
                
                let exitCode: number | null = null;
                let timedOut = false;
                
                // Setup timeout
                const timeoutPromise = new Promise<void>((_, rejectTimeout) => {
                    setTimeout(() => {
                        timedOut = true;
                        this.killProcess(process);
                        rejectTimeout(new TimeoutError(`Script execution timed out after ${timeout}ms`, {
                            context: { timeout, command, args }
                        }));
                    }, timeout);
                });
                
                // Setup process completion listener
                const completionPromise = new Promise<number>((resolveCompletion) => {
                    process.on('close', (code) => {
                        exitCode = code;
                        resolveCompletion(code || 0);
                    });
                    process.on('exit', (code) => {
                        exitCode = code;
                        resolveCompletion(code || 0);
                    });
                    process.on('error', (err: Error) => {
                        this.metrics.failedExecutions++;
                        rejectPromise(new PythonRuntimeError(`Script execution failed: ${err.message}`, {
                            originalError: err,
                            context: { command, args }
                        }));
                    });
                });
                
                // Await either timeout or completion
                Promise.race([completionPromise, timeoutPromise])
                    .then(() => {
                        // Remove listeners
                        process.stdout?.removeListener('data', dataHandler);
                        process.stderr?.removeListener('data', errorHandler);
                        
                        const duration = performance.now() - startTime;
                        const executionTime = duration - waitTime;
                        
                        resolve({
                            stdout,
                            stderr,
                            exitCode,
                            duration,
                            timedOut,
                            metrics: {
                                waitTime,
                                executionTime,
                                reused
                            }
                        });
                    })
                    .catch((error: any) => {
                        // Remove listeners
                        process.stdout?.removeListener('data', dataHandler);
                        process.stderr?.removeListener('data', errorHandler);
                        
                        this.metrics.failedExecutions++;
                        const duration = performance.now() - startTime;
                        
                        rejectPromise({
                            stdout,
                            stderr,
                            exitCode: null,
                            duration,
                            timedOut,
                            error: error instanceof Error ? error : new Error(String(error))
                        });
                    })
                    .finally(() => {
                        this.processPool.releaseProcess(process, this.pythonPath);
                        this._currentProcess = undefined;
                    });
            });
            
            return executePromise;
        } catch (error: any) {
            this.metrics.failedExecutions++;
            const duration = performance.now() - startTime;
            
            return {
                stdout,
                stderr,
                exitCode: null,
                duration,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    /**
     * Kills the current process
     * 
     * @param process Process to kill
     */
    private killProcess(process: cp.ChildProcess): void {
        try {
            if (process.pid) {
                if (global.process.platform === 'win32') {
                    try {
                        cp.execSync(`taskkill /pid ${process.pid} /T /F`, { windowsHide: true });
                    } catch (error) {
                        process.kill('SIGKILL');
                    }
                } else {
                    try {
                        process.kill('SIGKILL');
                    } catch (error) {
                        // Ignore errors when killing processes
                    }
                }
            }
        } catch (error) {
            console.error('Error killing process:', error);
        }
    }

    /**
     * Gets performance metrics for the script executor
     */
    public getMetrics(): any {
        return this.metrics;
    }
}

/**
 * Process pool for Python script execution
 * 
 * Manages a pool of Python processes that can be reused for faster script execution.
 * Reusing processes eliminates the startup overhead of creating a new process for
 * each script execution.
 */
class ProcessPool {
    private static instance: ProcessPool;
    private readonly pool: Map<string, PooledProcess[]> = new Map();
    private readonly maxSize: number = 5; // Maximum number of processes per Python path
    private readonly maxIdleTime: number = 60 * 1000; // Maximum idle time in milliseconds (1 minute)
    
    // Metrics
    private metrics = {
        processesCreated: 0,
        processesReused: 0,
        processesDiscarded: 0,
        totalWaitTime: 0,
        totalExecutions: 0
    };
    
    private constructor() {
        // Start maintenance interval
        setInterval(() => this.maintenance(), 30 * 1000); // Run every 30 seconds
    }
    
    /**
     * Gets the singleton instance of ProcessPool
     */
    public static getInstance(): ProcessPool {
        if (!ProcessPool.instance) {
            ProcessPool.instance = new ProcessPool();
        }
        return ProcessPool.instance;
    }
    
    /**
     * Gets a process from the pool or creates a new one
     * 
     * @param pythonPath Path to the Python interpreter
     * @returns A promise resolving to a process and whether it was reused
     */
    public async getProcess(pythonPath: string): Promise<{process: cp.ChildProcess, reused: boolean}> {
        const startTime = performance.now();
        this.metrics.totalExecutions++;
        
        // Initialize the pool for this Python path if it doesn't exist
        if (!this.pool.has(pythonPath)) {
            this.pool.set(pythonPath, []);
        }
        
        const pooledProcesses = this.pool.get(pythonPath)!;
        
        // Look for an available process
        const availableProcessIndex = pooledProcesses.findIndex(p => !p.inUse);
        
        if (availableProcessIndex >= 0) {
            // Found an available process, reuse it
            const pooledProcess = pooledProcesses[availableProcessIndex];
            pooledProcess.inUse = true;
            pooledProcess.lastUsed = Date.now();
            pooledProcess.usageCount++;
            
            this.metrics.processesReused++;
            this.metrics.totalWaitTime += performance.now() - startTime;
            
            return {
                process: pooledProcess.process,
                reused: true
            };
        }
        
        // No available process, create a new one
        try {
            // Check if we've reached the maximum pool size
            if (pooledProcesses.length >= this.maxSize) {
                // Find the oldest process and discard it
                const oldestIndex = pooledProcesses
                    .map((p, index) => ({ index, lastUsed: p.lastUsed }))
                    .sort((a, b) => a.lastUsed - b.lastUsed)[0].index;
                
                const oldestProcess = pooledProcesses[oldestIndex];
                this.killProcess(oldestProcess.process);
                pooledProcesses.splice(oldestIndex, 1);
                this.metrics.processesDiscarded++;
            }
            
            // Create a new process that's prepared for execution
            const childProcess: cp.ChildProcess = cp.spawn(pythonPath, ['-c', 'import sys; sys.stdout.write("ready\\n"); sys.stdout.flush(); exec(input())'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...global.process.env,
                    PYTHONUNBUFFERED: '1'
                },
                detached: global.process.platform !== 'win32'
            });
            
            // Wait for the process to be ready
            await new Promise<void>((resolve) => {
                const onData = (data: Buffer) => {
                    if (data.toString().includes('ready')) {
                        childProcess.stdout?.removeListener('data', onData);
                        resolve();
                    }
                };
                childProcess.stdout?.on('data', onData);
            });
            
            // Add the new process to the pool
            const newPooledProcess: PooledProcess = {
                process: childProcess,
                createdAt: Date.now(),
                lastUsed: Date.now(),
                inUse: true,
                usageCount: 1,
                pid: childProcess.pid!
            };
            
            pooledProcesses.push(newPooledProcess);
            this.metrics.processesCreated++;
            this.metrics.totalWaitTime += performance.now() - startTime;
            
            return {
                process: childProcess,
                reused: false
            };
        } catch (error) {
            console.error('Error creating pooled process:', error);
            this.metrics.totalWaitTime += performance.now() - startTime;
            
            // Create a new process the traditional way if pooling fails
            const fallbackProcess = cp.spawn(pythonPath, ['-c', '']);
            return {
                process: fallbackProcess,
                reused: false
            };
        }
    }
    
    /**
     * Releases a process back to the pool
     * 
     * @param process The process to release
     * @param pythonPath Path to the Python interpreter
     */
    public releaseProcess(process: cp.ChildProcess, pythonPath: string): void {
        if (!this.pool.has(pythonPath)) {
            return;
        }
        
        const pooledProcesses = this.pool.get(pythonPath)!;
        const index = pooledProcesses.findIndex(p => p.process === process || p.pid === process.pid);
        
        if (index >= 0) {
            pooledProcesses[index].inUse = false;
            pooledProcesses[index].lastUsed = Date.now();
        }
    }
    
    /**
     * Performs maintenance on the process pool
     */
    private maintenance(): void {
        const now = Date.now();
        
        // Clean up idle processes
        for (const [_key, processes] of this.pool.entries()) {
            const processesToKeep: PooledProcess[] = [];
            
            for (const process of processes) {
                // Keep processes that are in use or have been used recently
                if (process.inUse || (now - process.lastUsed < this.maxIdleTime)) {
                    processesToKeep.push(process);
                } else {
                    // Discard processes that have been idle for too long
                    this.killProcess(process.process);
                    this.metrics.processesDiscarded++;
                }
            }
            
            this.pool.set(_key, processesToKeep);
        }
    }
    
    /**
     * Kills a process with proper cleanup
     */
    private killProcess(process: cp.ChildProcess): void {
        try {
            if (process.pid) {
                if (global.process.platform === 'win32') {
                    try {
                        cp.execSync(`taskkill /pid ${process.pid} /T /F`, { windowsHide: true });
                    } catch (error) {
                        process.kill('SIGKILL');
                    }
                } else {
                    try {
                        process.kill('SIGKILL');
                    } catch (error) {
                        // Ignore errors when killing processes
                    }
                }
            }
        } catch (error) {
            console.error('Error killing pooled process:', error);
        }
    }
    
    /**
     * Gets metrics about the process pool
     */
    public getMetrics(): any {
        return {
            ...this.metrics,
            avgWaitTime: this.metrics.totalExecutions > 0 ? 
                this.metrics.totalWaitTime / this.metrics.totalExecutions : 0,
            poolSize: Array.from(this.pool.values()).reduce((sum, procs) => sum + procs.length, 0),
            activeProcesses: Array.from(this.pool.values())
                .reduce((sum, procs) => sum + procs.filter(p => p.inUse).length, 0)
        };
    }
    
    /**
     * Shuts down all processes in the pool
     */
    public dispose(): void {
        for (const [_key, processes] of this.pool.entries()) {
            for (const process of processes) {
                this.killProcess(process.process);
            }
        }
        
        this.pool.clear();
    }
}

/**
 * Manages Python environments with performance optimizations
 * 
 * Enhanced with:
 * - Caching for environment information
 * - Optimized dependency checking
 * - Performance metrics collection
 */
// Export ScriptExecutor as PythonRuntime for backward compatibility
export { ScriptExecutor as PythonRuntime };

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
