import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PythonRuntime } from '../python-runtime/process';
import { ConfigManager } from '../config/config-manager';
import { ManifestValidator } from './manifest/validator';
import { DependencyManager } from './dependency-manager';
import { SecurityValidator } from './security/validator';
import { PermissionManager } from './security/permissions';
import { ResourceLimitsManager } from './security/resource-limits';
import { ResourceLimits } from './security/resource-limits';
import {
    ScriptManifest,
    ValidationResult,
    InstallResult,
    ScriptInfo,
    ScriptExecution,
} from './types';

/**
 * Type guard to validate if an object is a ScriptManifest
 */
function isScriptManifest(obj: unknown): obj is ScriptManifest {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    
    const candidate = obj as Partial<ScriptManifest>;
    
    // Check for script_info
    if (!candidate.script_info || typeof candidate.script_info !== 'object') {
        return false;
    }
    
    // Check for required script_info properties
    const scriptInfo = candidate.script_info as Partial<ScriptInfo>;
    if (typeof scriptInfo.id !== 'string' || 
        typeof scriptInfo.name !== 'string' || 
        typeof scriptInfo.version !== 'string' || 
        typeof scriptInfo.description !== 'string' || 
        typeof scriptInfo.author !== 'string' ||
        typeof scriptInfo.category !== 'string') {
        return false;
    }
    
    // Check for execution
    if (!candidate.execution || typeof candidate.execution !== 'object') {
        return false;
    }
    
    // Check for required execution properties
    const execution = candidate.execution as Partial<ScriptExecution>;
    if (typeof execution.entry_point !== 'string' || 
        typeof execution.python_version !== 'string' || 
        !Array.isArray(execution.dependencies)) {
        return false;
    }
    
    return true;
}

export class ScriptManager {
    private _scriptsPath: string;
    private _templatesPath: string;
    private readonly _manifestValidator: ManifestValidator;
    private readonly _securityValidator: SecurityValidator;
    private readonly _permissionManager: PermissionManager;
    private readonly _resourceManager: ResourceLimitsManager;
    private readonly _dependencyManager: DependencyManager;
    private readonly _pythonRuntime: PythonRuntime;
    private readonly _configManager: ConfigManager;

