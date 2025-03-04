import { EventEmitter } from 'events';
import { ExecutionResult } from '../types';

/**
 * Enumeration of all script-related event types
 */
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

/**
 * Common properties for all script event data
 */
export interface BaseScriptEventData {
    scriptId: string;
    timestamp: number;
    eventType: ScriptEvent;
}

/**
 * Script creation event data
 */
export interface ScriptCreatedData extends BaseScriptEventData {
    eventType: ScriptEvent.Created;
    scriptPath: string;
    manifest: Record<string, unknown>;
}

/**
 * Script update event data
 */
export interface ScriptUpdatedData extends BaseScriptEventData {
    eventType: ScriptEvent.Updated;
    scriptPath: string;
    changes: Record<string, unknown>;
}

/**
 * Script deletion event data
 */
export interface ScriptDeletedData extends BaseScriptEventData {
    eventType: ScriptEvent.Deleted;
    scriptPath: string;
}

/**
 * Script execution started event data
 */
export interface ExecutionStartedData extends BaseScriptEventData {
    eventType: ScriptEvent.ExecutionStarted;
    params: Record<string, unknown>;
}

/**
 * Script execution progress event data
 */
export interface ExecutionProgressData extends BaseScriptEventData {
    eventType: ScriptEvent.ExecutionProgress;
    progress: number;
    status: string;
    output?: string;
    resourceUsage?: {
        peakMemory?: number;
        averageCpu?: number;
    };
}

/**
 * Script execution completed event data
 */
export interface ExecutionCompletedData extends BaseScriptEventData {
    eventType: ScriptEvent.ExecutionCompleted;
    result: ExecutionResult;
    duration: number;
}

/**
 * Script execution failed event data
 */
export interface ExecutionFailedData extends BaseScriptEventData {
    eventType: ScriptEvent.ExecutionFailed;
    error: {
        message: string;
        stack?: string;
    };
}

/**
 * Script execution cancelled event data
 */
export interface ExecutionCancelledData extends BaseScriptEventData {
    eventType: ScriptEvent.ExecutionCancelled;
    reason?: string;
    elapsedTime: number;
}

/**
 * Dependencies installation started event data
 */
export interface DependenciesInstallingData extends BaseScriptEventData {
    eventType: ScriptEvent.DependenciesInstalling;
    dependencies: string[];
}

/**
 * Dependencies installation completed event data
 */
export interface DependenciesInstalledData extends BaseScriptEventData {
    eventType: ScriptEvent.DependenciesInstalled;
    installed: string[];
}

/**
 * Dependencies installation error event data
 */
export interface DependenciesErrorData extends BaseScriptEventData {
    eventType: ScriptEvent.DependenciesError;
    error: {
        message: string;
        stack?: string;
    };
    failedDependencies: string[];
}

/**
 * Validation started event data
 */
export interface ValidationStartedData extends BaseScriptEventData {
    eventType: ScriptEvent.ValidationStarted;
}

/**
 * Validation completed event data
 */
export interface ValidationCompletedData extends BaseScriptEventData {
    eventType: ScriptEvent.ValidationCompleted;
    isValid: boolean;
    errors?: string[];
}

/**
 * Validation failed event data
 */
export interface ValidationFailedData extends BaseScriptEventData {
    eventType: ScriptEvent.ValidationFailed;
    errors: string[];
}

/**
 * Cache updated event data
 */
export interface CacheUpdatedData extends BaseScriptEventData {
    eventType: ScriptEvent.CacheUpdated;
    cacheKey: string;
    size?: number;
}

/**
 * Cache cleared event data
 */
export interface CacheClearedData extends BaseScriptEventData {
    eventType: ScriptEvent.CacheCleared;
    reason?: string;
}

/**
 * Cache error event data
 */
export interface CacheErrorData extends BaseScriptEventData {
    eventType: ScriptEvent.CacheError;
    error: {
        message: string;
        stack?: string;
    };
}

/**
 * Union type of all possible script event data types
 */
export type ScriptEventData = 
    | ScriptCreatedData
    | ScriptUpdatedData
    | ScriptDeletedData
    | ExecutionStartedData
    | ExecutionProgressData
    | ExecutionCompletedData
    | ExecutionFailedData
    | ExecutionCancelledData
    | DependenciesInstallingData
    | DependenciesInstalledData
    | DependenciesErrorData
    | ValidationStartedData
    | ValidationCompletedData
    | ValidationFailedData
    | CacheUpdatedData
    | CacheClearedData
    | CacheErrorData;

/**
 * Type guards for event data types
 */
export const isExecutionStartedData = (data: ScriptEventData): data is ExecutionStartedData => 
    data.eventType === ScriptEvent.ExecutionStarted;

export const isExecutionProgressData = (data: ScriptEventData): data is ExecutionProgressData => 
    data.eventType === ScriptEvent.ExecutionProgress;

export const isExecutionCompletedData = (data: ScriptEventData): data is ExecutionCompletedData => 
    data.eventType === ScriptEvent.ExecutionCompleted;

export const isExecutionFailedData = (data: ScriptEventData): data is ExecutionFailedData => 
    data.eventType === ScriptEvent.ExecutionFailed;

export const isExecutionCancelledData = (data: ScriptEventData): data is ExecutionCancelledData => 
    data.eventType === ScriptEvent.ExecutionCancelled;

