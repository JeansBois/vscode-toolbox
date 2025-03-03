import * as vscode from 'vscode';
import * as path from 'path';

export interface ExtensionConfig {
    pythonPath: string;
    scriptsDirectory: string;
    globalStorage: boolean;
    logging: {
        level: 'debug' | 'info' | 'warn' | 'error';
        file: boolean;
        console: boolean;
        directory: string;
    };
    templates: {
        directory: string;
        defaultTemplate: string;
        customTemplates: string[];
    };
    security: {
        allowedPaths: string[];
        blockedExtensions: string[];
    };
    workspace: {
        scriptDirectories: string[];
        templateLocations: string[];
        environmentVariables: Record<string, string>;
        pythonEnvironment: {
            useVirtualEnv: boolean;
            virtualEnvPath: string;
            requirementsPath: string;
        };
    };
}

type ConfigurationTarget = vscode.ConfigurationTarget.Global | vscode.ConfigurationTarget.Workspace;

export class ConfigManager { // Trigger re-compilation
    private static instance: ConfigManager;
    private readonly configSection = 'devtoolkit';
    private readonly defaultConfig: ExtensionConfig;

    private constructor(context: vscode.ExtensionContext) {
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

    public static initialize(context: vscode.ExtensionContext): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager(context);
        }
        return ConfigManager.instance;
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            throw new Error('ConfigManager must be initialized before use');
        }
        return ConfigManager.instance;
    }

    public getConfiguration(): ExtensionConfig {
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

    public async updateConfiguration(
        section: keyof ExtensionConfig | string,
        value: any,
        target: ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.configSection);
        await config.update(section, value, target);
    }

    public async resetConfiguration(target: ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.configSection);
        for (const [key, value] of Object.entries(this.defaultConfig)) {
            await config.update(key, value, target);
        }
    }

    public validateConfiguration(): string[] {
        const config = this.getConfiguration();
        const errors: string[] = [];

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

    public getWorkspaceConfig(): ExtensionConfig | undefined {
        if (!vscode.workspace.workspaceFolders?.length) {
            return undefined;
        }
        return this.getConfiguration();
    }

    public async migrateFromLegacy(): Promise<void> {
        const legacyConfig = vscode.workspace.getConfiguration('python');
        const pythonPath = legacyConfig.get<string>('defaultInterpreterPath');
        
        if (pythonPath) {
            await this.updateConfiguration('pythonPath', pythonPath);
        }
    }
}

async function testValidation() {
    const context = {
        extensionPath: '/test/path',
        storagePath: '/test/storage',
        globalStoragePath: '/test/global/storage',
    } as any;
    ConfigManager.initialize(context);
    const configManager = ConfigManager.getInstance();
    const errors = configManager.validateConfiguration();
    console.log(errors);
}

testValidation();
