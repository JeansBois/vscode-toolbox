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
exports.SecurityValidator = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SecurityValidator {
    constructor(config = {}) {
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
    static getInstance(config) {
        if (!SecurityValidator.instance) {
            SecurityValidator.instance = new SecurityValidator(config);
        }
        return SecurityValidator.instance;
    }
    async validateScript(scriptPath, manifest) {
        const errors = [];
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
        }
        catch (error) {
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
    async validateFileSize(scriptPath, errors) {
        const stats = await fs.promises.stat(scriptPath);
        if (stats.size > this.config.maxFileSize) {
            errors.push({
                field: 'file_size',
                message: `La taille du fichier dépasse la limite de ${this.config.maxFileSize} bytes`
            });
        }
    }
    validateImports(content, errors) {
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
    validateFileAccess(content, errors) {
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
    validateSystemCalls(content, errors) {
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
    validateResourceUsage(manifest, errors) {
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
    async validateSignature(scriptPath, signature, errors) {
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
        }
        catch (error) {
            errors.push({
                field: 'signature',
                message: `Erreur lors de la validation de la signature: ${error}`
            });
        }
    }
    isPathAllowed(filePath) {
        const absolutePath = path.resolve(filePath);
        return this.config.allowedPaths.some(allowedPath => absolutePath.startsWith(path.resolve(allowedPath)));
    }
    updateConfig(newConfig) {
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
    getConfig() {
        return { ...this.config };
    }
}
exports.SecurityValidator = SecurityValidator;
//# sourceMappingURL=validator.js.map