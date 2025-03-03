import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    Debug = 'DEBUG',
    Info = 'INFO',
    Warning = 'WARNING',
    Error = 'ERROR'
}

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    scriptId: string;
    message: string;
    details?: any;
}

export class ExecutionLogger {
    private readonly logDir: string;
    private readonly maxLogSize: number = 10 * 1024 * 1024; // 10 MB
    private readonly maxLogFiles: number = 5;
    private static instance: ExecutionLogger;

    constructor(baseDir: string = process.cwd()) {
        this.logDir = path.join(baseDir, 'logs', 'script-executions');
        this.ensureLogDirectory();
    }

    public static getInstance(baseDir?: string): ExecutionLogger {
        if (!ExecutionLogger.instance) {
            ExecutionLogger.instance = new ExecutionLogger(baseDir);
        }
        return ExecutionLogger.instance;
    }

    private ensureLogDirectory(): void {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    public logOutput(scriptId: string, output: string): void {
        this.log(LogLevel.Info, scriptId, 'Output', { output });
    }

    public logError(scriptId: string, error: Error): void {
        this.log(LogLevel.Error, scriptId, error.message, {
            stack: error.stack,
            name: error.name
        });
    }

    public logInfo(scriptId: string, message: string, details?: any): void {
        this.log(LogLevel.Info, scriptId, message, details);
    }

    public logWarning(scriptId: string, message: string, details?: any): void {
        this.log(LogLevel.Warning, scriptId, message, details);
    }

    public logDebug(scriptId: string, message: string, details?: any): void {
        this.log(LogLevel.Debug, scriptId, message, details);
    }

    private log(level: LogLevel, scriptId: string, message: string, details?: any): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            scriptId,
            message,
            details
        };

        this.writeLogEntry(scriptId, entry);
    }

    private writeLogEntry(scriptId: string, entry: LogEntry): void {
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
        } catch (error) {
            console.error(`Erreur lors de l'écriture du log pour ${scriptId}:`, error);
        }
    }

    private rotateLog(logFile: string, rotatedPattern: string): void {
        // Déplacer les fichiers existants
        for (let i = this.maxLogFiles - 1; i >= 0; i--) {
            const source = i === 0 
                ? logFile 
                : rotatedPattern.replace('{0}', (i - 1).toString());
            const target = rotatedPattern.replace('{0}', i.toString());

            if (fs.existsSync(source)) {
                if (i === this.maxLogFiles - 1) {
                    fs.unlinkSync(source);
                } else {
                    fs.renameSync(source, target);
                }
            }
        }
    }

    public async getLogEntries(
        scriptId: string,
        options: {
            startTime?: Date;
            endTime?: Date;
            level?: LogLevel;
            limit?: number;
        } = {}
    ): Promise<LogEntry[]> {
        const logFile = path.join(this.logDir, `${scriptId}.log`);
        if (!fs.existsSync(logFile)) {
            return [];
        }

        const content = await fs.promises.readFile(logFile, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        let entries = lines
            .map(line => this.parseLogLine(line))
            .filter(entry => entry !== null) as LogEntry[];

        // Appliquer les filtres
        if (options.startTime) {
            entries = entries.filter(entry => 
                new Date(entry.timestamp) >= options.startTime!
            );
        }

        if (options.endTime) {
            entries = entries.filter(entry => 
                new Date(entry.timestamp) <= options.endTime!
            );
        }

        if (options.level) {
            entries = entries.filter(entry => 
                entry.level === options.level
            );
        }

        if (options.limit) {
            entries = entries.slice(-options.limit);
        }

        return entries;
    }

    private parseLogLine(line: string): LogEntry | null {
        try {
            const match = line.match(/\[(.*?)\] (\w+): (.*)/);
            if (!match) {
                return null;
            }

            const [, timestamp, level, message] = match;
            
            return {
                timestamp,
                level: level as LogLevel,
                scriptId: 'unknown', // Extrait du contexte ou du nom de fichier
                message,
                details: undefined // Pourrait être parsé depuis les lignes suivantes
            };
        } catch {
            return null;
        }
    }

    public async clearLogs(scriptId: string): Promise<void> {
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

    public async getLogStats(scriptId: string): Promise<{
        totalEntries: number;
        errorCount: number;
        warningCount: number;
        lastEntry: Date;
        logSize: number;
    }> {
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
