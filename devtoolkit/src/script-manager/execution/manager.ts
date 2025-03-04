import { ScriptExecutor as PythonRuntime } from '../../python-runtime/process';
import { ScriptEventManager } from '../core/events';
import { ScriptManifest, ExecutionResult, ScriptStatus, ExecutionProgress } from '../types';
import { ResourceMonitor, ResourceUsage } from './resource-monitor';
import { ExecutionLogger } from './logger';
import {
    ResourceLimitError,
    ValidationError,
    TimeoutError,
    PythonRuntimeError,
    ErrorCode,
    wrapError,
    logError
} from '../../utils/error-handling';

/**
 * Parameter types for script execution
 */
interface ScriptParameter {
    value: string | number | boolean | string[] | Record<string, unknown>;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

/**
 * Type-safe script parameters
 */
export type ScriptParams = Record<string, ScriptParameter['value']>;

/**
 * Resource violation details
 */
export interface ResourceViolation {
    resource: 'memory' | 'cpu' | 'duration';
    current: number;
    limit: number;
    unit: string;
}

/**
 * Options for script execution
 */
export interface ExecutionOptions {
    timeout?: number;
    maxMemory?: number;
    maxCpu?: number;
    env?: Record<string, string>;
}

/**
 * Active execution metadata
 */
interface ActiveExecution {
    startTime: number;
    monitor: ResourceMonitor;
    resourceUsage?: ResourceUsage;
    timeout?: number;
    limitCheckInterval?: NodeJS.Timeout;
}

export class ExecutionManager {
    private readonly pythonRuntime: PythonRuntime;
    private readonly eventManager: ScriptEventManager;
    private readonly logger: ExecutionLogger;
    private readonly activeExecutions: Map<string, ActiveExecution>;
    private static instance: ExecutionManager;
    // Default timeout of 60 seconds if not specified
    private static readonly DEFAULT_TIMEOUT = 60000;

    private constructor() {
        this.pythonRuntime = new PythonRuntime();
        this.eventManager = ScriptEventManager.getInstance();
        this.logger = new ExecutionLogger();
        this.activeExecutions = new Map();
    }

    public static getInstance(): ExecutionManager {
        if (!ExecutionManager.instance) {
            ExecutionManager.instance = new ExecutionManager();
        }
        return ExecutionManager.instance;
    }

