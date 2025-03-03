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
exports.ManifestManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const validator_1 = require("./validator");
const events_1 = require("../core/events");
class ManifestManager {
    constructor() {
        this.validator = new validator_1.ManifestValidator();
        this.eventManager = events_1.ScriptEventManager.getInstance();
    }
    static getInstance() {
        if (!ManifestManager.instance) {
            ManifestManager.instance = new ManifestManager();
        }
        return ManifestManager.instance;
    }
    async loadManifest(manifestPath) {
        try {
            const content = await fs.promises.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(content);
            // Valider le manifest lors du chargement
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                throw new Error(`Manifest invalide: ${JSON.stringify(validation.errors)}`);
            }
            return manifest;
        }
        catch (error) {
            throw new Error(`Erreur lors du chargement du manifest: ${error}`);
        }
    }
    async saveManifest(manifest, manifestPath) {
        try {
            // Valider avant la sauvegarde
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                throw new Error(`Manifest invalide: ${JSON.stringify(validation.errors)}`);
            }
            // Mettre à jour les métadonnées
            const currentMetadata = manifest.metadata || {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            manifest.metadata = {
                ...currentMetadata,
                updated_at: new Date().toISOString()
            };
            await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
        }
        catch (error) {
            throw new Error(`Erreur lors de la sauvegarde du manifest: ${error}`);
        }
    }
    async validateManifest(manifest) {
        this.eventManager.notifyValidationStarted(manifest.script_info.id);
        try {
            const result = await this.validator.validateManifest(manifest);
            if (result.isValid) {
                this.eventManager.notifyValidationCompleted(manifest.script_info.id, true);
            }
            else {
                this.eventManager.notifyValidationCompleted(manifest.script_info.id, false, result.errors.map((error) => error.message));
            }
            return result;
        }
        catch (error) {
            this.eventManager.notifyValidationCompleted(manifest.script_info.id, false, [error.message]);
            throw error;
        }
    }
    async generateManifest(scriptPath, baseInfo) {
        try {
            const scriptContent = await fs.promises.readFile(scriptPath, 'utf-8');
            const manifest = await this.extractManifestInfo(scriptContent, baseInfo);
            // Valider le manifest généré
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                throw new Error(`Manifest généré invalide: ${JSON.stringify(validation.errors)}`);
            }
            return manifest;
        }
        catch (error) {
            throw new Error(`Erreur lors de la génération du manifest: ${error}`);
        }
    }
    async updateManifest(manifest, updates) {
        const updatedManifest = this.mergeManifests(manifest, updates);
        // Valider le manifest mis à jour
        const validation = await this.validateManifest(updatedManifest);
        if (!validation.isValid) {
            throw new Error(`Manifest mis à jour invalide: ${JSON.stringify(validation.errors)}`);
        }
        return updatedManifest;
    }
    async extractManifestInfo(scriptContent, baseInfo) {
        // Extraire les informations du script Python
        const pythonInfo = this.extractPythonInfo(scriptContent);
        // Créer le manifest de base
        const manifest = {
            script_info: {
                id: baseInfo.script_info?.id || this.generateScriptId(),
                name: baseInfo.script_info?.name || path.basename(scriptContent, '.py'),
                version: baseInfo.script_info?.version || '1.0.0',
                description: baseInfo.script_info?.description || '',
                author: baseInfo.script_info?.author || '',
                category: baseInfo.script_info?.category || 'general',
                tags: baseInfo.script_info?.tags || []
            },
            execution: {
                entry_point: baseInfo.execution?.entry_point || '',
                python_version: pythonInfo.pythonVersion || '>=3.6',
                dependencies: pythonInfo.dependencies || [],
                arguments: pythonInfo.arguments || [],
                environment: baseInfo.execution?.environment || {}
            },
            validation: baseInfo.validation || {
                input_schema: {},
                output_schema: {}
            },
            metadata: {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        };
        return manifest;
    }
    extractPythonInfo(scriptContent) {
        const dependencies = [];
        const scriptArguments = [];
        let pythonVersion;
        // Analyser les imports
        const importRegex = /^(?:from|import)\s+([a-zA-Z0-9_]+)/gm;
        let match;
        while ((match = importRegex.exec(scriptContent)) !== null) {
            if (!['os', 'sys', 'typing'].includes(match[1])) {
                dependencies.push(match[1]);
            }
        }
        // Analyser les docstrings pour les arguments
        const docstringRegex = /"""([\s\S]*?)"""/;
        const docMatch = docstringRegex.exec(scriptContent);
        if (docMatch) {
            const docstring = docMatch[1];
            const argRegex = /:param\s+(\w+):\s*\((\w+)\)\s*([^\n]+)/g;
            let argMatch;
            while ((argMatch = argRegex.exec(docstring)) !== null) {
                scriptArguments.push({
                    name: argMatch[1],
                    type: argMatch[2],
                    description: argMatch[3].trim(),
                    required: !docstring.includes(`(default: `) || !docstring.includes(`(optional)`),
                });
            }
        }
        return {
            pythonVersion,
            dependencies: [...new Set(dependencies)],
            arguments: scriptArguments
        };
    }
    generateScriptId() {
        return `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    mergeManifests(base, updates) {
        return {
            script_info: {
                ...base.script_info,
                ...updates.script_info
            },
            execution: {
                ...base.execution,
                ...updates.execution,
                dependencies: [
                    ...new Set([
                        ...(base.execution.dependencies || []),
                        ...(updates.execution?.dependencies || [])
                    ])
                ],
                arguments: [
                    ...(base.execution.arguments || []),
                    ...(updates.execution?.arguments || [])
                ].filter((arg, index, self) => index === self.findIndex(a => a.name === arg.name))
            },
            validation: {
                ...base.validation,
                ...updates.validation
            },
            metadata: {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_executed: undefined,
                execution_count: 0
            }
        };
    }
}
exports.ManifestManager = ManifestManager;
//# sourceMappingURL=manager.js.map