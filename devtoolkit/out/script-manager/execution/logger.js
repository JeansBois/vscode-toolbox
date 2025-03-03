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
exports.ExecutionLogger = exports.LogLevel = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
var LogLevel;
(function (LogLevel) {
    LogLevel["Debug"] = "DEBUG";
    LogLevel["Info"] = "INFO";
    LogLevel["Warning"] = "WARNING";
    LogLevel["Error"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class ExecutionLogger {
    constructor(baseDir = process.cwd()) {
        this.maxLogSize = 10 * 1024 * 1024; // 10 MB
        this.maxLogFiles = 5;
        this.logDir = path.join(baseDir, 'logs', 'script-executions');
        this.ensureLogDirectory();
    }
    static getInstance(baseDir) {
        if (!ExecutionLogger.instance) {
            ExecutionLogger.instance = new ExecutionLogger(baseDir);
        }
        return ExecutionLogger.instance;
    }
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    logOutput(scriptId, output) {
        this.log(LogLevel.Info, scriptId, 'Output', { output });
    }
    logError(scriptId, error) {
        this.log(LogLevel.Error, scriptId, error.message, {
            stack: error.stack,
            name: error.name
        });
    }
    logInfo(scriptId, message, details) {
        this.log(LogLevel.Info, scriptId, message, details);
    }
    logWarning(scriptId, message, details) {
        this.log(LogLevel.Warning, scriptId, message, details);
    }
    logDebug(scriptId, message, details) {
        this.log(LogLevel.Debug, scriptId, message, details);
    }
    log(level, scriptId, message, details) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            scriptId,
            message,
            details
        };
        this.writeLogEntry(scriptId, entry);
    }
    writeLogEntry(scriptId, entry) {
        const logFile = path.join(this.logDir, `${scriptId}.log`);
        const rotatedLogFile = path.join(this.logDir, `${scriptId}.{0}.log`);
        try {
            // Vérifier la taille du fichier de log
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size >= this.maxLogSize) {
                    this.rotateLog(logFile, rotatedLogFile);
                }
            }
            // Écrire l'entrée de log
            const logLine = `[${entry.timestamp}] ${entry.level}: ${entry.message}\n`;
            const detailsLine = entry.details
                ? `Details: ${JSON.stringify(entry.details, null, 2)}\n`
                : '';
            fs.appendFileSync(logFile, logLine + detailsLine);
        }
        catch (error) {
            console.error(`Erreur lors de l'écriture du log pour ${scriptId}:`, error);
        }
    }
    rotateLog(logFile, rotatedPattern) {
        // Déplacer les fichiers existants
        for (let i = this.maxLogFiles - 1; i >= 0; i--) {
            const source = i === 0
                ? logFile
                : rotatedPattern.replace('{0}', (i - 1).toString());
            const target = rotatedPattern.replace('{0}', i.toString());
            if (fs.existsSync(source)) {
                if (i === this.maxLogFiles - 1) {
                    fs.unlinkSync(source);
                }
                else {
                    fs.renameSync(source, target);
                }
            }
        }
    }
    async getLogEntries(scriptId, options = {}) {
        const logFile = path.join(this.logDir, `${scriptId}.log`);
        if (!fs.existsSync(logFile)) {
            return [];
        }
        const content = await fs.promises.readFile(logFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        let entries = lines
            .map(line => this.parseLogLine(line))
            .filter(entry => entry !== null);
        // Appliquer les filtres
        if (options.startTime) {
            entries = entries.filter(entry => new Date(entry.timestamp) >= options.startTime);
        }
        if (options.endTime) {
            entries = entries.filter(entry => new Date(entry.timestamp) <= options.endTime);
        }
        if (options.level) {
            entries = entries.filter(entry => entry.level === options.level);
        }
        if (options.limit) {
            entries = entries.slice(-options.limit);
        }
        return entries;
    }
    parseLogLine(line) {
        try {
            const match = line.match(/\[(.*?)\] (\w+): (.*)/);
            if (!match) {
                return null;
            }
            const [, timestamp, level, message] = match;
            return {
                timestamp,
                level: level,
                scriptId: 'unknown', // Extrait du contexte ou du nom de fichier
                message,
                details: undefined // Pourrait être parsé depuis les lignes suivantes
            };
        }
        catch {
            return null;
        }
    }
    async clearLogs(scriptId) {
        const logFile = path.join(this.logDir, `${scriptId}.log`);
        if (fs.existsSync(logFile)) {
            await fs.promises.unlink(logFile);
        }
        // Supprimer les fichiers de rotation
        for (let i = 0; i < this.maxLogFiles; i++) {
            const rotatedFile = path.join(this.logDir, `${scriptId}.${i}.log`);
            if (fs.existsSync(rotatedFile)) {
                await fs.promises.unlink(rotatedFile);
            }
        }
    }
    async getLogStats(scriptId) {
        const entries = await this.getLogEntries(scriptId);
        const logFile = path.join(this.logDir, `${scriptId}.log`);
        const stats = fs.existsSync(logFile) ? fs.statSync(logFile) : { size: 0 };
        return {
            totalEntries: entries.length,
            errorCount: entries.filter(e => e.level === LogLevel.Error).length,
            warningCount: entries.filter(e => e.level === LogLevel.Warning).length,
            lastEntry: entries.length > 0
                ? new Date(entries[entries.length - 1].timestamp)
                : new Date(0),
            logSize: stats.size
        };
    }
}
exports.ExecutionLogger = ExecutionLogger;
//# sourceMappingURL=logger.js.map