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
exports.ManifestValidator = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
class ManifestValidator {
    validateScriptInfo(manifest) {
        const errors = [];
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
    validateExecution(manifest) {
        const errors = [];
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
    validateInterface(manifest) {
        const errors = [];
        const iface = manifest.interface;
        if (!iface) {
            return errors;
        }
        if (iface.inputs && !Array.isArray(iface.inputs)) {
            errors.push({ field: 'interface.inputs', message: 'Inputs must be an array' });
        }
        else if (iface.inputs) {
            iface.inputs.forEach((input, index) => {
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
        }
        else if (iface.outputs) {
            iface.outputs.forEach((output, index) => {
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
    validateManifest(manifest) {
        const errors = [
            ...this.validateScriptInfo(manifest),
            ...this.validateExecution(manifest),
            ...this.validateInterface(manifest)
        ];
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    validatePythonVersion(required, installed) {
        // Nettoyer et vérifier les versions
        const cleanInstalled = installed.replace(/^Python\s+/, '');
        return semver.satisfies(semver.coerce(cleanInstalled)?.version || '', required.replace(/^[>=<~^]+/, ''));
    }
    validateFilePaths(manifest, basePath) {
        const missingPaths = [];
        const entryPoint = path.join(basePath, manifest.execution.entry_point);
        // Vérifier le point d'entrée
        if (!fs.existsSync(entryPoint)) {
            missingPaths.push(manifest.execution.entry_point);
        }
        // Vérifier les fichiers supplémentaires si spécifiés
        if (manifest.interface?.file_list?.required) {
            const filter = manifest.interface.file_list.filter;
            const files = fs.readdirSync(basePath);
            const matchingFiles = files.filter((file) => filter.some((pattern) => pattern.startsWith('.')
                ? file.endsWith(pattern)
                : file.includes(pattern)));
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
exports.ManifestValidator = ManifestValidator;
//# sourceMappingURL=validator.js.map