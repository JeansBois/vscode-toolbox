import * as fs from 'fs';
import * as path from 'path';
import { PythonRuntime } from '../python-runtime/process';
import {
    InstallResult,
    DependencyConflictResult,
    DependencyConflict
} from './types';

interface InstalledDependency {
    package: string;
    version: string;
    scriptId: string;
}

export class DependencyManager {
    private readonly dependencyFile: string;
    private installedDependencies: Map<string, InstalledDependency>;

    constructor(
        private readonly pythonRuntime: PythonRuntime,
        storageDir: string
    ) {
        this.dependencyFile = path.join(storageDir, 'installed_dependencies.json');
        this.installedDependencies = new Map();
        this.loadInstalledDependencies();
    }

    private loadInstalledDependencies(): void {
        try {
            if (fs.existsSync(this.dependencyFile)) {
                const data = JSON.parse(fs.readFileSync(this.dependencyFile, 'utf-8'));
                this.installedDependencies = new Map(Object.entries(data));
            }
        } catch (error) {
            console.error('Erreur lors du chargement des dépendances:', error);
            this.installedDependencies = new Map();
        }
    }

    private saveInstalledDependencies(): void {
        try {
            const data = Object.fromEntries(this.installedDependencies);
            fs.writeFileSync(this.dependencyFile, JSON.stringify(data, null, 2));
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

    public async installDependencies(dependencies: string[], scriptId: string): Promise<InstallResult> {
        const installed: string[] = [];
        const errors: string[] = [];

        for (const dep of dependencies) {
            try {
                const result = await this.pythonRuntime.executeScript(
                    '-m',
                    ['pip', 'install', dep]
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
    }

    public checkDependencyConflicts(dependencies: string[], scriptId: string): DependencyConflictResult {
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

    public async uninstallDependencies(scriptId: string): Promise<string[]> {
        const toUninstall = Array.from(this.installedDependencies.values())
            .filter(dep => dep.scriptId === scriptId)
            .map(dep => dep.package);

        for (const pkg of toUninstall) {
            try {
                await this.pythonRuntime.executeScript(
                    '-m',
                    ['pip', 'uninstall', '-y', pkg]
                );
                this.installedDependencies.delete(pkg);
            } catch (error) {
                console.error(`Erreur lors de la désinstallation de ${pkg}:`, error);
            }
        }

        this.saveInstalledDependencies();
        return toUninstall;
    }

    public getDependenciesForScript(scriptId: string): InstalledDependency[] {
        return Array.from(this.installedDependencies.values())
            .filter(dep => dep.scriptId === scriptId);
    }
}
