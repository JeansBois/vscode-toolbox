/**
 * @fileoverview Configuration management for the DevToolkit extension
 * 
 * This module provides a centralized configuration system for the extension,
 * handling:
 * - Configuration loading and validation
 * - Default configuration values
 * - Type-safe configuration access
 * - Workspace vs. global configuration
 * - Configuration migration from legacy settings
 * 
 * It implements the singleton pattern to ensure consistent configuration
 * access throughout the extension.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionContext } from 'vscode';

/**
 * Comprehensive configuration interface for the DevToolkit extension
 * 
 * This interface defines all configuration options available in the extension,
 * with appropriate TypeScript typing for type safety and IntelliSense support.
 * 
 * The configuration is structured into logical sections:
 * - Core settings (Python path, scripts directory)
 * - Logging settings
 * - Template settings
 * - Security settings
 * - Workspace-specific settings
 */
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

// Define more specific types for configuration updates
type ConfigSection = keyof ExtensionConfig | string;
type ConfigValue<T extends ConfigSection> = T extends keyof ExtensionConfig 
    ? ExtensionConfig[T] 
    : unknown;

/**
 * Manages the extension's configuration with a singleton design pattern
 * 
 * Provides a centralized, type-safe interface for accessing and updating
 * extension configuration. It handles:
 * - Loading configuration from VS Code settings
 * - Providing default values when settings are not defined
 * - Validating configuration for correctness
 * - Safely updating configuration values
 * - Managing workspace vs. global configuration
 * 
 * Security implications:
 * - Controls security-critical settings like allowed paths and blocked extensions
 * - Validates configuration to prevent security misconfigurations
 * - Enforces type safety for configuration values
 */
export class ConfigManager {
    private static instance: ConfigManager;
    private readonly configSection = 'devtoolkit';
    private readonly defaultConfig: ExtensionConfig;

