import * as fs from 'fs';
import * as path from 'path';
import { ScriptManifest, ValidationResult, ValidationError } from '../types';

export class ManifestValidator {
    private readonly requiredFields = {
        script_info: ['id', 'name', 'version', 'description', 'author', 'category'],
        execution: ['entry_point', 'python_version', 'dependencies']
    };

    public async validateManifest(manifest: ScriptManifest): Promise<ValidationResult> {
        const errors: ValidationError[] = [];

        // Valider les champs requis
        this.validateRequiredFields(manifest, errors);

        // Valider les formats
        this.validateFormats(manifest, errors);

        // Valider les chemins de fichiers
        await this.validatePaths(manifest, errors);

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    private validateRequiredFields(manifest: ScriptManifest, errors: ValidationError[]): void {
        // Valider script_info
        for (const field of this.requiredFields.script_info) {
            if (!manifest.script_info[field as keyof typeof manifest.script_info]) {
                errors.push({
                    field: `script_info.${field}`,
                    message: `Le champ ${field} est requis dans script_info`
                });
            }
        }

        // Valider execution
        for (const field of this.requiredFields.execution) {
            if (!manifest.execution[field as keyof typeof manifest.execution]) {
                errors.push({
                    field: `execution.${field}`,
                    message: `Le champ ${field} est requis dans execution`
                });
            }
        }
    }

    private validateFormats(manifest: ScriptManifest, errors: ValidationError[]): void {
        // Valider le format de version
        const versionRegex = /^\d+\.\d+\.\d+$/;
        if (!versionRegex.test(manifest.script_info.version)) {
            errors.push({
                field: 'script_info.version',
                message: 'La version doit suivre le format semver (x.y.z)'
            });
        }

        // Valider le format de la version Python
        const pythonVersionRegex = /^(>=|<=|==|~=)?\d+\.\d+(\.\d+)?$/;
        if (!pythonVersionRegex.test(manifest.execution.python_version)) {
            errors.push({
                field: 'execution.python_version',
                message: 'La version Python doit suivre un format valide (ex: >=3.6)'
            });
        }

        // Valider les arguments
        if (manifest.execution.arguments) {
            manifest.execution.arguments.forEach((arg, index) => {
                if (!arg.name || !arg.type || !arg.description) {
                    errors.push({
                        field: `execution.arguments[${index}]`,
                        message: 'Les arguments doivent avoir un nom, un type et une description'
                    });
                }
            });
        }

        // Valider les variables d'environnement
        if (manifest.execution.environment) {
            Object.entries(manifest.execution.environment).forEach(([key, value]) => {
                if (!key || !value) {
                    errors.push({
                        field: 'execution.environment',
                        message: 'Les variables d\'environnement doivent avoir une clé et une valeur'
                    });
                }
            });
        }
    }

    private async validatePaths(manifest: ScriptManifest, errors: ValidationError[]): Promise<void> {
        // Valider le point d'entrée
        const entryPoint = manifest.execution.entry_point;
        if (!await this.fileExists(entryPoint)) {
            errors.push({
                field: 'execution.entry_point',
                message: `Le fichier ${entryPoint} n'existe pas`
            });
        }

        // Valider les schémas de validation si présents
        if (manifest.validation?.input_schema) {
            try {
                this.validateJsonSchema(manifest.validation.input_schema);
            } catch (error) {
                errors.push({
                    field: 'validation.input_schema',
                    message: `Schéma d'entrée invalide: ${(error as Error).message}`
                });
            }
        }

        if (manifest.validation?.output_schema) {
            try {
                this.validateJsonSchema(manifest.validation.output_schema);
            } catch (error) {
                errors.push({
                    field: 'validation.output_schema',
                    message: `Schéma de sortie invalide: ${(error as Error).message}`
                });
            }
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    private validateJsonSchema(schema: object): void {
        // Validation basique de la structure du schéma JSON
        if (typeof schema !== 'object' || schema === null) {
            throw new Error('Le schéma doit être un objet');
        }
    }

    public validatePythonVersion(required: string, installed: string): boolean {
        const parseVersion = (version: string): number[] => {
            const match = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
            if (!match) {
                throw new Error(`Format de version invalide: ${version}`);
            }
            return [
                parseInt(match[1]),
                parseInt(match[2]),
                parseInt(match[3] || '0')
            ];
        };

        const [reqOp = '==', reqVer = required] = required.match(/^([>=<]=|~=)?(.+)/)?.slice(1) || [];
        const reqParts = parseVersion(reqVer);
        const instParts = parseVersion(installed);

        const compare = (a: number[], b: number[]): number => {
            for (let i = 0; i < 3; i++) {
                if (a[i] !== b[i]) {
                    return a[i] - b[i];
                }
            }
            return 0;
        };

        const result = compare(instParts, reqParts);

        switch (reqOp) {
            case '>=': return result >= 0;
            case '<=': return result <= 0;
            case '==': return result === 0;
            case '~=': // Compatible release operator
                return instParts[0] === reqParts[0] && 
                       instParts[1] >= reqParts[1];
            default:
                return result === 0;
        }
    }
}
