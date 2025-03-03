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
exports.ScriptManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const process_1 = require("../python-runtime/process");
const config_manager_1 = require("../config/config-manager");
const validator_1 = require("./manifest/validator");
const dependency_manager_1 = require("./dependency-manager");
const validator_2 = require("./security/validator");
const permissions_1 = require("./security/permissions");
const resource_limits_1 = require("./security/resource-limits");
class ScriptManager {
    constructor(context) {
        this._configManager = config_manager_1.ConfigManager.getInstance();
        const config = this._configManager.getConfiguration();
        // Chemins principaux
        this._scriptsPath = config.scriptsDirectory;
        this._templatesPath = config.templates.directory;
        // Initialisation des composants
        this._manifestValidator = new validator_1.ManifestValidator();
        this._securityValidator = validator_2.SecurityValidator.getInstance();
        this._permissionManager = permissions_1.PermissionManager.getInstance();
        this._resourceManager = resource_limits_1.ResourceLimitsManager.getInstance();
        this._pythonRuntime = new process_1.PythonRuntime();
        // Configuration du gestionnaire de dépendances
        const dependenciesPath = config.globalStorage
            ? path.join(context.globalStorageUri.fsPath, 'dependencies')
            : path.join(this._scriptsPath, 'dependencies');
        this._dependencyManager = new dependency_manager_1.DependencyManager(this._pythonRuntime, dependenciesPath);
        // Écouter les changements de configuration
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('devtoolkit')) {
                this.updatePaths();
            }
        });
    }
    updatePaths() {
        const config = this._configManager.getConfiguration();
        this._scriptsPath = config.scriptsDirectory;
        this._templatesPath = config.templates.directory;
    }
    async listScripts() {
        try {
            const config = this._configManager.getConfiguration();
            const scriptPaths = [
                this._scriptsPath,
                ...config.workspace.scriptDirectories
            ];
            const scripts = [];
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
        }
        catch (error) {
            console.error('Erreur lors de la lecture des scripts:', error);
            return [];
        }
    }
    async getAvailableScripts() {
        try {
            const config = this._configManager.getConfiguration();
            const scriptPaths = [
                this._scriptsPath,
                ...config.workspace.scriptDirectories
            ];
            const manifests = [];
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
                                const manifest = JSON.parse(content);
                                // Valider le manifest avant de l'ajouter
                                const validation = await this.validateScript(scriptPath, manifest);
                                if (validation.isValid) {
                                    manifests.push(manifest);
                                }
                                else {
                                    console.warn(`Manifest invalide pour ${file}:`, validation.errors);
                                }
                            }
                            catch (error) {
                                console.error(`Erreur lors de la lecture du manifest ${file}:`, error);
                            }
                        }
                    }
                }
                catch (error) {
                    console.error(`Erreur lors de la lecture du répertoire ${scriptPath}:`, error);
                }
            }
            return manifests;
        }
        catch (error) {
            console.error('Erreur lors de la lecture des scripts:', error);
            return [];
        }
    }
    async getScriptContent(scriptId) {
        try {
            const manifest = await this.loadScriptManifest(scriptId);
            if (!manifest) {
                throw new Error(`Manifest non trouvé pour le script ${scriptId}`);
            }
            const scriptPath = path.join(this._scriptsPath, manifest.execution.entry_point);
            return await fs.promises.readFile(scriptPath, 'utf-8');
        }
        catch (error) {
            console.error(`Erreur lors de la lecture du script ${scriptId}:`, error);
            return undefined;
        }
    }
    async createFromTemplate(templateName, scriptInfo) {
        try {
            const config = config_manager_1.ConfigManager.getInstance().getConfiguration();
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
                throw new Error('Template manifest non trouvé dans les emplacements configurés');
            }
            const templateManifest = JSON.parse(await fs.promises.readFile(templateManifestPath, 'utf-8'));
            // Créer le nouveau manifest
            const newManifest = {
                ...templateManifest,
                script_info: {
                    ...templateManifest.script_info,
                    ...scriptInfo
                }
            };
            // Valider le nouveau manifest
            const validation = await this.validateScript(this._scriptsPath, newManifest);
            if (!validation.isValid) {
                throw new Error(`Manifest invalide: ${JSON.stringify(validation.errors)}`);
            }
            // Créer les fichiers
            const scriptPath = path.join(this._scriptsPath, newManifest.execution.entry_point);
            const manifestPath = path.join(this._scriptsPath, `${newManifest.script_info.id}_manifest.json`);
            // Copier le template Python
            const templatePath = path.join(this._templatesPath, templateName);
            const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
            await fs.promises.writeFile(scriptPath, templateContent);
            // Sauvegarder le manifest
            await fs.promises.writeFile(manifestPath, JSON.stringify(newManifest, null, 2));
            return true;
        }
        catch (error) {
            console.error('Erreur lors de la création du script:', error);
            return false;
        }
    }
    async deleteScript(scriptId) {
        try {
            const manifest = await this.loadScriptManifest(scriptId);
            if (!manifest) {
                throw new Error(`Manifest non trouvé pour le script ${scriptId}`);
            }
            // Supprimer les dépendances
            await this._dependencyManager.uninstallDependencies(scriptId);
            // Supprimer les fichiers
            const scriptPath = path.join(this._scriptsPath, manifest.execution.entry_point);
            const manifestPath = path.join(this._scriptsPath, `${scriptId}_manifest.json`);
            await fs.promises.unlink(scriptPath);
            await fs.promises.unlink(manifestPath);
            return true;
        }
        catch (error) {
            console.error(`Erreur lors de la suppression du script ${scriptId}:`, error);
            return false;
        }
    }
    async loadScriptManifest(scriptId) {
        try {
            const manifestPath = path.join(this._scriptsPath, `${scriptId}_manifest.json`);
            const content = await fs.promises.readFile(manifestPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            console.error(`Erreur lors du chargement du manifest ${scriptId}:`, error);
            return undefined;
        }
    }
    async validateScript(scriptPath, manifest) {
        // Valider le manifest
        const manifestValidation = await this._manifestValidator.validateManifest(manifest);
        if (!manifestValidation.isValid) {
            return manifestValidation;
        }
        // Valider la sécurité
        const securityValidation = await this._securityValidator.validateScript(scriptPath, manifest);
        if (!securityValidation.isValid) {
            return securityValidation;
        }
        // Valider les permissions
        await this._permissionManager.loadPermissionsFromManifest(manifest.script_info.id, manifest);
        const permissionValidation = this._permissionManager.validatePermissions(manifest.script_info.id, manifest.validation?.permissions || {});
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
        await this._resourceManager.loadLimitsFromManifest(manifest.script_info.id, manifest);
        const limitsValidation = this._resourceManager.validateLimits(manifest.execution.resource_limits || {});
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
                        message: 'Impossible de déterminer la version Python'
                    }]
            };
        }
        const isVersionValid = this._manifestValidator.validatePythonVersion(manifest.execution.python_version, pythonVersion);
        if (!isVersionValid) {
            return {
                isValid: false,
                errors: [{
                        field: 'python_version',
                        message: `Version Python incompatible. Requis: ${manifest.execution.python_version}, Installé: ${pythonVersion}`
                    }]
            };
        }
        return { isValid: true, errors: [] };
    }
    async prepareScriptEnvironment(scriptPath, manifest) {
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
            const conflicts = this._dependencyManager.checkDependencyConflicts(manifest.execution.dependencies, manifest.script_info.id);
            if (conflicts.hasConflicts) {
                return {
                    success: false,
                    installed: [],
                    errors: conflicts.conflicts.map((c) => `Conflit de dépendance: ${c.package} (requis: ${c.requiredVersion}, installé: ${c.conflictingVersion} pour ${c.conflictingScript})`)
                };
            }
            // Installer les dépendances
            const installResult = await this._dependencyManager.installDependencies(manifest.execution.dependencies, manifest.script_info.id);
            if (!installResult.success) {
                return installResult;
            }
            // Configurer les limites de ressources
            await this._resourceManager.loadLimitsFromManifest(manifest.script_info.id, manifest);
            // Configurer les permissions
            await this._permissionManager.loadPermissionsFromManifest(manifest.script_info.id, manifest);
            return installResult;
        }
        catch (error) {
            return {
                success: false,
                installed: [],
                errors: [`Erreur lors de la préparation de l'environnement: ${error}`]
            };
        }
    }
}
exports.ScriptManager = ScriptManager;
//# sourceMappingURL=manager.js.map