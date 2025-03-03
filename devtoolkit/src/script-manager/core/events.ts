import { EventEmitter } from 'events';
import { ExecutionResult } from '../types';

export enum ScriptEvent {
    // Événements du cycle de vie
    Created = 'script:created',
    Updated = 'script:updated',
    Deleted = 'script:deleted',
    
    // Événements d'exécution
    ExecutionStarted = 'script:execution:started',
    ExecutionProgress = 'script:execution:progress',
    ExecutionCompleted = 'script:execution:completed',
    ExecutionFailed = 'script:execution:failed',
    ExecutionCancelled = 'script:execution:cancelled',
    
    // Événements de dépendances
    DependenciesInstalling = 'script:dependencies:installing',
    DependenciesInstalled = 'script:dependencies:installed',
    DependenciesError = 'script:dependencies:error',
    
    // Événements de validation
    ValidationStarted = 'script:validation:started',
    ValidationCompleted = 'script:validation:completed',
    ValidationFailed = 'script:validation:failed',
    
    // Événements de cache
    CacheUpdated = 'script:cache:updated',
    CacheCleared = 'script:cache:cleared',
    CacheError = 'script:cache:error'
}

export interface ScriptEventData {
    scriptId: string;
    timestamp: number;
    details?: any;
}

export interface ExecutionProgressData extends ScriptEventData {
    progress: number;
    status: string;
    output?: string;
}

export interface ExecutionCompletedData extends ScriptEventData {
    result: ExecutionResult;
    duration: number;
}

export interface ExecutionCancelledData extends ScriptEventData {
    reason?: string;
    elapsedTime: number;
}

export class ScriptEventManager extends EventEmitter {
    private static instance: ScriptEventManager;
    private eventHistory: Map<string, ScriptEventData[]>;
    private readonly maxHistoryPerScript = 100;

    private constructor() {
        super();
        this.eventHistory = new Map();
        this.setupEventLogging();
    }

    public static getInstance(): ScriptEventManager {
        if (!ScriptEventManager.instance) {
            ScriptEventManager.instance = new ScriptEventManager();
        }
        return ScriptEventManager.instance;
    }

    private setupEventLogging(): void {
        Object.values(ScriptEvent).forEach(eventType => {
            this.on(eventType, (data: ScriptEventData) => {
                this.logEvent(eventType, data);
            });
        });
    }

    private logEvent(_eventType: string, data: ScriptEventData): void {
        const scriptEvents = this.eventHistory.get(data.scriptId) || [];
        
        // Ajouter le nouvel événement
        scriptEvents.push({
            ...data,
            timestamp: Date.now()
        });
        
        // Limiter la taille de l'historique
        if (scriptEvents.length > this.maxHistoryPerScript) {
            scriptEvents.shift();
        }
        
        this.eventHistory.set(data.scriptId, scriptEvents);
    }

    public emitScriptEvent(event: ScriptEvent, data: ScriptEventData): void {
        this.emit(event, data);
    }

    public onScriptEvent(event: ScriptEvent, listener: (data: ScriptEventData) => void): void {
        this.on(event, listener);
    }

    public getScriptEventHistory(scriptId: string): ScriptEventData[] {
        return this.eventHistory.get(scriptId) || [];
    }

    public clearScriptEventHistory(scriptId: string): void {
        this.eventHistory.delete(scriptId);
    }

    public getRecentEvents(scriptId: string, limit: number = 10): ScriptEventData[] {
        const events = this.eventHistory.get(scriptId) || [];
        return events.slice(-limit);
    }

    // Méthodes d'émission d'événements spécifiques
    public notifyExecutionStarted(scriptId: string, details?: any): void {
        this.emitScriptEvent(ScriptEvent.ExecutionStarted, {
            scriptId,
            timestamp: Date.now(),
            details
        });
    }

    public notifyExecutionProgress(scriptId: string, progress: number, status: string, output?: string): void {
        this.emitScriptEvent(ScriptEvent.ExecutionProgress, {
            scriptId,
            timestamp: Date.now(),
            progress,
            status,
            output
        } as ExecutionProgressData);
    }

    public notifyExecutionCancelled(scriptId: string, reason?: string): void {
        const execution = this.eventHistory.get(scriptId)?.find(
            e => e.details?.type === ScriptEvent.ExecutionStarted
        );
        
        const elapsedTime = execution
            ? Date.now() - new Date(execution.timestamp).getTime()
            : 0;

        this.emitScriptEvent(ScriptEvent.ExecutionCancelled, {
            scriptId,
            timestamp: Date.now(),
            details: {
                reason,
                elapsedTime
            }
        } as ExecutionCancelledData);
    }

    public notifyExecutionCompleted(scriptId: string, result: ExecutionResult, duration: number): void {
        this.emitScriptEvent(ScriptEvent.ExecutionCompleted, {
            scriptId,
            timestamp: Date.now(),
            result,
            duration
        } as ExecutionCompletedData);
    }

    public notifyExecutionFailed(scriptId: string, error: Error): void {
        this.emitScriptEvent(ScriptEvent.ExecutionFailed, {
            scriptId,
            timestamp: Date.now(),
            details: {
                error: error.message,
                stack: error.stack
            }
        });
    }

    public notifyDependenciesInstalling(scriptId: string, dependencies: string[]): void {
        this.emitScriptEvent(ScriptEvent.DependenciesInstalling, {
            scriptId,
            timestamp: Date.now(),
            details: { dependencies }
        });
    }

    public notifyDependenciesInstalled(scriptId: string, installed: string[]): void {
        this.emitScriptEvent(ScriptEvent.DependenciesInstalled, {
            scriptId,
            timestamp: Date.now(),
            details: { installed }
        });
    }

    public notifyValidationStarted(scriptId: string): void {
        this.emitScriptEvent(ScriptEvent.ValidationStarted, {
            scriptId,
            timestamp: Date.now()
        });
    }

    public notifyValidationCompleted(scriptId: string, isValid: boolean, errors?: string[]): void {
        this.emitScriptEvent(ScriptEvent.ValidationCompleted, {
            scriptId,
            timestamp: Date.now(),
            details: { isValid, errors }
        });
    }

    public notifyCacheUpdated(scriptId: string, details?: any): void {
        this.emitScriptEvent(ScriptEvent.CacheUpdated, {
            scriptId,
            timestamp: Date.now(),
            details
        });
    }

    // Méthodes utilitaires
    public async getExecutionStats(scriptId: string): Promise<{
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        averageDuration: number;
    }> {
        const events = this.getScriptEventHistory(scriptId);
        const executions = events.filter(
            e => e.details?.type === ScriptEvent.ExecutionCompleted ||
                 e.details?.type === ScriptEvent.ExecutionFailed
        );

        const successful = executions.filter(e => e.details?.type === ScriptEvent.ExecutionCompleted);
        const durations = successful.map(e => (e as ExecutionCompletedData).duration);
        const avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;

        return {
            totalExecutions: executions.length,
            successfulExecutions: successful.length,
            failedExecutions: executions.length - successful.length,
            averageDuration: avgDuration
        };
    }
}
