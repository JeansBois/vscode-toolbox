"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptEventManager = exports.ScriptEvent = void 0;
const events_1 = require("events");
var ScriptEvent;
(function (ScriptEvent) {
    // Événements du cycle de vie
    ScriptEvent["Created"] = "script:created";
    ScriptEvent["Updated"] = "script:updated";
    ScriptEvent["Deleted"] = "script:deleted";
    // Événements d'exécution
    ScriptEvent["ExecutionStarted"] = "script:execution:started";
    ScriptEvent["ExecutionProgress"] = "script:execution:progress";
    ScriptEvent["ExecutionCompleted"] = "script:execution:completed";
    ScriptEvent["ExecutionFailed"] = "script:execution:failed";
    ScriptEvent["ExecutionCancelled"] = "script:execution:cancelled";
    // Événements de dépendances
    ScriptEvent["DependenciesInstalling"] = "script:dependencies:installing";
    ScriptEvent["DependenciesInstalled"] = "script:dependencies:installed";
    ScriptEvent["DependenciesError"] = "script:dependencies:error";
    // Événements de validation
    ScriptEvent["ValidationStarted"] = "script:validation:started";
    ScriptEvent["ValidationCompleted"] = "script:validation:completed";
    ScriptEvent["ValidationFailed"] = "script:validation:failed";
    // Événements de cache
    ScriptEvent["CacheUpdated"] = "script:cache:updated";
    ScriptEvent["CacheCleared"] = "script:cache:cleared";
    ScriptEvent["CacheError"] = "script:cache:error";
})(ScriptEvent || (exports.ScriptEvent = ScriptEvent = {}));
class ScriptEventManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.maxHistoryPerScript = 100;
        this.eventHistory = new Map();
        this.setupEventLogging();
    }
    static getInstance() {
        if (!ScriptEventManager.instance) {
            ScriptEventManager.instance = new ScriptEventManager();
        }
        return ScriptEventManager.instance;
    }
    setupEventLogging() {
        Object.values(ScriptEvent).forEach(eventType => {
            this.on(eventType, (data) => {
                this.logEvent(eventType, data);
            });
        });
    }
    logEvent(_eventType, data) {
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
    emitScriptEvent(event, data) {
        this.emit(event, data);
    }
    onScriptEvent(event, listener) {
        this.on(event, listener);
    }
    getScriptEventHistory(scriptId) {
        return this.eventHistory.get(scriptId) || [];
    }
    clearScriptEventHistory(scriptId) {
        this.eventHistory.delete(scriptId);
    }
    getRecentEvents(scriptId, limit = 10) {
        const events = this.eventHistory.get(scriptId) || [];
        return events.slice(-limit);
    }
    // Méthodes d'émission d'événements spécifiques
    notifyExecutionStarted(scriptId, details) {
        this.emitScriptEvent(ScriptEvent.ExecutionStarted, {
            scriptId,
            timestamp: Date.now(),
            details
        });
    }
    notifyExecutionProgress(scriptId, progress, status, output) {
        this.emitScriptEvent(ScriptEvent.ExecutionProgress, {
            scriptId,
            timestamp: Date.now(),
            progress,
            status,
            output
        });
    }
    notifyExecutionCancelled(scriptId, reason) {
        const execution = this.eventHistory.get(scriptId)?.find(e => e.details?.type === ScriptEvent.ExecutionStarted);
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
        });
    }
    notifyExecutionCompleted(scriptId, result, duration) {
        this.emitScriptEvent(ScriptEvent.ExecutionCompleted, {
            scriptId,
            timestamp: Date.now(),
            result,
            duration
        });
    }
    notifyExecutionFailed(scriptId, error) {
        this.emitScriptEvent(ScriptEvent.ExecutionFailed, {
            scriptId,
            timestamp: Date.now(),
            details: {
                error: error.message,
                stack: error.stack
            }
        });
    }
    notifyDependenciesInstalling(scriptId, dependencies) {
        this.emitScriptEvent(ScriptEvent.DependenciesInstalling, {
            scriptId,
            timestamp: Date.now(),
            details: { dependencies }
        });
    }
    notifyDependenciesInstalled(scriptId, installed) {
        this.emitScriptEvent(ScriptEvent.DependenciesInstalled, {
            scriptId,
            timestamp: Date.now(),
            details: { installed }
        });
    }
    notifyValidationStarted(scriptId) {
        this.emitScriptEvent(ScriptEvent.ValidationStarted, {
            scriptId,
            timestamp: Date.now()
        });
    }
    notifyValidationCompleted(scriptId, isValid, errors) {
        this.emitScriptEvent(ScriptEvent.ValidationCompleted, {
            scriptId,
            timestamp: Date.now(),
            details: { isValid, errors }
        });
    }
    notifyCacheUpdated(scriptId, details) {
        this.emitScriptEvent(ScriptEvent.CacheUpdated, {
            scriptId,
            timestamp: Date.now(),
            details
        });
    }
    // Méthodes utilitaires
    async getExecutionStats(scriptId) {
        const events = this.getScriptEventHistory(scriptId);
        const executions = events.filter(e => e.details?.type === ScriptEvent.ExecutionCompleted ||
            e.details?.type === ScriptEvent.ExecutionFailed);
        const successful = executions.filter(e => e.details?.type === ScriptEvent.ExecutionCompleted);
        const durations = successful.map(e => e.duration);
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
exports.ScriptEventManager = ScriptEventManager;
//# sourceMappingURL=events.js.map