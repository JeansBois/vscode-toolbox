import * as path from 'path';
import * as fs from 'fs';

export enum ScriptStatus {
    Unknown = 'unknown',
    Idle = 'idle',
    Running = 'running',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled'
}

export interface ScriptInfo {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    category: string;
    tags?: string[];
    template?: string;
}

/**
 * Configuration d'exécution d'un script
 */
export interface ScriptExecution {
    entry_point: string;
    python_version: string;
    dependencies: string[];
    arguments?: ScriptArgument[];
    environment?: {
        [key: string]: string;
    };
    resource_limits?: {
        memory?: number;
        cpu?: number;
        duration?: number;
    };
}

/**
 * Argument d'un script
 */
export interface ScriptArgument {
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: any;
    validation?: {
        pattern?: string;
        min?: number;
        max?: number;
        enum?: string[];
    };
}

/**
 * Métadonnées d'un script
 */
export interface ScriptMetadata {
    created_at: string;
    updated_at: string;
    last_executed?: string;
    execution_count?: number;
}

/**
 * Résultat d'exécution d'un script
 */
export interface ExecutionResult {
    success: boolean;
    output?: string;
    error?: string;
    duration?: number;
    resourceUsage?: {
        peakMemory: number;
        averageCpu: number;
    };
}

/**
 * Progrès d'exécution d'un script
 */
export interface ExecutionProgress {
    scriptId: string;
    progress: number;
    status: string;
    output?: string;
    timestamp: number;
    resourceUsage?: {
        currentMemory: number;
        currentCpu: number;
    };
}

/**
 * Statistiques d'exécution d'un script
 */
export interface ExecutionStats {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    lastExecution?: string;
    resourceStats?: {
        averageMemory: number;
        peakMemory: number;
        averageCpu: number;
        peakCpu: number;
    };
}

/**
 * Manifeste complet d'un script
 */
export interface ScriptManifest {
    script_info: ScriptInfo;
    execution: ScriptExecution;
    validation?: {
        input_schema?: object;
        output_schema?: object;
        signature?: string;
        permissions?: {
            allowedImports?: string[];
            allowedPaths?: string[];
            allowNetworking?: boolean;
            allowFileSystem?: boolean;
        };
    };
    metadata?: ScriptMetadata;
}

/**
 * Erreur de validation
 */
export interface ValidationError {
    field: string;
    message: string;
}

/**
 * Résultat de validation
 */
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

/**
 * Résultat d'installation de dépendances
 */
export interface InstallResult {
    success: boolean;
    installed: string[];
    errors: string[];
}

/**
 * Conflit de dépendances
 */
export interface DependencyConflict {
    package: string;
    requiredVersion: string;
    conflictingVersion: string;
    conflictingScript: string;
}

/**
 * Résultat de vérification des conflits de dépendances
 */
export interface DependencyConflictResult {
    hasConflicts: boolean;
    conflicts: DependencyConflict[];
}

export class DependencyManager {
    constructor(
        private readonly pythonRuntime: any,
        private readonly dependenciesPath: string
    ) {}

    async installDependencies(dependencies: string[], scriptId: string): Promise<InstallResult> {
        // Utiliser pythonRuntime pour installer les dépendances dans le chemin spécifié
        const installPath = path.join(this.dependenciesPath, scriptId);
        console.log(`Installing dependencies in ${installPath}`);
        
        try {
            await this.pythonRuntime.executeCommand(['-m', 'pip', 'install', '--target', installPath, ...dependencies]);
            return {
                success: true,
                installed: dependencies,
                errors: []
            };
        } catch (error) {
            return {
                success: false,
                installed: [],
                errors: [`Failed to install dependencies: ${error}`]
            };
        }
    }

    async uninstallDependencies(scriptId: string): Promise<boolean> {
        const installPath = path.join(this.dependenciesPath, scriptId);
        console.log(`Removing dependencies from ${installPath}`);
        
        try {
            await fs.promises.rm(installPath, { recursive: true, force: true });
            return true;
        } catch (error) {
            console.error(`Failed to remove dependencies: ${error}`);
            return false;
        }
    }

    checkDependencyConflicts(scriptId: string): DependencyConflictResult {
        // Vérifier les conflits avec les dépendances existantes
        const conflicts: DependencyConflict[] = [];
        const scriptPath = path.join(this.dependenciesPath, scriptId);
        
        if (fs.existsSync(scriptPath)) {
            // Logique de vérification des conflits
            console.log(`Checking conflicts in ${scriptPath}`);
        }
        
        return {
            hasConflicts: conflicts.length > 0,
            conflicts
        };
    }
}

/**
 * Interface d'un script
 */
export interface ScriptInterface {
    inputs?: Array<{
        name: string;
        type: string;
        description: string;
        required: boolean;
    }>;
    outputs?: Array<{
        name: string;
        type: string;
        description: string;
    }>;
    file_list?: {
        required: boolean;
        filter: string[];
        description: string;
    };
}

/**
 * Résultat de validation des chemins
 */
export interface PathValidationResult {
    isValid: boolean;
    missingPaths: string[];
}
