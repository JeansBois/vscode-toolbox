import * as os from 'os';
import { EventEmitter } from 'events';

export interface ResourceUsage {
    currentCpu: number;
    currentMemory: number;
    peakCpu: number;
    peakMemory: number;
    timestamp: number;
}

export class ResourceMonitor extends EventEmitter {
    private interval: NodeJS.Timeout | null = null;
    private readonly measurements: ResourceUsage[] = [];
    private readonly maxMeasurements: number = 1000;
    private processId?: number;

    constructor() {
        super();
        this.measurements = [];
    }

    public start(processId: number): void {
        this.processId = processId;
        this.interval = setInterval(() => this.measure(), 1000);
        
        // Reset measurements when starting
        this.measurements.length = 0;
    }

    public stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.emit('stop');
        }
    }

    public getUsage(): ResourceUsage[] {
        return [...this.measurements];
    }

    public getAverageUsage(): ResourceUsage {
        if (this.measurements.length === 0) {
            return {
                currentCpu: 0,
                currentMemory: 0,
                peakCpu: 0,
                peakMemory: 0,
                timestamp: Date.now()
            };
        }

        const sum = this.measurements.reduce(
            (acc, measurement) => ({
                currentCpu: acc.currentCpu + measurement.currentCpu,
                currentMemory: acc.currentMemory + measurement.currentMemory,
                peakCpu: Math.max(acc.peakCpu, measurement.currentCpu),
                peakMemory: Math.max(acc.peakMemory, measurement.currentMemory),
                timestamp: measurement.timestamp
            }),
            { currentCpu: 0, currentMemory: 0, peakCpu: 0, peakMemory: 0, timestamp: 0 }
        );

        return {
            currentCpu: sum.currentCpu / this.measurements.length,
            currentMemory: sum.currentMemory / this.measurements.length,
            peakCpu: sum.peakCpu,
            peakMemory: sum.peakMemory,
            timestamp: Date.now()
        };
    }

    public getPeakUsage(): ResourceUsage {
        if (this.measurements.length === 0) {
            return {
                currentCpu: 0,
                currentMemory: 0,
                peakCpu: 0,
                peakMemory: 0,
                timestamp: Date.now()
            };
        }

        return this.measurements.reduce(
            (peak, measurement) => ({
                currentCpu: measurement.currentCpu,
                currentMemory: measurement.currentMemory,
                peakCpu: Math.max(peak.peakCpu, measurement.currentCpu),
                peakMemory: Math.max(peak.peakMemory, measurement.currentMemory),
                timestamp: measurement.timestamp
            }),
            { currentCpu: 0, currentMemory: 0, peakCpu: 0, peakMemory: 0, timestamp: 0 }
        );
    }

    private async measure(): Promise<void> {
        if (!this.processId) {
            return;
        }

        try {
            const currentCpu = await this.measureCPU();
            const currentMemory = await this.measureMemory();
            
            const usage: ResourceUsage = {
                currentCpu,
                currentMemory,
                peakCpu: Math.max(...this.measurements.map(m => m.currentCpu), currentCpu),
                peakMemory: Math.max(...this.measurements.map(m => m.currentMemory), currentMemory),
                timestamp: Date.now()
            };

            this.measurements.push(usage);

            // Limiter le nombre de mesures stockées
            if (this.measurements.length > this.maxMeasurements) {
                this.measurements.shift();
            }
        } catch (error) {
            console.error('Error measuring resources:', error);
        }
    }

    private async measureCPU(): Promise<number> {
        // Cette implémentation est une approximation simple
        // Pour une mesure plus précise, il faudrait utiliser des outils natifs
        const startUsage = process.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 100));
        const endUsage = process.cpuUsage(startUsage);
        
        const totalUsage = endUsage.user + endUsage.system;
        return (totalUsage / 1000000) * 10; // Convertir en pourcentage
    }

    private async measureMemory(): Promise<number> {
        const used = process.memoryUsage();
        return used.heapUsed / 1024 / 1024; // Convertir en MB
    }

    public getResourceLimits(): {
        cpuCount: number;
        totalMemory: number;
    } {
        return {
            cpuCount: os.cpus().length,
            totalMemory: os.totalmem() / 1024 / 1024 // MB
        };
    }

    public isExceedingLimits(limits: {
        maxCpu?: number;
        maxMemory?: number;
        maxDuration?: number;
    }): boolean {
        const usage = this.getAverageUsage();
        const startTime = this.measurements[0]?.timestamp;
        const now = Date.now();
        
        if (limits.maxCpu && usage.currentCpu > limits.maxCpu) {
            return true;
        }
        
        if (limits.maxMemory && usage.currentMemory > limits.maxMemory) {
            return true;
        }
        
        if (limits.maxDuration && startTime && (now - startTime) / 1000 > limits.maxDuration) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Checks resource usage against configured limits and emits events if limits are exceeded
     * @param limits Configuration object containing resource limits
     */
    public enforceResourceLimits(limits: {
        maxCpu?: number;
        maxMemory?: number;
        maxDuration?: number;
    }): void {
        if (!this.interval) {
            return; // Not monitoring yet
        }

        const usage = this.getAverageUsage();
        const startTime = this.measurements[0]?.timestamp;
        const now = Date.now();
        
        // Check CPU limit
        if (limits.maxCpu && usage.currentCpu > limits.maxCpu) {
            this.emit('limit-exceeded', {
                resource: 'cpu',
                current: usage.currentCpu,
                limit: limits.maxCpu,
                unit: '%'
            });
        }
        
        // Check memory limit (in MB)
        if (limits.maxMemory && usage.currentMemory > limits.maxMemory) {
            this.emit('limit-exceeded', {
                resource: 'memory',
                current: usage.currentMemory,
                limit: limits.maxMemory,
                unit: 'MB'
            });
        }
        
        // Check duration limit (in seconds)
        if (limits.maxDuration && startTime && (now - startTime) / 1000 > limits.maxDuration) {
            this.emit('limit-exceeded', {
                resource: 'duration',
                current: (now - startTime) / 1000,
                limit: limits.maxDuration,
                unit: 'seconds'
            });
        }
    }
}