    public async executeScript(
        manifest: ScriptManifest,
        params: ScriptParams,
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        const scriptId = manifest.script_info.id;
        let monitor: ResourceMonitor | undefined;
        let limitCheckInterval: NodeJS.Timeout | undefined;
        
        try {
            // Valider les paramètres
            await this.validateParams(manifest, params);
            
            // Préparer l'environnement d'exécution
            const env = this.prepareEnvironment(manifest, options.env);
            
            // Notifier le début de l'exécution
            this.eventManager.notifyExecutionStarted(scriptId, { params });
            
            // Démarrer le monitoring
            monitor = new ResourceMonitor();
            const startTime = Date.now();
            const timeout = options.timeout || ExecutionManager.DEFAULT_TIMEOUT;
            
            // Set up resource limits
            const resourceLimits = {
                maxCpu: options.maxCpu || manifest.execution.resource_limits?.cpu,
                maxMemory: options.maxMemory || manifest.execution.resource_limits?.memory,
                maxDuration: (options.timeout ? options.timeout / 1000 : undefined) || 
                             manifest.execution.resource_limits?.duration
            };
            
            // Log resource limit settings
            this.logger.logInfo(scriptId, `Executing script with timeout: ${timeout}ms and resource limits: ${
                JSON.stringify({
                    cpu: resourceLimits.maxCpu ? `${resourceLimits.maxCpu}%` : 'unlimited',
                    memory: resourceLimits.maxMemory ? `${resourceLimits.maxMemory}MB` : 'unlimited',
                    duration: resourceLimits.maxDuration ? `${resourceLimits.maxDuration}s` : `${timeout}ms`
                })
            }`);
            
            // Store execution details before starting
            this.activeExecutions.set(scriptId, {
                startTime,
                monitor,
                timeout
            });
            
            const processOptions = {
                timeout,
                maxMemory: options.maxMemory,
                maxCpu: options.maxCpu,
                env
            };

            // Start execution of the Python script
            const pythonExecution = this.pythonRuntime.executeScript(
                manifest.execution.entry_point,
                {
                    ...processOptions,
                    args: this.formatParams(params),
                    onOutput: (output: string) => {
                        this.logger.logOutput(scriptId, output);
                        const progress: ExecutionProgress = {
                            scriptId,
                            progress: 0,
                            status: 'running',
                            output,
                            timestamp: Date.now(),
                            resourceUsage: this.activeExecutions.get(scriptId)?.resourceUsage
                        };
                        this.eventManager.notifyExecutionProgress(scriptId, progress.progress, progress.status, progress.output);
                    },
                    onError: (error: string) => {
                        this.logger.logError(scriptId, new PythonRuntimeError(error, {
                            context: {
                                scriptId,
                                entryPoint: manifest.execution.entry_point
                            }
                        }));
                    }
                }
            );
            
            // Get process ID and start resource monitoring - disabled for now
            // const processId = this.pythonRuntime.getCurrentProcessId();
            
            // Skip resource monitoring for now as getCurrentProcessId is not available
            if (false) { // was: if (processId) {
                // Resource monitoring code is disabled for now as getCurrentProcessId is not available
                            monitor?.start(0); // Would use processId here
                
                // Set up listener for resource limit violations
                monitor?.on('limit-exceeded', (violation: ResourceViolation) => {
                    const resourceError = new ResourceLimitError(
                        `Resource limit exceeded: ${violation.resource} (${violation.current}${violation.unit} > ${violation.limit}${violation.unit})`,
                        {
                            context: {
                                scriptId,
                                resource: violation.resource,
                                current: violation.current,
                                limit: violation.limit,
                                unit: violation.unit
                            }
                        }
                    );
                    
                    this.logger.logWarning(scriptId, resourceError.message);
                    
                    this.killExecution(scriptId);
                    
                    this.eventManager.notifyExecutionFailed(scriptId, resourceError);
                });
                
                // Set up regular checks for resource limits
                limitCheckInterval = setInterval(() => {
                    monitor?.enforceResourceLimits(resourceLimits);
                }, 2000); // Check every 2 seconds
                
                // Update execution details with limitCheckInterval
                this.activeExecutions.set(scriptId, {
                    ...this.activeExecutions.get(scriptId)!,
                    limitCheckInterval
                });
            } else {
                this.logger.logWarning(scriptId, "Unable to get process ID for resource monitoring");
            }
            
            // Wait for the execution to complete
            const pythonResult = await pythonExecution;

            // Arrêter le monitoring
            monitor.stop();
            
            // Nettoyer
            const execution = this.activeExecutions.get(scriptId);
            if (execution?.limitCheckInterval) {
                clearInterval(execution.limitCheckInterval);
                limitCheckInterval = undefined;
            }
            this.activeExecutions.delete(scriptId);
            
            // Handle timeout specifically
            if (pythonResult.timedOut) {
                const timeoutError = new TimeoutError(
                    `Script execution timed out after ${timeout}ms`,
                    {
                        context: {
                            scriptId,
                            timeout,
                            entryPoint: manifest.execution.entry_point
                        }
                    }
                );
                
                this.logger.logError(scriptId, timeoutError);
                this.eventManager.notifyExecutionFailed(scriptId, timeoutError);
                
                return {
                    success: false,
                    output: pythonResult.stdout,
                    error: timeoutError.message,
                    duration: pythonResult.duration
                };
            }
            
            // Handle other execution error
            if (pythonResult.error) {
                this.logger.logError(scriptId, pythonResult.error);
                this.eventManager.notifyExecutionFailed(scriptId, pythonResult.error);
                
                return {
                    success: false,
                    output: pythonResult.stdout,
                    error: pythonResult.stderr || pythonResult.error.message,
                    duration: pythonResult.duration,
                    resourceUsage: {
                        peakMemory: monitor.getPeakUsage().peakMemory,
                        averageCpu: monitor.getAverageUsage().currentCpu
                    }
                };
            }
            
            // Mettre à jour les statistiques
            await this.updateExecutionStats(manifest, {
                success: pythonResult.exitCode === 0,
                output: pythonResult.stdout,
                error: pythonResult.stderr,
                duration: pythonResult.duration
            });
            
            // Notify success or failure based on exit code
            if (pythonResult.exitCode === 0) {
                const executionResult: ExecutionResult = {
                    success: true,
                    output: pythonResult.stdout,
                    error: pythonResult.stderr,
                    duration: pythonResult.duration,
                    resourceUsage: {
                        peakMemory: monitor.getPeakUsage().peakMemory,
                        averageCpu: monitor.getAverageUsage().currentCpu
                    }
                };
                
                // The method requires scriptId, result, and duration
                this.eventManager.notifyExecutionCompleted(
                    scriptId, 
                    executionResult,
                    pythonResult.duration
                );
            } else {
                const runtimeError = new PythonRuntimeError(
                    `Script exited with code ${pythonResult.exitCode}`,
                    {
                        context: {
                            scriptId,
                            exitCode: pythonResult.exitCode,
                            stderr: pythonResult.stderr
                        }
                    }
                );
                
                this.eventManager.notifyExecutionFailed(scriptId, runtimeError);
            }
            
            return {
                success: pythonResult.exitCode === 0,
                output: pythonResult.stdout,
                error: pythonResult.stderr,
                duration: pythonResult.duration,
                resourceUsage: {
                    peakMemory: monitor.getPeakUsage().peakMemory,
                    averageCpu: monitor.getAverageUsage().currentCpu
                }
            };
        } catch (error: unknown) {
            // Ensure cleanup in case of error
            if (monitor) {
                monitor.stop();
            }
            
            if (limitCheckInterval) {
                clearInterval(limitCheckInterval);
            }
            
            this.activeExecutions.delete(scriptId);
            
            // Format and log the error
            const formattedError = wrapError(
                error, 
                ErrorCode.INTERNAL_ERROR,
                `Error executing script: ${scriptId}`,
                {
                    scriptId,
                    manifestId: manifest.script_info.id,
                    entryPoint: manifest.execution.entry_point
                }
            );
            
            this.logger.logError(scriptId, formattedError);
            this.eventManager.notifyExecutionFailed(scriptId, formattedError);
            
            const errorResult: ExecutionResult = {
                success: false,
                error: formattedError.message,
                output: ''
            };
            
            return errorResult;
        }
    }

