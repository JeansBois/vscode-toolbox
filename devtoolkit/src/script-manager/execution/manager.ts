import { PythonRuntime, ExecutionResult as PythonExecutionResult } from '../../python-runtime/process';
import { ScriptEventManager } from '../core/events';
import { ScriptManifest, ExecutionResult, ScriptStatus, ExecutionProgress } from '../types';
import { ResourceMonitor, ResourceUsage } from './resource-monitor';
import { ExecutionLogger } from './logger';

interface ExecutionOptions {
    timeout?: number;
    maxMemory?: number;
    maxCpu?: number;
    env?: { [key: string]: string };
}

export class ExecutionManager {
    private readonly pythonRuntime: PythonRuntime;
    private readonly eventManager: ScriptEventManager;
    private readonly logger: ExecutionLogger;
    private readonly activeExecutions: Map<string, {
        startTime: number;
        monitor: ResourceMonitor;
        resourceUsage?: ResourceUsage;
        timeout?: number;
        limitCheckInterval?: NodeJS.Timeout;
    }>;
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
        params: Record<string, any>,
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        const scriptId = manifest.script_info.id;
        
        try {
            // Valider les paramètres
            await this.validateParams(manifest, params);
            
            // Préparer l'environnement d'exécution
            const env = this.prepareEnvironment(manifest, options.env);
            
            // Notifier le début de l'exécution
            this.eventManager.notifyExecutionStarted(scriptId, { params });
            
            // Démarrer le monitoring
            const monitor = new ResourceMonitor();
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
                this.formatParams(params),
                {
                    ...processOptions,
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
                        this.logger.logError(scriptId, new Error(error));
                    }
                }
            );
            
            // Get process ID and start resource monitoring
            const processId = this.pythonRuntime.getCurrentProcessId();
            
            if (processId) {
                // Set up limit monitoring with process ID
                monitor.start(processId);
                
                // Set up listener for resource limit violations
                monitor.on('limit-exceeded', (violation: any) => {
                    this.logger.logWarning(scriptId, 
                        `Resource limit exceeded: ${violation.resource} (${violation.current}${violation.unit} > ${violation.limit}${violation.unit})`
                    );
                    
                    this.killExecution(scriptId);
                    
                    this.eventManager.notifyExecutionFailed(scriptId, new Error(
                        `Script terminated: exceeded ${violation.resource} limit (${violation.current}${violation.unit} > ${violation.limit}${violation.unit})`
                    ));
                });
                
                // Set up regular checks for resource limits
                const limitCheckInterval = setInterval(() => {
                    monitor.enforceResourceLimits(resourceLimits);
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
            }
            this.activeExecutions.delete(scriptId);
            
            // Handle timeout specifically
            if (pythonResult.timedOut) {
                this.logger.logError(scriptId, new Error(`Script execution timed out after ${timeout}ms`));
                this.eventManager.notifyExecutionFailed(scriptId, new Error(`Timeout: Script execution exceeded the ${timeout}ms limit`));
                
                return {
                    success: false,
                    output: pythonResult.stdout,
                    error: `Timeout: Script execution exceeded the ${timeout}ms limit`,
                    duration: pythonResult.duration
                };
            }
            
            // Mettre à jour les statistiques
            await this.updateExecutionStats(manifest, {
                success: pythonResult.exitCode === 0,
                output: pythonResult.stdout,
                error: pythonResult.stderr,
                duration: pythonResult.duration
            });
            
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
        } catch (error) {
            const errorResult: ExecutionResult = {
                success: false,
                error: (error as Error).message
            };
            
            this.eventManager.notifyExecutionFailed(scriptId, error as Error);
            this.logger.logError(scriptId, error as Error);
            
            return errorResult;
        }
    }

    public async validateParams(
        manifest: ScriptManifest,
        params: Record<string, any>
    ): Promise<boolean> {
        const errors: string[] = [];
        
        // Vérifier les paramètres requis
        for (const arg of manifest.execution.arguments || []) {
            if (arg.required && !(arg.name in params)) {
                errors.push(`Paramètre requis manquant: ${arg.name}`);
            }
        }
        
        // Vérifier les types de paramètres
        for (const [name, value] of Object.entries(params)) {
            const argDef = manifest.execution.arguments?.find(a => a.name === name);
            if (!argDef) {
                errors.push(`Paramètre inconnu: ${name}`);
                continue;
            }
            
            if (!this.validateParamType(value, argDef.type)) {
                errors.push(`Type invalide pour ${name}: attendu ${argDef.type}`);
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Validation des paramètres échouée:\n${errors.join('\n')}`);
        }
        
        return true;
    }

    public killExecution(scriptId: string): void {
        const execution = this.activeExecutions.get(scriptId);
        if (execution) {
            this.pythonRuntime.killProcess();
            execution.monitor.stop();
            
            if (execution.limitCheckInterval) {
                clearInterval(execution.limitCheckInterval);
            }
            
            this.activeExecutions.delete(scriptId);
            
            this.eventManager.notifyExecutionCancelled(scriptId);
            this.logger.logInfo(scriptId, 'Exécution annulée');
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

    private validateParamType(value: any, expectedType: string): boolean {
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

    private prepareEnvironment(
        manifest: ScriptManifest,
        additionalEnv?: { [key: string]: string }
    ): { [key: string]: string } {
        return {
            ...process.env,
            ...manifest.execution.environment,
            ...additionalEnv,
            SCRIPT_ID: manifest.script_info.id,
            SCRIPT_VERSION: manifest.script_info.version
        };
    }

    private formatParams(params: Record<string, any>): string[] {
        return Object.entries(params).map(([key, value]) => 
            `--${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`
        );
    }


    private async updateExecutionStats(
        manifest: ScriptManifest,
        result: ExecutionResult
    ): Promise<void> {
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
    }
}
