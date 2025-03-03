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
exports.DependencyManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class DependencyManager {
    constructor(pythonRuntime, dependenciesPath) {
        this.pythonRuntime = pythonRuntime;
        this.dependenciesPath = dependenciesPath;
        this.installedDependencies = new Map();
        this.loadInstalledDependencies();
    }
    loadInstalledDependencies() {
        const dependencyFile = path.join(this.dependenciesPath, 'installed_dependencies.json');
        try {
            if (fs.existsSync(dependencyFile)) {
                const data = JSON.parse(fs.readFileSync(dependencyFile, 'utf-8'));
                this.installedDependencies.clear();
                for (const [key, value] of Object.entries(data)) {
                    this.installedDependencies.set(key, value);
                }
            }
        }
        catch (error) {
            console.error('Erreur lors du chargement des dépendances:', error);
            this.installedDependencies.clear();
        }
    }
    saveInstalledDependencies() {
        const dependencyFile = path.join(this.dependenciesPath, 'installed_dependencies.json');
        try {
            const data = Object.fromEntries(this.installedDependencies);
            fs.writeFileSync(dependencyFile, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('Erreur lors de la sauvegarde des dépendances:', error);
        }
    }
    async getInstalledVersion(packageName) {
        try {
            const result = await this.pythonRuntime.executeScript('-m', ['pip', 'show', packageName]);
            if (result.exitCode === 0) {
                const versionMatch = result.stdout.match(/Version:\s*([\d\.]+)/);
                return versionMatch ? versionMatch[1] : null;
            }
            return null;
        }
        catch (error) {
            console.error(`Erreur lors de la vérification de la version de ${packageName}:`, error);
            return null;
        }
    }
    async installDependencies(dependencies, scriptId) {
        const installPath = path.join(this.dependenciesPath, scriptId);
        console.log(`Installation des dépendances dans ${installPath}`);
        try {
            // Créer le répertoire d'installation si nécessaire
            await fs.promises.mkdir(installPath, { recursive: true });
            const installed = [];
            const errors = [];
            for (const dep of dependencies) {
                try {
                    const result = await this.pythonRuntime.executeScript('-m', ['pip', 'install', '--target', installPath, dep]);
                    if (result.exitCode === 0) {
                        const version = await this.getInstalledVersion(dep.split('==')[0]);
                        if (version) {
                            installed.push(dep);
                            this.installedDependencies.set(dep.split('==')[0], {
                                package: dep.split('==')[0],
                                version,
                                scriptId
                            });
                        }
                        else {
                            errors.push(`Impossible de vérifier la version de ${dep}`);
                        }
                    }
                    else {
                        errors.push(`Erreur lors de l'installation de ${dep}: ${result.stderr}`);
                    }
                }
                catch (error) {
                    errors.push(`Exception lors de l'installation de ${dep}: ${error}`);
                }
            }
            this.saveInstalledDependencies();
            return {
                success: errors.length === 0,
                installed,
                errors
            };
        }
        catch (error) {
            return {
                success: false,
                installed: [],
                errors: [`Erreur lors de l'installation des dépendances: ${error}`]
            };
        }
    }
    async uninstallDependencies(scriptId) {
        const installPath = path.join(this.dependenciesPath, scriptId);
        console.log(`Suppression des dépendances de ${installPath}`);
        try {
            // Supprimer les entrées de la map
            for (const [pkg, info] of this.installedDependencies.entries()) {
                if (info.scriptId === scriptId) {
                    this.installedDependencies.delete(pkg);
                }
            }
            // Supprimer le répertoire
            if (fs.existsSync(installPath)) {
                await fs.promises.rm(installPath, { recursive: true, force: true });
            }
            this.saveInstalledDependencies();
            return true;
        }
        catch (error) {
            console.error(`Erreur lors de la désinstallation des dépendances: ${error}`);
            return false;
        }
    }
    checkDependencyConflicts(dependencies, scriptId) {
        const conflicts = [];
        for (const dep of dependencies) {
            const [packageName, requiredVersion] = dep.split('==');
            const installed = this.installedDependencies.get(packageName);
            if (installed && installed.scriptId !== scriptId) {
                if (requiredVersion && installed.version !== requiredVersion) {
                    conflicts.push({
                        package: packageName,
                        requiredVersion: requiredVersion,
                        conflictingVersion: installed.version,
                        conflictingScript: installed.scriptId
                    });
                }
            }
        }
        return {
            hasConflicts: conflicts.length > 0,
            conflicts
        };
    }
    getDependenciesForScript(scriptId) {
        return Array.from(this.installedDependencies.values())
            .filter(dep => dep.scriptId === scriptId)
            .map(({ package: pkg, version }) => ({
            package: pkg,
            version
        }));
    }
    getAllDependencies() {
        return new Map(this.installedDependencies);
    }
}
exports.DependencyManager = DependencyManager;
//# sourceMappingURL=manager.js.map