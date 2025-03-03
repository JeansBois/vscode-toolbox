import { PythonRuntime } from '../../python-runtime/process';
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
    }>;
    private static instance: ExecutionManager;

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
            
            const processOptions = {
                timeout: options.timeout,
                maxMemory: options.maxMemory,
                maxCpu: options.maxCpu,
                env
            };

            const result = await this.pythonRuntime.executeScript(
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

            // Arrêter le monitoring
            monitor.stop();
            
            // Nettoyer
            this.activeExecutions.delete(scriptId);
            
            // Mettre à jour les statistiques
            await this.updateExecutionStats(manifest, {
                success: result.exitCode === 0,
                output: result.stdout,
                error: result.stderr,
                duration: result.duration
            });
            
            return {
                ...result,
                success: result.exitCode === 0
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
