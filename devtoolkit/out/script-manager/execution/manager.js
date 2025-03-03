"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionManager = void 0;
const process_1 = require("../../python-runtime/process");
const events_1 = require("../core/events");
const types_1 = require("../types");
const resource_monitor_1 = require("./resource-monitor");
const logger_1 = require("./logger");
class ExecutionManager {
    constructor() {
        this.pythonRuntime = new process_1.PythonRuntime();
        this.eventManager = events_1.ScriptEventManager.getInstance();
        this.logger = new logger_1.ExecutionLogger();
        this.activeExecutions = new Map();
    }
    static getInstance() {
        if (!ExecutionManager.instance) {
            ExecutionManager.instance = new ExecutionManager();
        }
        return ExecutionManager.instance;
    }
    async executeScript(manifest, params, options = {}) {
        const scriptId = manifest.script_info.id;
        try {
            // Valider les paramètres
            await this.validateParams(manifest, params);
            // Préparer l'environnement d'exécution
            const env = this.prepareEnvironment(manifest, options.env);
            // Notifier le début de l'exécution
            this.eventManager.notifyExecutionStarted(scriptId, { params });
            // Démarrer le monitoring
            const monitor = new resource_monitor_1.ResourceMonitor();
            const startTime = Date.now();
            const processOptions = {
                timeout: options.timeout,
                maxMemory: options.maxMemory,
                maxCpu: options.maxCpu,
                env
            };
            const result = await this.pythonRuntime.executeScript(manifest.execution.entry_point, this.formatParams(params), {
                ...processOptions,
                onOutput: (output) => {
                    this.logger.logOutput(scriptId, output);
                    const progress = {
                        scriptId,
                        progress: 0,
                        status: 'running',
                        output,
                        timestamp: Date.now(),
                        resourceUsage: this.activeExecutions.get(scriptId)?.resourceUsage
                    };
                    this.eventManager.notifyExecutionProgress(scriptId, progress.progress, progress.status, progress.output);
                },
                onError: (error) => {
                    this.logger.logError(scriptId, new Error(error));
                }
            });
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
        }
        catch (error) {
            const errorResult = {
                success: false,
                error: error.message
            };
            this.eventManager.notifyExecutionFailed(scriptId, error);
            this.logger.logError(scriptId, error);
            return errorResult;
        }
    }
    async validateParams(manifest, params) {
        const errors = [];
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
    killExecution(scriptId) {
        const execution = this.activeExecutions.get(scriptId);
        if (execution) {
            this.pythonRuntime.killProcess();
            execution.monitor.stop();
            this.activeExecutions.delete(scriptId);
            this.eventManager.notifyExecutionCancelled(scriptId);
            this.logger.logInfo(scriptId, 'Exécution annulée');
        }
    }
    getExecutionStatus(scriptId) {
        return this.activeExecutions.has(scriptId)
            ? types_1.ScriptStatus.Running
            : types_1.ScriptStatus.Idle;
    }
    getActiveExecutions() {
        return Array.from(this.activeExecutions.keys());
    }
    validateParamType(value, expectedType) {
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
    prepareEnvironment(manifest, additionalEnv) {
        return {
            ...process.env,
            ...manifest.execution.environment,
            ...additionalEnv,
            SCRIPT_ID: manifest.script_info.id,
            SCRIPT_VERSION: manifest.script_info.version
        };
    }
    formatParams(params) {
        return Object.entries(params).map(([key, value]) => `--${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
    async updateExecutionStats(manifest, result) {
        if (!manifest.metadata) {
            manifest.metadata = {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_executed: new Date().toISOString(),
                execution_count: 1
            };
        }
        else {
            manifest.metadata.last_executed = new Date().toISOString();
            manifest.metadata.execution_count = (manifest.metadata.execution_count || 0) + 1;
            manifest.metadata.updated_at = new Date().toISOString();
        }
    }
}
exports.ExecutionManager = ExecutionManager;
//# sourceMappingURL=manager.js.map