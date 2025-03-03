"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceMonitor = void 0;
const os = __importStar(require("os"));
const events_1 = require("events");
class ResourceMonitor extends events_1.EventEmitter {
    constructor() {
        super();
        this.interval = null;
        this.measurements = [];
        this.maxMeasurements = 1000;
        this.measurements = [];
    }
    start(processId) {
        this.processId = processId;
        this.interval = setInterval(() => this.measure(), 1000);
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.emit('stop');
        }
    }
    getUsage() {
        return [...this.measurements];
    }
    getAverageUsage() {
        if (this.measurements.length === 0) {
            return {
                currentCpu: 0,
                currentMemory: 0,
                peakCpu: 0,
                peakMemory: 0,
                timestamp: Date.now()
            };
        }
        const sum = this.measurements.reduce((acc, measurement) => ({
            currentCpu: acc.currentCpu + measurement.currentCpu,
            currentMemory: acc.currentMemory + measurement.currentMemory,
            peakCpu: Math.max(acc.peakCpu, measurement.currentCpu),
            peakMemory: Math.max(acc.peakMemory, measurement.currentMemory),
            timestamp: measurement.timestamp
        }), { currentCpu: 0, currentMemory: 0, peakCpu: 0, peakMemory: 0, timestamp: 0 });
        return {
            currentCpu: sum.currentCpu / this.measurements.length,
            currentMemory: sum.currentMemory / this.measurements.length,
            peakCpu: sum.peakCpu,
            peakMemory: sum.peakMemory,
            timestamp: Date.now()
        };
    }
    getPeakUsage() {
        if (this.measurements.length === 0) {
            return {
                currentCpu: 0,
                currentMemory: 0,
                peakCpu: 0,
                peakMemory: 0,
                timestamp: Date.now()
            };
        }
        return this.measurements.reduce((peak, measurement) => ({
            currentCpu: measurement.currentCpu,
            currentMemory: measurement.currentMemory,
            peakCpu: Math.max(peak.peakCpu, measurement.currentCpu),
            peakMemory: Math.max(peak.peakMemory, measurement.currentMemory),
            timestamp: measurement.timestamp
        }), { currentCpu: 0, currentMemory: 0, peakCpu: 0, peakMemory: 0, timestamp: 0 });
    }
    async measure() {
        if (!this.processId) {
            return;
        }
        try {
            const currentCpu = await this.measureCPU();
            const currentMemory = await this.measureMemory();
            const usage = {
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
        }
        catch (error) {
            console.error('Erreur lors de la mesure des ressources:', error);
        }
    }
    async measureCPU() {
        // Cette implémentation est une approximation simple
        // Pour une mesure plus précise, il faudrait utiliser des outils natifs
        const startUsage = process.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 100));
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = endUsage.user + endUsage.system;
        return (totalUsage / 1000000) * 10; // Convertir en pourcentage
    }
    async measureMemory() {
        const used = process.memoryUsage();
        return used.heapUsed / 1024 / 1024; // Convertir en MB
    }
    getResourceLimits() {
        return {
            cpuCount: os.cpus().length,
            totalMemory: os.totalmem() / 1024 / 1024 // MB
        };
    }
    isExceedingLimits(limits) {
        const usage = this.getAverageUsage();
        if (limits.maxCpu && usage.currentCpu > limits.maxCpu) {
            return true;
        }
        if (limits.maxMemory && usage.currentMemory > limits.maxMemory) {
            return true;
        }
        return false;
    }
}
exports.ResourceMonitor = ResourceMonitor;
//# sourceMappingURL=resource-monitor.js.map