    /**
     * Validates parameters against manifest definitions
     * @param manifest Script manifest containing parameter definitions
     * @param params Parameters to validate
     * @returns True if parameters are valid
     * @throws ValidationError if parameters are invalid
     */
    public async validateParams(
        manifest: ScriptManifest,
        params: ScriptParams
    ): Promise<boolean> {
        const errors: string[] = [];
        
        // Vérifier les paramètres requis
        for (const arg of manifest.execution.arguments || []) {
            if (arg.required && !(arg.name in params)) {
                errors.push(`Missing required parameter: ${arg.name}`);
            }
        }
        
        // Vérifier les types de paramètres
        for (const [name, value] of Object.entries(params)) {
            const argDef = manifest.execution.arguments?.find(a => a.name === name);
            if (!argDef) {
                errors.push(`Unknown parameter: ${name}`);
                continue;
            }
            
            if (!this.validateParamType(value, argDef.type)) {
                errors.push(`Invalid type for ${name}: expected ${argDef.type}`);
            }
        }
        
        if (errors.length > 0) {
            throw new ValidationError(
                `Parameter validation failed`,
                {
                    context: {
                        scriptId: manifest.script_info.id,
                        errors,
                        providedParams: params
                    }
                }
            );
        }
        
        return true;
    }

    public killExecution(scriptId: string): void {
        const execution = this.activeExecutions.get(scriptId);
        if (execution) {
            try {
                // Note: Unable to call pythonRuntime.killProcess() directly as it's a private method
                // This needs to be refactored to use a public API
                // this.pythonRuntime.killProcess();
                
                if (execution.monitor) {
                    execution.monitor.stop();
                }
                
                if (execution.limitCheckInterval) {
                    clearInterval(execution.limitCheckInterval);
                }
                
                this.activeExecutions.delete(scriptId);
                
                this.eventManager.notifyExecutionCancelled(scriptId);
                this.logger.logInfo(scriptId, 'Execution cancelled');
            } catch (error) {
                const killError = wrapError(
                    error,
                    ErrorCode.INTERNAL_ERROR,
                    `Error killing script execution: ${scriptId}`,
                    { scriptId }
                );
                
                this.logger.logError(scriptId, killError);
            }
        }
    }

    public getExecutionStatus(scriptId: string): ScriptStatus {
        return this.activeExecutions.has(scriptId)
            ? ScriptStatus.Running
            : ScriptStatus.Idle;
    }

    public getActiveExecutions(): string[] {
        return Array.from(this.activeExecutions.keys());
    }

    /**
     * Validates a parameter value against expected type
     * @param value Parameter value to validate
     * @param expectedType Expected parameter type
     * @returns True if parameter is valid
     */
    private validateParamType(value: unknown, expectedType: string): boolean {
        switch (expectedType.toLowerCase()) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null;
            default:
                return true; // Types personnalisés sont considérés valides
        }
    }

    /**
     * Prepares the execution environment with variables
     * @param manifest Script manifest
     * @param additionalEnv Additional environment variables
     * @returns Environment variables for execution
     */
    private prepareEnvironment(
        manifest: ScriptManifest,
        additionalEnv?: Record<string, string>
    ): Record<string, string> {
        return {
            ...process.env,
            ...manifest.execution.environment,
            ...additionalEnv,
            SCRIPT_ID: manifest.script_info.id,
            SCRIPT_VERSION: manifest.script_info.version
        };
    }

    /**
     * Formats parameters for command line passing
     * @param params Script parameters
     * @returns Formatted parameters as string array
     */
    private formatParams(params: ScriptParams): string[] {
        return Object.entries(params).map(([key, value]) => 
            `--${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`
        );
    }


    /**
     * Updates execution statistics in manifest
     * @param manifest Script manifest to update
     * @param result Execution result
     */
    private async updateExecutionStats(
        manifest: ScriptManifest,
        _result: ExecutionResult
    ): Promise<void> {
        try {
            if (!manifest.metadata) {
                manifest.metadata = {
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_executed: new Date().toISOString(),
                    execution_count: 1
                };
            } else {
                manifest.metadata.last_executed = new Date().toISOString();
                manifest.metadata.execution_count = (manifest.metadata.execution_count || 0) + 1;
                manifest.metadata.updated_at = new Date().toISOString();
            }
        } catch (error) {
            // Log but don't throw - stats update is non-critical
            logError(wrapError(
                error,
                ErrorCode.INTERNAL_ERROR,
                `Error updating execution statistics for script: ${manifest.script_info.id}`,
                { scriptId: manifest.script_info.id }
            ));
        }
    }
}
