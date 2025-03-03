"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceLimitsManager = void 0;
const events_1 = require("events");
const resource_monitor_1 = require("../execution/resource-monitor");
class ResourceLimitsManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.defaultLimits = {
            maxMemory: 512, // 512 MB
            maxCpu: 50, // 50%
            maxDuration: 300, // 5 minutes
            maxFileSize: 10 * 1024 * 1024, // 10 MB
            maxOpenFiles: 10,
            maxThreads: 1
        };
        this.scriptLimits = new Map();
        this.monitors = new Map();
        this.violations = new Map();
    }
    static getInstance() {
        if (!ResourceLimitsManager.instance) {
            ResourceLimitsManager.instance = new ResourceLimitsManager();
        }
        return ResourceLimitsManager.instance;
    }
    setScriptLimits(scriptId, limits) {
        const currentLimits = this.getScriptLimits(scriptId);
        this.scriptLimits.set(scriptId, {
            ...currentLimits,
            ...limits
        });
    }
    getScriptLimits(scriptId) {
        return {
            ...this.defaultLimits,
            ...this.scriptLimits.get(scriptId)
        };
    }
    startMonitoring(scriptId, processId) {
        const monitor = new resource_monitor_1.ResourceMonitor();
        this.monitors.set(scriptId, monitor);
        this.violations.set(scriptId, []);
        monitor.start(processId);
        // Vérifier les limites toutes les secondes
        const interval = setInterval(() => {
            const usage = monitor.getUsage();
            this.checkLimits(scriptId, usage[usage.length - 1]);
        }, 1000);
        // Nettoyer après l'arrêt du monitoring
        monitor.on('stop', () => {
            clearInterval(interval);
            this.monitors.delete(scriptId);
        });
    }
    stopMonitoring(scriptId) {
        const monitor = this.monitors.get(scriptId);
        if (monitor) {
            monitor.stop();
            this.monitors.delete(scriptId);
        }
    }
    getResourceUsage(scriptId) {
        const monitor = this.monitors.get(scriptId);
        return monitor ? monitor.getUsage() : [];
    }
    getViolations(scriptId) {
        return this.violations.get(scriptId) || [];
    }
    async loadLimitsFromManifest(scriptId, manifest) {
        const resourceLimits = manifest.execution.resource_limits;
        if (!resourceLimits)
            return;
        this.setScriptLimits(scriptId, {
            maxMemory: resourceLimits.memory || this.defaultLimits.maxMemory,
            maxCpu: resourceLimits.cpu || this.defaultLimits.maxCpu,
            maxDuration: resourceLimits.duration || this.defaultLimits.maxDuration,
            maxFileSize: this.defaultLimits.maxFileSize,
            maxOpenFiles: this.defaultLimits.maxOpenFiles,
            maxThreads: this.defaultLimits.maxThreads
        });
    }
    validateLimits(limits) {
        const errors = [];
        if (limits.maxMemory && limits.maxMemory > 1024) {
            errors.push('Limite mémoire trop élevée (max 1024 MB)');
        }
        if (limits.maxCpu && limits.maxCpu > 80) {
            errors.push('Limite CPU trop élevée (max 80%)');
        }
        if (limits.maxDuration && limits.maxDuration > 3600) {
            errors.push('Durée maximale trop élevée (max 1 heure)');
        }
        if (limits.maxFileSize && limits.maxFileSize > 100 * 1024 * 1024) {
            errors.push('Taille de fichier maximale trop élevée (max 100 MB)');
        }
        if (limits.maxOpenFiles && limits.maxOpenFiles > 20) {
            errors.push('Nombre maximum de fichiers ouverts trop élevé (max 20)');
        }
        if (limits.maxThreads && limits.maxThreads > 4) {
            errors.push('Nombre maximum de threads trop élevé (max 4)');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    checkLimits(scriptId, usage) {
        const limits = this.getScriptLimits(scriptId);
        const violations = this.violations.get(scriptId) || [];
        // Vérifier la mémoire
        if (usage.currentMemory > limits.maxMemory) {
            this.recordViolation(scriptId, {
                scriptId,
                resource: 'maxMemory',
                limit: limits.maxMemory,
                current: usage.currentMemory,
                timestamp: usage.timestamp
            });
        }
        // Vérifier le CPU
        if (usage.currentCpu > limits.maxCpu) {
            this.recordViolation(scriptId, {
                scriptId,
                resource: 'maxCpu',
                limit: limits.maxCpu,
                current: usage.currentCpu,
                timestamp: usage.timestamp
            });
        }
        // Vérifier la durée
        const startTime = this.getScriptStartTime(scriptId);
        if (startTime) {
            const duration = (Date.now() - startTime) / 1000;
            if (duration > limits.maxDuration) {
                this.recordViolation(scriptId, {
                    scriptId,
                    resource: 'maxDuration',
                    limit: limits.maxDuration,
                    current: duration,
                    timestamp: Date.now()
                });
            }
        }
    }
    recordViolation(scriptId, violation) {
        const violations = this.violations.get(scriptId) || [];
        violations.push(violation);
        this.violations.set(scriptId, violations);
        this.emit('violation', violation);
    }
    getScriptStartTime(scriptId) {
        const usage = this.getResourceUsage(scriptId);
        return usage.length > 0 ? usage[0].timestamp : null;
    }
    getResourceStats(scriptId) {
        const usage = this.getResourceUsage(scriptId);
        const violations = this.getViolations(scriptId);
        if (usage.length === 0) {
            return {
                averageMemory: 0,
                averageCpu: 0,
                peakMemory: 0,
                peakCpu: 0,
                duration: 0,
                violationCount: violations.length
            };
        }
        const sum = usage.reduce((acc, curr) => ({
            memory: acc.memory + curr.currentMemory,
            cpu: acc.cpu + curr.currentCpu
        }), { memory: 0, cpu: 0 });
        const peak = usage.reduce((acc, curr) => ({
            memory: Math.max(acc.memory, curr.currentMemory),
            cpu: Math.max(acc.cpu, curr.currentCpu)
        }), { memory: 0, cpu: 0 });
        const duration = (usage[usage.length - 1].timestamp - usage[0].timestamp) / 1000;
        return {
            averageMemory: sum.memory / usage.length,
            averageCpu: sum.cpu / usage.length,
            peakMemory: peak.memory,
            peakCpu: peak.cpu,
            duration,
            violationCount: violations.length
        };
    }
}
exports.ResourceLimitsManager = ResourceLimitsManager;
//# sourceMappingURL=resource-limits.js.map