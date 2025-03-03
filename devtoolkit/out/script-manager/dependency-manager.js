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
    constructor(pythonRuntime, storageDir) {
        this.pythonRuntime = pythonRuntime;
        this.dependencyFile = path.join(storageDir, 'installed_dependencies.json');
        this.installedDependencies = new Map();
        this.loadInstalledDependencies();
    }
    loadInstalledDependencies() {
        try {
            if (fs.existsSync(this.dependencyFile)) {
                const data = JSON.parse(fs.readFileSync(this.dependencyFile, 'utf-8'));
                this.installedDependencies = new Map(Object.entries(data));
            }
        }
        catch (error) {
            console.error('Erreur lors du chargement des dépendances:', error);
            this.installedDependencies = new Map();
        }
    }
    saveInstalledDependencies() {
        try {
            const data = Object.fromEntries(this.installedDependencies);
            fs.writeFileSync(this.dependencyFile, JSON.stringify(data, null, 2));
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
        const installed = [];
        const errors = [];
        for (const dep of dependencies) {
            try {
                const result = await this.pythonRuntime.executeScript('-m', ['pip', 'install', dep]);
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
    async uninstallDependencies(scriptId) {
        const toUninstall = Array.from(this.installedDependencies.values())
            .filter(dep => dep.scriptId === scriptId)
            .map(dep => dep.package);
        for (const pkg of toUninstall) {
            try {
                await this.pythonRuntime.executeScript('-m', ['pip', 'uninstall', '-y', pkg]);
                this.installedDependencies.delete(pkg);
            }
            catch (error) {
                console.error(`Erreur lors de la désinstallation de ${pkg}:`, error);
            }
        }
        this.saveInstalledDependencies();
        return toUninstall;
    }
    getDependenciesForScript(scriptId) {
        return Array.from(this.installedDependencies.values())
            .filter(dep => dep.scriptId === scriptId);
    }
}
exports.DependencyManager = DependencyManager;
//# sourceMappingURL=dependency-manager.js.map