    constructor(context: vscode.ExtensionContext) {
        this._configManager = ConfigManager.getInstance();
        const config = this._configManager.getConfiguration();
        
        // Chemins principaux
        this._scriptsPath = config.scriptsDirectory;
        this._templatesPath = config.templates.directory;
        
        // Initialisation des composants
        this._manifestValidator = new ManifestValidator();
        this._securityValidator = SecurityValidator.getInstance();
        this._permissionManager = PermissionManager.getInstance();
        this._resourceManager = ResourceLimitsManager.getInstance();
        this._pythonRuntime = new PythonRuntime();
        
        // Configuration du gestionnaire de dépendances
        const dependenciesPath = config.globalStorage 
            ? path.join(context.globalStorageUri.fsPath, 'dependencies')
            : path.join(this._scriptsPath, 'dependencies');
            
        this._dependencyManager = new DependencyManager(
            this._pythonRuntime,
            dependenciesPath
        );

        // Écouter les changements de configuration
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('devtoolkit')) {
                this.updatePaths();
            }
        });
    }

    private updatePaths(): void {
        const config = this._configManager.getConfiguration();
        this._scriptsPath = config.scriptsDirectory;
        this._templatesPath = config.templates.directory;
    }

    public async listScripts(): Promise<string[]> {
        try {
            const config = this._configManager.getConfiguration();
            const scriptPaths = [
                this._scriptsPath,
                ...config.workspace.scriptDirectories
            ];
            
            const scripts: string[] = [];
            
            for (const scriptPath of scriptPaths) {
                if (!fs.existsSync(scriptPath)) {
                    continue;
                }
                
                const files = await fs.promises.readdir(scriptPath);
                for (const file of files) {
                    if (file.endsWith('.py') && !file.startsWith('_')) {
                        scripts.push(path.join(scriptPath, file));
                    }
                }
            }
            
            return scripts;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            console.error('Error reading scripts:', errorMessage);
            return [];
        }
    }

    public async getAvailableScripts(): Promise<ScriptManifest[]> {
        try {
            const config = this._configManager.getConfiguration();
            const scriptPaths = [
                this._scriptsPath,
                ...config.workspace.scriptDirectories
            ];
            
            const manifests: ScriptManifest[] = [];
            
            for (const scriptPath of scriptPaths) {
                if (!fs.existsSync(scriptPath)) {
                    continue;
                }
                
                try {
                    const files = await fs.promises.readdir(scriptPath);
                    for (const file of files) {
                        if (file.endsWith('_manifest.json')) {
                            try {
                                const manifestPath = path.join(scriptPath, file);
                                const content = await fs.promises.readFile(manifestPath, 'utf-8');
                                const parsed = JSON.parse(content);
                                
                                // Validate the parsed JSON is a valid manifest
                                if (!isScriptManifest(parsed)) {
                                    console.warn(`Invalid manifest format for ${file}`);
                                    continue;
                                }
                                
                                const manifest: ScriptManifest = parsed;
                                
                                // Valider le manifest avant de l'ajouter
                                const validation = await this.validateScript(scriptPath, manifest);
                                if (validation.isValid) {
                                    manifests.push(manifest);
                                } else {
                                    console.warn(`Invalid manifest for ${file}:`, validation.errors);
                                }
                            } catch (error: unknown) {
                                const errorMessage = error instanceof Error 
                                    ? error.message 
                                    : String(error);
                                console.error(`Error reading manifest ${file}:`, errorMessage);
                            }
                        }
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error 
                        ? error.message 
                        : String(error);
                    console.error(`Error reading directory ${scriptPath}:`, errorMessage);
                }
            }
            
            return manifests;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            console.error('Error reading scripts:', errorMessage);
            return [];
        }
    }

    public async getScriptContent(scriptId: string): Promise<string | undefined> {
        try {
            const manifest = await this.loadScriptManifest(scriptId);
            if (!manifest) {
                throw new Error(`Manifest not found for script ${scriptId}`);
            }

            const scriptPath = path.join(this._scriptsPath, manifest.execution.entry_point);
            return await fs.promises.readFile(scriptPath, 'utf-8');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            console.error(`Error reading script ${scriptId}:`, errorMessage);
            return undefined;
        }
    }

    public async createFromTemplate(
        templateName: string,
        scriptInfo: Partial<ScriptManifest['script_info']>
    ): Promise<boolean> {
        try {
            const config = ConfigManager.getInstance().getConfiguration();
            
            // Rechercher le template dans tous les emplacements configurés
            const templateLocations = [
                this._templatesPath,
                ...config.workspace.templateLocations
            ];
            
            let templateManifestPath = '';
            for (const location of templateLocations) {
                const testPath = path.join(location, 'script_manifest.json');
                if (fs.existsSync(testPath)) {
                    templateManifestPath = testPath;
                    break;
                }
            }
            
            if (!templateManifestPath) {
                throw new Error('Template manifest not found in configured locations');
            }
            
            const content = await fs.promises.readFile(templateManifestPath, 'utf-8');
            const parsed = JSON.parse(content);
            
            // Validate the parsed JSON is a valid manifest
            if (!isScriptManifest(parsed)) {
                throw new Error('Invalid template manifest format');
            }
            
            const templateManifest: ScriptManifest = parsed;

            // Créer le nouveau manifest
            const newManifest: ScriptManifest = {
                ...templateManifest,
                script_info: {
                    ...templateManifest.script_info,
                    ...scriptInfo
                }
            };

            // Valider le nouveau manifest
            const validation = await this.validateScript(this._scriptsPath, newManifest);
            if (!validation.isValid) {
                throw new Error(`Invalid manifest: ${JSON.stringify(validation.errors)}`);
            }

            // Créer les fichiers
            const scriptPath = path.join(this._scriptsPath, newManifest.execution.entry_point);
            const manifestPath = path.join(
                this._scriptsPath,
                `${newManifest.script_info.id}_manifest.json`
            );

            // Copier le template Python
            const templatePath = path.join(this._templatesPath, templateName);
            const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
            await fs.promises.writeFile(scriptPath, templateContent);

            // Sauvegarder le manifest
            await fs.promises.writeFile(
                manifestPath,
                JSON.stringify(newManifest, null, 2)
            );

            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            console.error('Error creating script:', errorMessage);
            return false;
        }
    }

    public async deleteScript(scriptId: string): Promise<boolean> {
        try {
            const manifest = await this.loadScriptManifest(scriptId);
            if (!manifest) {
                throw new Error(`Manifest not found for script ${scriptId}`);
            }

            // Supprimer les dépendances
            await this._dependencyManager.uninstallDependencies(scriptId);

            // Supprimer les fichiers
            const scriptPath = path.join(this._scriptsPath, manifest.execution.entry_point);
            const manifestPath = path.join(this._scriptsPath, `${scriptId}_manifest.json`);

            await fs.promises.unlink(scriptPath);
            await fs.promises.unlink(manifestPath);

            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            console.error(`Error deleting script ${scriptId}:`, errorMessage);
            return false;
        }
    }

    public async loadScriptManifest(scriptId: string): Promise<ScriptManifest | undefined> {
        try {
            const manifestPath = path.join(this._scriptsPath, `${scriptId}_manifest.json`);
            const content = await fs.promises.readFile(manifestPath, 'utf-8');
            const parsed = JSON.parse(content);
            
            // Validate the parsed JSON is a valid manifest
            if (!isScriptManifest(parsed)) {
                console.error(`Invalid manifest format for script ${scriptId}`);
                return undefined;
            }
            
            return parsed;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            console.error(`Error loading manifest ${scriptId}:`, errorMessage);
            return undefined;
        }
    }

    public async validateScript(
        scriptPath: string,
        manifest: ScriptManifest
    ): Promise<ValidationResult> {
        // Valider le manifest
        const manifestValidation = await this._manifestValidator.validateManifest(manifest);
        if (!manifestValidation.isValid) {
            return manifestValidation;
        }

        // Valider la sécurité
        const securityValidation = await this._securityValidator.validateScript(
            scriptPath,
            manifest
        );
        if (!securityValidation.isValid) {
            return securityValidation;
        }

        // Valider les permissions
        await this._permissionManager.loadPermissionsFromManifest(
            manifest.script_info.id,
            manifest
        );
        const permissionValidation = this._permissionManager.validatePermissions(
            manifest.script_info.id,
            manifest.validation?.permissions || {}
        );
        if (!permissionValidation.isValid) {
            return {
                isValid: false,
                errors: permissionValidation.missingPermissions.map(msg => ({
                    field: 'permissions',
                    message: msg
                }))
            };
        }

        // Valider les limites de ressources
        await this._resourceManager.loadLimitsFromManifest(
            manifest.script_info.id,
            manifest
        );
        const limitsValidation = this._resourceManager.validateLimits(
            manifest.execution.resource_limits as Partial<ResourceLimits> || {}
        );
        if (!limitsValidation.isValid) {
            return {
                isValid: false,
                errors: limitsValidation.errors.map(msg => ({
                    field: 'resource_limits',
                    message: msg
                }))
            };
        }

        // Valider la version Python
        const pythonVersion = await this._pythonRuntime.getPythonVersion();
        if (!pythonVersion) {
            return {
                isValid: false,
                errors: [{
                    field: 'python',
                    message: 'Unable to determine Python version'
                }]
            };
        }

        const isVersionValid = this._manifestValidator.validatePythonVersion(
            manifest.execution.python_version,
            pythonVersion
        );

        if (!isVersionValid) {
            return {
                isValid: false,
                errors: [{
                    field: 'python_version',
                    message: `Incompatible Python version. Required: ${manifest.execution.python_version}, Installed: ${pythonVersion}`
                }]
            };
        }

        return { isValid: true, errors: [] };
    }

    public async prepareScriptEnvironment(
        scriptPath: string,
        manifest: ScriptManifest
    ): Promise<InstallResult> {
        try {
            // Valider le script
            const validation = await this.validateScript(scriptPath, manifest);
            if (!validation.isValid) {
                return {
                    success: false,
                    installed: [],
                    errors: validation.errors.map(e => e.message)
                };
            }

            // Vérifier les conflits de dépendances
            const conflicts = this._dependencyManager.checkDependencyConflicts(
                manifest.execution.dependencies,
                manifest.script_info.id
            );

            if (conflicts.hasConflicts) {
                return {
                    success: false,
                    installed: [],
                    errors: conflicts.conflicts.map(
                        c => `Dependency conflict: ${c.package} (required: ${c.requiredVersion}, installed: ${c.conflictingVersion} for ${c.conflictingScript})`
                    )
                };
            }

            // Installer les dépendances
            const installResult = await this._dependencyManager.installDependencies(
                manifest.execution.dependencies,
                manifest.script_info.id
            );

            if (!installResult.success) {
                return installResult;
            }

            // Configurer les limites de ressources
            await this._resourceManager.loadLimitsFromManifest(
                manifest.script_info.id,
                manifest
            );

            // Configurer les permissions
            await this._permissionManager.loadPermissionsFromManifest(
                manifest.script_info.id,
                manifest
            );

            return installResult;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
                
            return {
                success: false,
                installed: [],
                errors: [`Error preparing environment: ${errorMessage}`]
            };
        }
    }
}
