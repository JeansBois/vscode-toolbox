import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import {
    ScriptManifest,
    ValidationResult,
    ValidationError,
    ScriptInterface,
    PathValidationResult
} from './types';

export class ManifestValidator {
    private validateScriptInfo(manifest: ScriptManifest): ValidationError[] {
        const errors: ValidationError[] = [];
        const { script_info } = manifest;

        if (!script_info.id) {
            errors.push({ field: 'script_info.id', message: 'ID is required' });
        }
        if (!script_info.name) {
            errors.push({ field: 'script_info.name', message: 'Name is required' });
        }
        if (!script_info.version || !semver.valid(script_info.version)) {
            errors.push({ field: 'script_info.version', message: 'Valid version is required (semver format)' });
        }
        if (!script_info.description) {
            errors.push({ field: 'script_info.description', message: 'Description is required' });
        }
        if (!script_info.author) {
            errors.push({ field: 'script_info.author', message: 'Author is required' });
        }
        if (!script_info.category) {
            errors.push({ field: 'script_info.category', message: 'Category is required' });
        }

        return errors;
    }

    private validateExecution(manifest: ScriptManifest): ValidationError[] {
        const errors: ValidationError[] = [];
        const { execution } = manifest;

        if (!execution.python_version) {
            errors.push({ field: 'execution.python_version', message: 'Python version requirement is required' });
        }
        if (!execution.entry_point) {
            errors.push({ field: 'execution.entry_point', message: 'Entry point is required' });
        }
        if (!Array.isArray(execution.dependencies)) {
            errors.push({ field: 'execution.dependencies', message: 'Dependencies must be an array' });
        }
        if (execution.environment && typeof execution.environment !== 'object') {
            errors.push({ field: 'execution.environment', message: 'Environment must be an object' });
        }

        return errors;
    }

    private validateInterface(manifest: ScriptManifest & { interface?: ScriptInterface }): ValidationError[] {
        const errors: ValidationError[] = [];
        const iface = manifest.interface;

        if (!iface) {
            return errors;
        }

        if (iface.inputs && !Array.isArray(iface.inputs)) {
            errors.push({ field: 'interface.inputs', message: 'Inputs must be an array' });
        } else if (iface.inputs) {
            iface.inputs.forEach((input: { name?: string; type?: string; description?: string; required?: boolean }, index: number) => {
                if (!input.name) {
                    errors.push({ field: `interface.inputs[${index}].name`, message: 'Input name is required' });
                }
                if (!input.type) {
                    errors.push({ field: `interface.inputs[${index}].type`, message: 'Input type is required' });
                }
                if (!input.description) {
                    errors.push({ field: `interface.inputs[${index}].description`, message: 'Input description is required' });
                }
                if (typeof input.required !== 'boolean') {
                    errors.push({ field: `interface.inputs[${index}].required`, message: 'Input required must be a boolean' });
                }
            });
        }

        if (iface.outputs && !Array.isArray(iface.outputs)) {
            errors.push({ field: 'interface.outputs', message: 'Outputs must be an array' });
        } else if (iface.outputs) {
            iface.outputs.forEach((output: { name?: string; type?: string; description?: string }, index: number) => {
                if (!output.name) {
                    errors.push({ field: `interface.outputs[${index}].name`, message: 'Output name is required' });
                }
                if (!output.type) {
                    errors.push({ field: `interface.outputs[${index}].type`, message: 'Output type is required' });
                }
                if (!output.description) {
                    errors.push({ field: `interface.outputs[${index}].description`, message: 'Output description is required' });
                }
            });
        }

        if (iface.file_list) {
            if (typeof iface.file_list.required !== 'boolean') {
                errors.push({ field: 'interface.file_list.required', message: 'File list required must be a boolean' });
            }
            if (!Array.isArray(iface.file_list.filter)) {
                errors.push({ field: 'interface.file_list.filter', message: 'File list filter must be an array' });
            }
            if (!iface.file_list.description) {
                errors.push({ field: 'interface.file_list.description', message: 'File list description is required' });
            }
        }

        return errors;
    }

    public validateManifest(manifest: ScriptManifest & { interface?: ScriptInterface }): ValidationResult {
        const errors: ValidationError[] = [
            ...this.validateScriptInfo(manifest),
            ...this.validateExecution(manifest),
            ...this.validateInterface(manifest)
        ];

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    public validatePythonVersion(required: string, installed: string): boolean {
        // Nettoyer et vérifier les versions
        const cleanInstalled = installed.replace(/^Python\s+/, '');
        return semver.satisfies(
            semver.coerce(cleanInstalled)?.version || '',
            required.replace(/^[>=<~^]+/, '')
        );
    }

    public validateFilePaths(manifest: ScriptManifest, basePath: string): PathValidationResult {
        const missingPaths: string[] = [];
        const entryPoint = path.join(basePath, manifest.execution.entry_point);

        // Vérifier le point d'entrée
        if (!fs.existsSync(entryPoint)) {
            missingPaths.push(manifest.execution.entry_point);
        }

        // Vérifier les fichiers supplémentaires si spécifiés
        if ((manifest as any).interface?.file_list?.required) {
            const filter = (manifest as any).interface.file_list.filter;
            const files = fs.readdirSync(basePath);
            
            const matchingFiles = files.filter((file: string) => 
                filter.some((pattern: string) => 
                    pattern.startsWith('.') 
                        ? file.endsWith(pattern)
                        : file.includes(pattern)
                )
            );

            if (matchingFiles.length === 0) {
                missingPaths.push(`No files matching patterns: ${filter.join(', ')}`);
            }
        }

        return {
            isValid: missingPaths.length === 0,
            missingPaths
        };
    }
}
