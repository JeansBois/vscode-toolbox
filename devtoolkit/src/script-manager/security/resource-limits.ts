import { EventEmitter } from 'events';
import { ScriptManifest } from '../types';
import { ResourceMonitor, ResourceUsage } from '../execution/resource-monitor';

export interface ResourceLimits {
    maxMemory: number; // MB
    maxCpu: number; // Pourcentage
    maxDuration: number; // Secondes
    maxFileSize: number; // Bytes
    maxOpenFiles: number;
    maxThreads: number;
}

export interface ResourceViolation {
    scriptId: string;
    resource: keyof ResourceLimits;
    limit: number;
    current: number;
    timestamp: number;
}

export class ResourceLimitsManager extends EventEmitter {
    private readonly defaultLimits: ResourceLimits;
    private readonly scriptLimits: Map<string, ResourceLimits>;
    private readonly monitors: Map<string, ResourceMonitor>;
    private readonly violations: Map<string, ResourceViolation[]>;
    private static instance: ResourceLimitsManager;

    private constructor() {
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

    public static getInstance(): ResourceLimitsManager {
        if (!ResourceLimitsManager.instance) {
            ResourceLimitsManager.instance = new ResourceLimitsManager();
        }
        return ResourceLimitsManager.instance;
    }

    public setScriptLimits(scriptId: string, limits: Partial<ResourceLimits>): void {
        const currentLimits = this.getScriptLimits(scriptId);
        this.scriptLimits.set(scriptId, {
            ...currentLimits,
            ...limits
        });
    }

    public getScriptLimits(scriptId: string): ResourceLimits {
        return {
            ...this.defaultLimits,
            ...this.scriptLimits.get(scriptId)
        };
    }

    public startMonitoring(scriptId: string, processId: number): void {
        const monitor = new ResourceMonitor();
        this.monitors.set(scriptId, monitor);
        this.violations.set(scriptId, []);

        monitor.start(processId);
        
        // Check limits every second
        const interval = setInterval(() => {
            const usage = monitor.getUsage();
            this.checkLimits(scriptId, usage[usage.length - 1]);
        }, 1000);

        // Clean up after monitoring stops
        monitor.on('stop', () => {
            clearInterval(interval);
            this.monitors.delete(scriptId);
        });
    }

    public stopMonitoring(scriptId: string): void {
        const monitor = this.monitors.get(scriptId);
        if (monitor) {
            monitor.stop();
            this.monitors.delete(scriptId);
        }
    }

    public getResourceUsage(scriptId: string): ResourceUsage[] {
        const monitor = this.monitors.get(scriptId);
        return monitor ? monitor.getUsage() : [];
    }

    public getViolations(scriptId: string): ResourceViolation[] {
        return this.violations.get(scriptId) || [];
    }

    public async loadLimitsFromManifest(
        scriptId: string,
        manifest: ScriptManifest
    ): Promise<void> {
        const resourceLimits = manifest.execution.resource_limits;
        if (!resourceLimits) return;

        this.setScriptLimits(scriptId, {
            maxMemory: resourceLimits.memory || this.defaultLimits.maxMemory,
            maxCpu: resourceLimits.cpu || this.defaultLimits.maxCpu,
            maxDuration: resourceLimits.duration || this.defaultLimits.maxDuration,
            maxFileSize: this.defaultLimits.maxFileSize,
            maxOpenFiles: this.defaultLimits.maxOpenFiles,
            maxThreads: this.defaultLimits.maxThreads
        });
    }

    public validateLimits(limits: Partial<ResourceLimits>): {
        isValid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (limits.maxMemory && limits.maxMemory > 1024) {
            errors.push('Memory limit too high (max 1024 MB)');
        }

        if (limits.maxCpu && limits.maxCpu > 80) {
            errors.push('CPU limit too high (max 80%)');
        }

        if (limits.maxDuration && limits.maxDuration > 3600) {
            errors.push('Maximum duration too high (max 1 hour)');
        }

        if (limits.maxFileSize && limits.maxFileSize > 100 * 1024 * 1024) {
            errors.push('Maximum file size too high (max 100 MB)');
        }

        if (limits.maxOpenFiles && limits.maxOpenFiles > 20) {
            errors.push('Maximum number of open files too high (max 20)');
        }

        if (limits.maxThreads && limits.maxThreads > 4) {
            errors.push('Maximum number of threads too high (max 4)');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    private checkLimits(scriptId: string, usage: ResourceUsage): void {
        const limits = this.getScriptLimits(scriptId);
        // Unused variable removed or prefixed with underscore

        // Check memory
        if (usage.currentMemory > limits.maxMemory) {
            this.recordViolation(scriptId, {
                scriptId,
                resource: 'maxMemory',
                limit: limits.maxMemory,
                current: usage.currentMemory,
                timestamp: usage.timestamp
            });
        }

        // Check CPU
        if (usage.currentCpu > limits.maxCpu) {
            this.recordViolation(scriptId, {
                scriptId,
                resource: 'maxCpu',
                limit: limits.maxCpu,
                current: usage.currentCpu,
                timestamp: usage.timestamp
            });
        }

        // Check duration
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

    private recordViolation(scriptId: string, violation: ResourceViolation): void {
        const violations = this.violations.get(scriptId) || [];
        violations.push(violation);
        this.violations.set(scriptId, violations);
        this.emit('violation', violation);
    }

    private getScriptStartTime(scriptId: string): number | null {
        const usage = this.getResourceUsage(scriptId);
        return usage.length > 0 ? usage[0].timestamp : null;
    }

    public getResourceStats(scriptId: string): {
        averageMemory: number;
        averageCpu: number;
        peakMemory: number;
        peakCpu: number;
        duration: number;
        violationCount: number;
    } {
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

        const sum = usage.reduce(
            (acc, curr) => ({
                memory: acc.memory + curr.currentMemory,
                cpu: acc.cpu + curr.currentCpu
            }),
            { memory: 0, cpu: 0 }
        );

        const peak = usage.reduce(
            (acc, curr) => ({
                memory: Math.max(acc.memory, curr.currentMemory),
                cpu: Math.max(acc.cpu, curr.currentCpu)
            }),
            { memory: 0, cpu: 0 }
        );

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
