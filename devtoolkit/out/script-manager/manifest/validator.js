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
class ManifestValidator {
    constructor() {
        this.requiredFields = {
            script_info: ['id', 'name', 'version', 'description', 'author', 'category'],
            execution: ['entry_point', 'python_version', 'dependencies']
        };
    }
    async validateManifest(manifest) {
        const errors = [];
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
    validateRequiredFields(manifest, errors) {
        // Valider script_info
        for (const field of this.requiredFields.script_info) {
            if (!manifest.script_info[field]) {
                errors.push({
                    field: `script_info.${field}`,
                    message: `Le champ ${field} est requis dans script_info`
                });
            }
        }
        // Valider execution
        for (const field of this.requiredFields.execution) {
            if (!manifest.execution[field]) {
                errors.push({
                    field: `execution.${field}`,
                    message: `Le champ ${field} est requis dans execution`
                });
            }
        }
    }
    validateFormats(manifest, errors) {
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
    async validatePaths(manifest, errors) {
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
            }
            catch (error) {
                errors.push({
                    field: 'validation.input_schema',
                    message: `Schéma d'entrée invalide: ${error.message}`
                });
            }
        }
        if (manifest.validation?.output_schema) {
            try {
                this.validateJsonSchema(manifest.validation.output_schema);
            }
            catch (error) {
                errors.push({
                    field: 'validation.output_schema',
                    message: `Schéma de sortie invalide: ${error.message}`
                });
            }
        }
    }
    async fileExists(filePath) {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    validateJsonSchema(schema) {
        // Validation basique de la structure du schéma JSON
        if (typeof schema !== 'object' || schema === null) {
            throw new Error('Le schéma doit être un objet');
        }
    }
    validatePythonVersion(required, installed) {
        const parseVersion = (version) => {
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
        const compare = (a, b) => {
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
exports.ManifestValidator = ManifestValidator;
//# sourceMappingURL=validator.js.map