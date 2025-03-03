import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ScriptManifest, ValidationResult, ValidationError } from '../types';

interface SecurityConfig {
    allowedImports: string[];
    blockedImports: string[];
    maxFileSize: number;
    allowedPaths: string[];
    resourceLimits: {
        maxMemory: number;
        maxCpu: number;
        maxDuration: number;
    };
}

export class SecurityValidator {
    private readonly config: SecurityConfig;
    private static instance: SecurityValidator;

    private constructor(config: Partial<SecurityConfig> = {}) {
        this.config = {
            allowedImports: ['os', 'sys', 'typing', 'json', 'datetime', ...config.allowedImports || []],
            blockedImports: ['subprocess', 'socket', 'requests', ...config.blockedImports || []],
            maxFileSize: config.maxFileSize || 1024 * 1024, // 1MB par défaut
            allowedPaths: config.allowedPaths || [],
            resourceLimits: {
                maxMemory: config.resourceLimits?.maxMemory || 512, // MB
                maxCpu: config.resourceLimits?.maxCpu || 50, // %
                maxDuration: config.resourceLimits?.maxDuration || 300 // secondes
            }
        };
    }

    public static getInstance(config?: Partial<SecurityConfig>): SecurityValidator {
        if (!SecurityValidator.instance) {
            SecurityValidator.instance = new SecurityValidator(config);
        }
        return SecurityValidator.instance;
    }

    public async validateScript(
        scriptPath: string,
        manifest: ScriptManifest
    ): Promise<ValidationResult> {
        const errors: ValidationError[] = [];

        try {
            // Vérifier la taille du fichier
            await this.validateFileSize(scriptPath, errors);

            // Lire le contenu du script
            const content = await fs.promises.readFile(scriptPath, 'utf-8');

            // Vérifier les imports
            this.validateImports(content, errors);

            // Vérifier les accès fichiers
            this.validateFileAccess(content, errors);

            // Vérifier les appels système
            this.validateSystemCalls(content, errors);

            // Vérifier les ressources
            this.validateResourceUsage(manifest, errors);

            // Vérifier la signature si présente
            if (manifest.validation?.signature) {
                await this.validateSignature(scriptPath, manifest.validation.signature, errors);
            }

            return {
                isValid: errors.length === 0,
                errors
            };
        } catch (error) {
            errors.push({
                field: 'security',
                message: `Erreur lors de la validation de sécurité: ${error}`
            });

            return {
                isValid: false,
                errors
            };
        }
    }

    private async validateFileSize(scriptPath: string, errors: ValidationError[]): Promise<void> {
        const stats = await fs.promises.stat(scriptPath);
        if (stats.size > this.config.maxFileSize) {
            errors.push({
                field: 'file_size',
                message: `La taille du fichier dépasse la limite de ${this.config.maxFileSize} bytes`
            });
        }
    }

    private validateImports(content: string, errors: ValidationError[]): void {
        const importRegex = /^(?:from|import)\s+([a-zA-Z0-9_.]+)/gm;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            const importName = match[1].split('.')[0];

            if (this.config.blockedImports.includes(importName)) {
                errors.push({
                    field: 'imports',
                    message: `Import bloqué: ${importName}`
                });
            }

            if (!this.config.allowedImports.includes(importName)) {
                errors.push({
                    field: 'imports',
                    message: `Import non autorisé: ${importName}`
                });
            }
        }
    }

    private validateFileAccess(content: string, errors: ValidationError[]): void {
        const fileAccessPatterns = [
            /open\s*\(['"](.*?)['"]/g,
            /with\s+open\s*\(['"](.*?)['"]/g,
            /Path\s*\(['"](.*?)['"]/g
        ];

        for (const pattern of fileAccessPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const filePath = match[1];
                if (!this.isPathAllowed(filePath)) {
                    errors.push({
                        field: 'file_access',
                        message: `Accès fichier non autorisé: ${filePath}`
                    });
                }
            }
        }
    }

    private validateSystemCalls(content: string, errors: ValidationError[]): void {
        const dangerousPatterns = [
            /subprocess\./g,
            /os\.system\s*\(/g,
            /eval\s*\(/g,
            /exec\s*\(/g,
            /socket\./g
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(content)) {
                errors.push({
                    field: 'system_calls',
                    message: `Appel système dangereux détecté: ${pattern.source}`
                });
            }
        }
    }

    private validateResourceUsage(manifest: ScriptManifest, errors: ValidationError[]): void {
        const resourceLimits = manifest.execution.resource_limits || {};

        if (resourceLimits.memory && resourceLimits.memory > this.config.resourceLimits.maxMemory) {
            errors.push({
                field: 'resources',
                message: `Limite mémoire trop élevée: ${resourceLimits.memory}MB (max: ${this.config.resourceLimits.maxMemory}MB)`
            });
        }

        if (resourceLimits.cpu && resourceLimits.cpu > this.config.resourceLimits.maxCpu) {
            errors.push({
                field: 'resources',
                message: `Limite CPU trop élevée: ${resourceLimits.cpu}% (max: ${this.config.resourceLimits.maxCpu}%)`
            });
        }

        if (resourceLimits.duration && resourceLimits.duration > this.config.resourceLimits.maxDuration) {
            errors.push({
                field: 'resources',
                message: `Durée maximale trop élevée: ${resourceLimits.duration}s (max: ${this.config.resourceLimits.maxDuration}s)`
            });
        }
    }

    private async validateSignature(
        scriptPath: string,
        signature: string,
        errors: ValidationError[]
    ): Promise<void> {
        try {
            const content = await fs.promises.readFile(scriptPath);
            const hash = crypto
                .createHash('sha256')
                .update(content)
                .digest('hex');

            if (hash !== signature) {
                errors.push({
                    field: 'signature',
                    message: 'La signature du script est invalide'
                });
            }
        } catch (error) {
            errors.push({
                field: 'signature',
                message: `Erreur lors de la validation de la signature: ${error}`
            });
        }
    }

    private isPathAllowed(filePath: string): boolean {
        const absolutePath = path.resolve(filePath);
        return this.config.allowedPaths.some(allowedPath => 
            absolutePath.startsWith(path.resolve(allowedPath))
        );
    }

    public updateConfig(newConfig: Partial<SecurityConfig>): void {
        this.config.allowedImports = [
            ...new Set([...this.config.allowedImports, ...(newConfig.allowedImports || [])])
        ];
        this.config.blockedImports = [
            ...new Set([...this.config.blockedImports, ...(newConfig.blockedImports || [])])
        ];
        this.config.maxFileSize = newConfig.maxFileSize || this.config.maxFileSize;
        this.config.allowedPaths = [
            ...new Set([...this.config.allowedPaths, ...(newConfig.allowedPaths || [])])
        ];
        this.config.resourceLimits = {
            ...this.config.resourceLimits,
            ...newConfig.resourceLimits
        };
    }

    public getConfig(): SecurityConfig {
        return { ...this.config };
    }
}
