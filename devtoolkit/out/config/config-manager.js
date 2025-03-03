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
exports.ConfigManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class ConfigManager {
    constructor(context) {
        this.configSection = 'devtoolkit';
        this.defaultConfig = {
            pythonPath: 'python',
            scriptsDirectory: path.join(context.extensionPath, 'scripts'),
            globalStorage: true,
            logging: {
                level: 'info',
                file: true,
                console: true,
                directory: path.join(context.extensionPath, 'logs')
            },
            templates: {
                directory: path.join(context.extensionPath, 'templates'),
                defaultTemplate: 'base.py',
                customTemplates: []
            },
            security: {
                allowedPaths: [context.extensionPath],
                blockedExtensions: ['.exe', '.dll', '.so']
            },
            workspace: {
                scriptDirectories: [],
                templateLocations: [],
                environmentVariables: {},
                pythonEnvironment: {
                    useVirtualEnv: false,
                    virtualEnvPath: '',
                    requirementsPath: ''
                }
            }
        };
    }
    static initialize(context) {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager(context);
        }
        return ConfigManager.instance;
    }
    static getInstance() {
        if (!ConfigManager.instance) {
            throw new Error('ConfigManager must be initialized before use');
        }
        return ConfigManager.instance;
    }
    getConfiguration() {
        const config = vscode.workspace.getConfiguration(this.configSection);
        return {
            pythonPath: config.get('pythonPath', this.defaultConfig.pythonPath),
            scriptsDirectory: config.get('scriptsDirectory', this.defaultConfig.scriptsDirectory),
            globalStorage: config.get('globalStorage', this.defaultConfig.globalStorage),
            logging: {
                level: config.get('logging.level', this.defaultConfig.logging.level),
                file: config.get('logging.file', this.defaultConfig.logging.file),
                console: config.get('logging.console', this.defaultConfig.logging.console),
                directory: config.get('logging.directory', this.defaultConfig.logging.directory)
            },
            templates: {
                directory: config.get('templates.directory', this.defaultConfig.templates.directory),
                defaultTemplate: config.get('templates.defaultTemplate', this.defaultConfig.templates.defaultTemplate),
                customTemplates: config.get('templates.customTemplates', this.defaultConfig.templates.customTemplates)
            },
            security: {
                allowedPaths: config.get('security.allowedPaths', this.defaultConfig.security.allowedPaths),
                blockedExtensions: config.get('security.blockedExtensions', this.defaultConfig.security.blockedExtensions)
            },
            workspace: {
                scriptDirectories: config.get('workspace.scriptDirectories', this.defaultConfig.workspace.scriptDirectories),
                templateLocations: config.get('workspace.templateLocations', this.defaultConfig.workspace.templateLocations),
                environmentVariables: config.get('workspace.environmentVariables', this.defaultConfig.workspace.environmentVariables),
                pythonEnvironment: {
                    useVirtualEnv: config.get('workspace.pythonEnvironment.useVirtualEnv', this.defaultConfig.workspace.pythonEnvironment.useVirtualEnv),
                    virtualEnvPath: config.get('workspace.pythonEnvironment.virtualEnvPath', this.defaultConfig.workspace.pythonEnvironment.virtualEnvPath),
                    requirementsPath: config.get('workspace.pythonEnvironment.requirementsPath', this.defaultConfig.workspace.pythonEnvironment.requirementsPath)
                }
            }
        };
    }
    async updateConfiguration(section, value, target = vscode.ConfigurationTarget.Global) {
        const config = vscode.workspace.getConfiguration(this.configSection);
        await config.update(section, value, target);
    }
    async resetConfiguration(target = vscode.ConfigurationTarget.Global) {
        const config = vscode.workspace.getConfiguration(this.configSection);
        for (const [key, value] of Object.entries(this.defaultConfig)) {
            await config.update(key, value, target);
        }
    }
    validateConfiguration() {
        const config = this.getConfiguration();
        const errors = [];
        // Validation du chemin Python
        if (!config.pythonPath) {
            errors.push('Le chemin Python ne peut pas être vide');
        }
        // Validation des répertoires
        if (!config.scriptsDirectory) {
            errors.push('Le répertoire des scripts ne peut pas être vide');
        }
        if (!config.templates.directory) {
            errors.push('Le répertoire des templates ne peut pas être vide');
        }
        // Validation du niveau de log
        const validLogLevels = ['debug', 'info', 'warn', 'error'];
        if (!validLogLevels.includes(config.logging.level)) {
            errors.push(`Niveau de log invalide. Valeurs autorisées: ${validLogLevels.join(', ')}`);
        }
        // Validation de la sécurité
        if (!Array.isArray(config.security.allowedPaths)) {
            errors.push('Les chemins autorisés doivent être un tableau');
        }
        if (!Array.isArray(config.security.blockedExtensions)) {
            errors.push('Les extensions bloquées doivent être un tableau');
        }
        return errors;
    }
    getWorkspaceConfig() {
        if (!vscode.workspace.workspaceFolders?.length) {
            return undefined;
        }
        return this.getConfiguration();
    }
    async migrateFromLegacy() {
        const legacyConfig = vscode.workspace.getConfiguration('python');
        const pythonPath = legacyConfig.get('defaultInterpreterPath');
        if (pythonPath) {
            await this.updateConfiguration('pythonPath', pythonPath);
        }
    }
}
exports.ConfigManager = ConfigManager;
async function testValidation() {
    const context = {
        extensionPath: '/test/path',
        storagePath: '/test/storage',
        globalStoragePath: '/test/global/storage',
    };
    ConfigManager.initialize(context);
    const configManager = ConfigManager.getInstance();
    const errors = configManager.validateConfiguration();
    console.log(errors);
}
testValidation();
//# sourceMappingURL=config-manager.js.map