import * as fs from 'fs';
import * as path from 'path';
import { ScriptManifest, ValidationResult, ValidationError } from '../types';
import { ManifestValidator } from './validator';
import { ScriptEventManager } from '../core/events';

export class ManifestManager {
    private readonly validator: ManifestValidator;
    private readonly eventManager: ScriptEventManager;
    private static instance: ManifestManager;

    private constructor() {
        this.validator = new ManifestValidator();
        this.eventManager = ScriptEventManager.getInstance();
    }

    public static getInstance(): ManifestManager {
        if (!ManifestManager.instance) {
            ManifestManager.instance = new ManifestManager();
        }
        return ManifestManager.instance;
    }

    public async loadManifest(manifestPath: string): Promise<ScriptManifest> {
        try {
            const content = await fs.promises.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(content) as ScriptManifest;
            
            // Valider le manifest lors du chargement
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                throw new Error(`Manifest invalide: ${JSON.stringify(validation.errors)}`);
            }
            
            return manifest;
        } catch (error) {
            throw new Error(`Erreur lors du chargement du manifest: ${error}`);
        }
    }

    public async saveManifest(manifest: ScriptManifest, manifestPath: string): Promise<void> {
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

            await fs.promises.writeFile(
                manifestPath,
                JSON.stringify(manifest, null, 2),
                'utf-8'
            );
        } catch (error) {
            throw new Error(`Erreur lors de la sauvegarde du manifest: ${error}`);
        }
    }

    public async validateManifest(manifest: ScriptManifest): Promise<ValidationResult> {
        this.eventManager.notifyValidationStarted(manifest.script_info.id);
        
        try {
            const result = await this.validator.validateManifest(manifest);
            
            if (result.isValid) {
                this.eventManager.notifyValidationCompleted(
                    manifest.script_info.id,
                    true
                );
            } else {
                this.eventManager.notifyValidationCompleted(
                    manifest.script_info.id,
                    false,
                    result.errors.map((error: ValidationError) => error.message)
                );
            }
            
            return result;
        } catch (error) {
            this.eventManager.notifyValidationCompleted(
                manifest.script_info.id,
                false,
                [(error as Error).message]
            );
            throw error;
        }
    }

    public async generateManifest(
        scriptPath: string,
        baseInfo: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
        try {
            const scriptContent = await fs.promises.readFile(scriptPath, 'utf-8');
            const manifest = await this.extractManifestInfo(scriptContent, baseInfo);
            
            // Valider le manifest généré
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                throw new Error(`Manifest généré invalide: ${JSON.stringify(validation.errors)}`);
            }
            
            return manifest;
        } catch (error) {
            throw new Error(`Erreur lors de la génération du manifest: ${error}`);
        }
    }

    public async updateManifest(
        manifest: ScriptManifest,
        updates: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
        const updatedManifest = this.mergeManifests(manifest, updates);
        
        // Valider le manifest mis à jour
        const validation = await this.validateManifest(updatedManifest);
        if (!validation.isValid) {
            throw new Error(`Manifest mis à jour invalide: ${JSON.stringify(validation.errors)}`);
        }
        
        return updatedManifest;
    }

    private async extractManifestInfo(
        scriptContent: string,
        baseInfo: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
        // Extraire les informations du script Python
        const pythonInfo = this.extractPythonInfo(scriptContent);
        
        // Créer le manifest de base
        const manifest: ScriptManifest = {
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

    private extractPythonInfo(scriptContent: string): {
        pythonVersion?: string;
        dependencies: string[];
        arguments: Array<{
            name: string;
            type: string;
            description: string;
            required: boolean;
            default?: any;
        }>;
    } {
        const dependencies: string[] = [];
        const scriptArguments: Array<{
            name: string;
            type: string;
            description: string;
            required: boolean;
            default?: any;
        }> = [];
        let pythonVersion: string | undefined;

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

    private generateScriptId(): string {
        return `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private mergeManifests(
        base: ScriptManifest,
        updates: Partial<ScriptManifest>
    ): ScriptManifest {
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
                ].filter((arg, index, self) => 
                    index === self.findIndex(a => a.name === arg.name)
                )
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