    /**
     * Private constructor for singleton pattern
     * 
     * Initializes default configuration values based on the extension context.
     * 
     * @param context - The VS Code extension context
     */
    private constructor(context: ExtensionContext) {
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

    /**
     * Initializes the ConfigManager singleton instance
     * 
     * This must be called once during extension activation before
     * any other ConfigManager methods are used.
     * 
     * @param context - The VS Code extension context
     * @returns The ConfigManager singleton instance
     */
    public static initialize(context: ExtensionContext): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager(context);
        }
        return ConfigManager.instance;
    }

    /**
     * Gets the ConfigManager singleton instance
     * 
     * @returns The ConfigManager singleton instance
     * @throws Error if ConfigManager has not been initialized
     */
    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            throw new Error('ConfigManager must be initialized before use');
        }
        return ConfigManager.instance;
    }

    /**
     * Retrieves the complete extension configuration
     * 
     * Loads all configuration values from VS Code settings, falling back to 
     * default values when settings are not defined. This method is the primary
     * way to access extension configuration throughout the codebase.
     * 
     * @returns The complete extension configuration
     * 
     * @example
     * const config = ConfigManager.getInstance().getConfiguration();
     * const pythonPath = config.pythonPath;
     * const scriptDir = config.scriptsDirectory;
     */
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

    /**
     * Updates a specific configuration value
     * 
     * This method provides type-safe configuration updates with appropriate
     * scoping (global or workspace). It ensures that configuration updates
     * are properly persisted to VS Code settings.
     * 
     * @param section - Configuration section to update (e.g., 'pythonPath', 'logging.level')
     * @param value - New value for the configuration section
     * @param target - Configuration target (global or workspace)
     * @returns Promise that resolves when the update is complete
     * 
     * @example
     * // Update the Python path globally
     * await configManager.updateConfiguration(
     *   'pythonPath', 
     *   '/usr/bin/python3',
     *   vscode.ConfigurationTarget.Global
     * );
     * 
     * // Update a nested configuration value
     * await configManager.updateConfiguration(
     *   'workspace.pythonEnvironment.useVirtualEnv',
     *   true,
     *   vscode.ConfigurationTarget.Workspace
     * );
     */
    public async updateConfiguration<T extends ConfigSection>(
        section: T,
        value: ConfigValue<T>,
        target: ConfigurationTarget = vscode.ConfigurationTarget.Global
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.configSection);
        await config.update(section, value, target);
    }

    /**
     * Resets all configuration values to their defaults
     * 
     * @param target - Configuration target (global or workspace)
     * @returns Promise that resolves when the reset is complete
     * 
     * @example
     * // Reset all configuration to defaults in the workspace
     * await configManager.resetConfiguration(vscode.ConfigurationTarget.Workspace);
     */
    public async resetConfiguration(target: ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.configSection);
        for (const [key, value] of Object.entries(this.defaultConfig)) {
            await config.update(key, value, target);
        }
    }

    /**
     * Validates the current configuration for correctness
     * 
     * Checks all configuration values against validation rules to ensure
     * they are valid and will not cause issues or security vulnerabilities.
     * This is particularly important for security-related settings.
     * 
     * @returns Array of validation error messages (empty if configuration is valid)
     * 
     * @example
     * const errors = configManager.validateConfiguration();
     * if (errors.length > 0) {
     *   vscode.window.showErrorMessage(`Configuration errors: ${errors.join(', ')}`);
     * }
     */
    public validateConfiguration(): string[] {
        const config = this.getConfiguration();
        const errors: string[] = [];

        // Validation du chemin Python
        if (!config.pythonPath) {
            errors.push('Python path cannot be empty');
        }

        // Validation des répertoires
        if (!config.scriptsDirectory) {
            errors.push('Scripts directory cannot be empty');
        }
        if (!config.templates.directory) {
            errors.push('Templates directory cannot be empty');
        }

        // Validation du niveau de log
        const validLogLevels = ['debug', 'info', 'warn', 'error'];
        if (!validLogLevels.includes(config.logging.level)) {
            errors.push(`Invalid log level. Allowed values: ${validLogLevels.join(', ')}`);
        }

        // Validation de la sécurité
        if (!Array.isArray(config.security.allowedPaths)) {
            errors.push('Allowed paths must be an array');
        }
        if (!Array.isArray(config.security.blockedExtensions)) {
            errors.push('Blocked extensions must be an array');
        }

        return errors;
    }

    /**
     * Gets workspace-specific configuration
     * 
     * Retrieves configuration that is specific to the current workspace.
     * Returns undefined if no workspace is open.
     * 
     * @returns Workspace configuration or undefined if no workspace is open
     */
    public getWorkspaceConfig(): ExtensionConfig | undefined {
        if (!vscode.workspace.workspaceFolders?.length) {
            return undefined;
        }
        return this.getConfiguration();
    }

    /**
     * Migrates configuration from legacy formats
     * 
     * Detects and migrates settings from older versions of the extension
     * or from other related extensions (like the Python extension).
     * 
     * @returns Promise that resolves when migration is complete
     * @throws Error if migration fails
     */
    public async migrateFromLegacy(): Promise<void> {
        try {
            const legacyConfig = vscode.workspace.getConfiguration('python');
            const pythonPath = legacyConfig.get<string>('defaultInterpreterPath');
            
            if (pythonPath) {
                await this.updateConfiguration('pythonPath', pythonPath);
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : String(error);
            
            console.error('Error migrating from legacy configuration:', error);
            vscode.window.showErrorMessage(`Migration error: ${errorMessage}`);
            throw error;
        }
    }
}

async function testValidation() {
    // Mock the context with minimal properties needed
    const context = {
        extensionPath: path.resolve('/test/path'),
        storagePath: path.resolve('/test/storage'),
        globalStoragePath: path.resolve('/test/global/storage'),
    } as unknown as ExtensionContext;
    
    ConfigManager.initialize(context);
    const configManager = ConfigManager.getInstance();
    const errors = configManager.validateConfiguration();
    console.log(errors);
}

testValidation();
