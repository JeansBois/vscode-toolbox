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
 * Script execution configuration
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
 * Script argument
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
 * Script metadata
 */
export interface ScriptMetadata {
    created_at: string;
    updated_at: string;
    last_executed?: string;
    execution_count?: number;
}

/**
 * Script execution result
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
 * Script execution progress
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
 * Script execution statistics
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
 * Enhanced permission model
 * 
 * This interface defines the permission structure for scripts, allowing granular
 * control over what resources and operations a script can access.
 * 
 * Security implications:
 * - Controls script access to file system, network, and system resources
 * - Prevents unauthorized access to sensitive system functionality
 * - Enforces principle of least privilege for script execution
 */
export interface EnhancedPermissions {
    /** List of modules that the script is allowed to import */
    allowedImports?: string[];
    
    /** File system access permissions */
    fileSystemPermissions?: {
        /** Paths the script is allowed to read from */
        read?: string[];
        /** Paths the script is allowed to write to */
        write?: string[];
        /** Whether the script is allowed to delete files */
        delete?: boolean;
    };
    
    /** Network access permissions */
    networkPermissions?: {
        /** Hosts the script is allowed to connect to */
        allowedHosts?: string[];
        /** Ports the script is allowed to use */
        allowedPorts?: number[];
        /** Whether the script is allowed to connect to localhost */
        allowLocalhost?: boolean;
    };
    
    /** System call permissions */
    systemCallPermissions?: {
        /** System calls the script is allowed to make */
        allowedCalls?: string[];
        /** Whether the script is allowed to create subprocesses */
        allowSubprocesses?: boolean;
    };
    
    /** Whether the script is allowed to access environment variables */
    allowEnvironmentAccess?: boolean;
    
    // Legacy permissions (for backward compatibility)
    /** @deprecated Use fileSystemPermissions instead */
    allowedPaths?: string[];
    /** @deprecated Use networkPermissions instead */
    allowNetworking?: boolean;
    /** @deprecated Use fileSystemPermissions instead */
    allowFileSystem?: boolean;
}

/**
 * Complete script manifest
 */
export interface ScriptManifest {
    script_info: ScriptInfo;
    execution: ScriptExecution;
    validation?: {
        input_schema?: object;
        output_schema?: object;
        signature?: string;
        permissions?: EnhancedPermissions;
    };
    metadata?: ScriptMetadata;
}

/**
 * Validation error
 */
export interface ValidationError {
    field: string;
    message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    // warnings field removed as it's no longer used in the validation result
    dangerousOperations?: DangerousOperation[];
}

/**
 * Dangerous operation
 * 
 * This is a simplified version of the DangerousOperation interface in validator.ts
 * Just for use in validation results. The full version has more properties.
 */
export interface DangerousOperation {
    type: string;
    lineNumber: number;
    code: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    suggestedPermission?: string;
}

/**
 * Dependency installation result
 */
export interface InstallResult {
    success: boolean;
    installed: string[];
    errors: string[];
}

/**
 * Dependency conflict
 */
export interface DependencyConflict {
    package: string;
    requiredVersion: string;
    conflictingVersion: string;
    conflictingScript: string;
}

/**
 * Dependency conflict check result
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
        // Use pythonRuntime to install dependencies in the specified path
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
        // Check conflicts with existing dependencies
        const conflicts: DependencyConflict[] = [];
        const scriptPath = path.join(this.dependenciesPath, scriptId);
        
        if (fs.existsSync(scriptPath)) {
            // Conflict verification logic
            console.log(`Checking conflicts in ${scriptPath}`);
        }
        
        return {
            hasConflicts: conflicts.length > 0,
            conflicts
        };
    }
}

/**
 * Script interface
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
 * Path validation result
 */
export interface PathValidationResult {
    isValid: boolean;
    missingPaths: string[];
}