/**
 * Manages script events with type-safe event handling
 */
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

    /**
     * Logs an event to the script's event history
     * @param eventType Type of the event being logged
     * @param data Event data to log
     */
    private logEvent(_eventType: ScriptEvent, data: ScriptEventData): void {
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

    /**
     * Emits a script event with type-safe data
     * @param event The event type to emit
     * @param data Typed data for the event
     */
    public emitScriptEvent<T extends ScriptEventData>(event: ScriptEvent, data: T): void {
        this.emit(event, data);
    }

    /**
     * Registers a listener for a specific script event type
     * @param event The event type to listen for
     * @param listener Callback function that receives the event data
     */
    public onScriptEvent<T extends ScriptEventData>(
        event: ScriptEvent, 
        listener: (data: T) => void
    ): void {
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

    /**
     * Typed event notification methods
     */
    
    public notifyExecutionStarted(scriptId: string, params: Record<string, unknown>): void {
        const data: ExecutionStartedData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.ExecutionStarted,
            params
        };
        this.emitScriptEvent(ScriptEvent.ExecutionStarted, data);
    }

    public notifyExecutionProgress(
        scriptId: string, 
        progress: number, 
        status: string, 
        output?: string
    ): void {
        const data: ExecutionProgressData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.ExecutionProgress,
            progress,
            status,
            output
        };
        this.emitScriptEvent(ScriptEvent.ExecutionProgress, data);
    }

    public notifyExecutionCancelled(scriptId: string, reason?: string): void {
        // Find the start time from the execution started event
        const executionStartedEvent = this.findEventOfType<ExecutionStartedData>(
            scriptId,
            ScriptEvent.ExecutionStarted
        );
        
        const elapsedTime = executionStartedEvent
            ? Date.now() - executionStartedEvent.timestamp
            : 0;

        const data: ExecutionCancelledData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.ExecutionCancelled,
            reason,
            elapsedTime
        };
        
        this.emitScriptEvent(ScriptEvent.ExecutionCancelled, data);
    }

    public notifyExecutionCompleted(scriptId: string, result: ExecutionResult, duration: number): void {
        const data: ExecutionCompletedData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.ExecutionCompleted,
            result,
            duration
        };
        
        this.emitScriptEvent(ScriptEvent.ExecutionCompleted, data);
    }

    public notifyExecutionFailed(scriptId: string, error: Error): void {
        const data: ExecutionFailedData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.ExecutionFailed,
            error: {
                message: error.message,
                stack: error.stack
            }
        };
        
        this.emitScriptEvent(ScriptEvent.ExecutionFailed, data);
    }

    public notifyDependenciesInstalling(scriptId: string, dependencies: string[]): void {
        const data: DependenciesInstallingData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.DependenciesInstalling,
            dependencies
        };
        
        this.emitScriptEvent(ScriptEvent.DependenciesInstalling, data);
    }

    public notifyDependenciesInstalled(scriptId: string, installed: string[]): void {
        const data: DependenciesInstalledData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.DependenciesInstalled,
            installed
        };
        
        this.emitScriptEvent(ScriptEvent.DependenciesInstalled, data);
    }

    public notifyValidationStarted(scriptId: string): void {
        const data: ValidationStartedData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.ValidationStarted
        };
        
        this.emitScriptEvent(ScriptEvent.ValidationStarted, data);
    }

    public notifyValidationCompleted(scriptId: string, isValid: boolean, errors?: string[]): void {
        const data: ValidationCompletedData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.ValidationCompleted,
            isValid,
            errors
        };
        
        this.emitScriptEvent(ScriptEvent.ValidationCompleted, data);
    }

    public notifyCacheUpdated(scriptId: string, cacheKey: string, size?: number): void {
        const data: CacheUpdatedData = {
            scriptId,
            timestamp: Date.now(),
            eventType: ScriptEvent.CacheUpdated,
            cacheKey,
            size
        };
        
        this.emitScriptEvent(ScriptEvent.CacheUpdated, data);
    }
    
    /**
     * Find an event of a specific type in a script's history
     * @param scriptId The script ID to search events for
     * @param eventType The type of event to find
     * @returns The first matching event or undefined
     */
    private findEventOfType<T extends ScriptEventData>(
        scriptId: string, 
        eventType: ScriptEvent
    ): T | undefined {
        const events = this.eventHistory.get(scriptId) || [];
        return events.find(event => event.eventType === eventType) as T | undefined;
    }

    /**
     * Gets execution statistics for a script
     * @param scriptId Script ID to get stats for
     * @returns Execution statistics including counts and average duration
     */
    public async getExecutionStats(scriptId: string): Promise<{
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        averageDuration: number;
    }> {
        const events = this.getScriptEventHistory(scriptId);
        
        const completedEvents = events.filter(
            e => e.eventType === ScriptEvent.ExecutionCompleted
        ) as ExecutionCompletedData[];
        
        const failedEvents = events.filter(
            e => e.eventType === ScriptEvent.ExecutionFailed
        ) as ExecutionFailedData[];
        
        const durations = completedEvents.map(e => e.duration);
        const avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;

        return {
            totalExecutions: completedEvents.length + failedEvents.length,
            successfulExecutions: completedEvents.length,
            failedExecutions: failedEvents.length,
            averageDuration: avgDuration
        };
    }
}
