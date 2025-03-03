import * as fs from 'fs';
import * as path from 'path';
import { PythonRuntime } from '../../python-runtime/process';
import {
    InstallResult,
    DependencyConflict,
    DependencyConflictResult
} from '../types';

export class DependencyManager {
    private readonly installedDependencies: Map<string, {
        package: string;
        version: string;
        scriptId: string;
    }>;

    constructor(
        private readonly pythonRuntime: PythonRuntime,
        private readonly dependenciesPath: string
    ) {
        this.installedDependencies = new Map();
        this.loadInstalledDependencies();
    }

    private loadInstalledDependencies(): void {
        const dependencyFile = path.join(this.dependenciesPath, 'installed_dependencies.json');
        try {
            if (fs.existsSync(dependencyFile)) {
                const data = JSON.parse(fs.readFileSync(dependencyFile, 'utf-8'));
                this.installedDependencies.clear();
                for (const [key, value] of Object.entries(data)) {
                    this.installedDependencies.set(key, value as { package: string; version: string; scriptId: string });
                }
            }
        } catch (error) {
            console.error('Erreur lors du chargement des dépendances:', error);
            this.installedDependencies.clear();
        }
    }

    private saveInstalledDependencies(): void {
        const dependencyFile = path.join(this.dependenciesPath, 'installed_dependencies.json');
        try {
            const data = Object.fromEntries(this.installedDependencies);
            fs.writeFileSync(dependencyFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des dépendances:', error);
        }
    }

    private async getInstalledVersion(packageName: string): Promise<string | null> {
        try {
            const result = await this.pythonRuntime.executeScript(
                '-m',
                ['pip', 'show', packageName]
            );

            if (result.exitCode === 0) {
                const versionMatch = result.stdout.match(/Version:\s*([\d\.]+)/);
                return versionMatch ? versionMatch[1] : null;
            }
            return null;
        } catch (error) {
            console.error(`Erreur lors de la vérification de la version de ${packageName}:`, error);
            return null;
        }
    }

    public async installDependencies(
        dependencies: string[],
        scriptId: string
    ): Promise<InstallResult> {
        const installPath = path.join(this.dependenciesPath, scriptId);
        console.log(`Installation des dépendances dans ${installPath}`);

        try {
            // Créer le répertoire d'installation si nécessaire
            await fs.promises.mkdir(installPath, { recursive: true });

            const installed: string[] = [];
            const errors: string[] = [];

            for (const dep of dependencies) {
                try {
                    const result = await this.pythonRuntime.executeScript(
                        '-m',
                        ['pip', 'install', '--target', installPath, dep]
                    );

                    if (result.exitCode === 0) {
                        const version = await this.getInstalledVersion(dep.split('==')[0]);
                        if (version) {
                            installed.push(dep);
                            this.installedDependencies.set(dep.split('==')[0], {
                                package: dep.split('==')[0],
                                version,
                                scriptId
                            });
                        } else {
                            errors.push(`Impossible de vérifier la version de ${dep}`);
                        }
                    } else {
                        errors.push(`Erreur lors de l'installation de ${dep}: ${result.stderr}`);
                    }
                } catch (error) {
                    errors.push(`Exception lors de l'installation de ${dep}: ${error}`);
                }
            }

            this.saveInstalledDependencies();

            return {
                success: errors.length === 0,
                installed,
                errors
            };
        } catch (error) {
            return {
                success: false,
                installed: [],
                errors: [`Erreur lors de l'installation des dépendances: ${error}`]
            };
        }
    }

    public async uninstallDependencies(scriptId: string): Promise<boolean> {
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
        } catch (error) {
            console.error(`Erreur lors de la désinstallation des dépendances: ${error}`);
            return false;
        }
    }

    public checkDependencyConflicts(
        dependencies: string[],
        scriptId: string
    ): DependencyConflictResult {
        const conflicts: DependencyConflict[] = [];

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

    public getDependenciesForScript(scriptId: string): {
        package: string;
        version: string;
    }[] {
        return Array.from(this.installedDependencies.values())
            .filter(dep => dep.scriptId === scriptId)
            .map(({ package: pkg, version }) => ({
                package: pkg,
                version
            }));
    }

    public getAllDependencies(): Map<string, {
        package: string;
        version: string;
        scriptId: string;
    }> {
        return new Map(this.installedDependencies);
    }
}
