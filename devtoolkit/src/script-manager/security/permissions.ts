import * as path from 'path';
import { ScriptManifest } from '../types';

// Legacy permission interface for backward compatibility
export interface LegacyPermissionSet {
    allowedImports: string[];
    allowedPaths: string[];
    allowNetworking: boolean;
    allowFileSystem: boolean;
    allowSubprocess: boolean;
    allowEnvironmentAccess: boolean;
}

// Enhanced permission model with granular controls
export interface PermissionSet {
    allowedImports: string[];
    fileSystemPermissions: {
        read: string[];    // Paths allowed for reading
        write: string[];   // Paths allowed for writing
        delete: boolean;   // Allow file deletion operations
    };
    networkPermissions: {
        allowedHosts: string[];  // Domains/IPs allowed
        allowedPorts: number[];  // Ports allowed
        allowLocalhost: boolean; // Allow localhost connections
    };
    systemCallPermissions: {
        allowedCalls: string[];     // Specific system calls allowed
        allowSubprocesses: boolean; // Allow subprocess creation
    };
    allowEnvironmentAccess: boolean; // Access to environment variables
}

export class PermissionManager {
    private readonly defaultPermissions: PermissionSet;
    private readonly scriptPermissions: Map<string, PermissionSet>;
    private static instance: PermissionManager;

    private constructor() {
        this.defaultPermissions = {
            allowedImports: ['os', 'sys', 'typing', 'json', 'datetime'],
            fileSystemPermissions: {
                read: [],
                write: [],
                delete: false
            },
            networkPermissions: {
                allowedHosts: [],
                allowedPorts: [],
                allowLocalhost: false
            },
            systemCallPermissions: {
                allowedCalls: [],
                allowSubprocesses: false
            },
            allowEnvironmentAccess: false
        };
        this.scriptPermissions = new Map();
    }

    public static getInstance(): PermissionManager {
        if (!PermissionManager.instance) {
            PermissionManager.instance = new PermissionManager();
        }
        return PermissionManager.instance;
    }

    public setScriptPermissions(scriptId: string, permissions: Partial<PermissionSet>): void {
        const currentPermissions = this.getScriptPermissions(scriptId);
        this.scriptPermissions.set(scriptId, {
            ...currentPermissions,
            ...permissions
        });
    }

    public getScriptPermissions(scriptId: string): PermissionSet {
        return {
            ...this.defaultPermissions,
            ...this.scriptPermissions.get(scriptId)
        };
    }

    public removeScriptPermissions(scriptId: string): void {
        this.scriptPermissions.delete(scriptId);
    }

    public updateDefaultPermissions(permissions: Partial<PermissionSet>): void {
        Object.assign(this.defaultPermissions, permissions);
    }

    public checkPermission(
        scriptId: string,
        permission: string,
        value?: string
    ): boolean {
        const permissions = this.getScriptPermissions(scriptId);

        switch (permission) {
            case 'allowedImports':
                return value ? permissions.allowedImports.includes(value) : false;
            
            case 'fileSystemRead':
                if (!value) return false;
                return permissions.fileSystemPermissions.read.some(allowedPath => 
                    path.resolve(value).startsWith(path.resolve(allowedPath))
                );

            case 'fileSystemWrite':
                if (!value) return false;
                return permissions.fileSystemPermissions.write.some(allowedPath => 
                    path.resolve(value).startsWith(path.resolve(allowedPath))
                );
            
            case 'fileSystemDelete':
                return permissions.fileSystemPermissions.delete;
            
            case 'networkHost':
                return value ? permissions.networkPermissions.allowedHosts.includes(value) : false;
            
            case 'networkPort':
                return value ? permissions.networkPermissions.allowedPorts.includes(parseInt(value, 10)) : false;
            
            case 'networkLocalhost':
                return permissions.networkPermissions.allowLocalhost;
            
            case 'systemCall':
                return value ? permissions.systemCallPermissions.allowedCalls.includes(value) : false;
            
            case 'subprocess':
                return permissions.systemCallPermissions.allowSubprocesses;
            
            case 'environmentAccess':
                return permissions.allowEnvironmentAccess;
            
            // Legacy compatibility
            case 'allowedPaths':
                if (!value) return false;
                // Check both read and write paths for backward compatibility
                return [...permissions.fileSystemPermissions.read, ...permissions.fileSystemPermissions.write].some(
                    allowedPath => path.resolve(value).startsWith(path.resolve(allowedPath))
                );
            case 'allowNetworking':
                return permissions.networkPermissions.allowedHosts.length > 0 || 
                       permissions.networkPermissions.allowLocalhost;
            case 'allowFileSystem':
                return permissions.fileSystemPermissions.read.length > 0 || 
                       permissions.fileSystemPermissions.write.length > 0;
            case 'allowSubprocess':
                return permissions.systemCallPermissions.allowSubprocesses;
            
            default:
                return false;
        }
    }

    public async loadPermissionsFromManifest(
        scriptId: string,
        manifest: ScriptManifest
    ): Promise<void> {
        const permissions = manifest.validation?.permissions;
        if (!permissions) return;

        // Handle legacy format permissions
        if ('allowedPaths' in permissions || 'allowNetworking' in permissions || 'allowFileSystem' in permissions) {
            // Convert from legacy format to modern format
            const modernPermissions: Partial<PermissionSet> = {
                allowedImports: permissions.allowedImports || this.defaultPermissions.allowedImports,
                fileSystemPermissions: {
                    read: permissions.allowedPaths || [],
                    write: [], // By default, no write permissions
                    delete: false
                },
                networkPermissions: {
                    allowedHosts: permissions.allowNetworking ? ['*'] : [],
                    allowedPorts: permissions.allowNetworking ? [80, 443] : [],
                    allowLocalhost: permissions.allowNetworking || false
                },
                systemCallPermissions: {
                    allowedCalls: [],
                    allowSubprocesses: false // Always disabled by default
                },
                allowEnvironmentAccess: false // Always disabled by default
            };
            
            this.setScriptPermissions(scriptId, modernPermissions);
            return;
        }

        // Modern format
        const permissionSet: Partial<PermissionSet> = {
            allowedImports: permissions.allowedImports || this.defaultPermissions.allowedImports
        };

        // Add file system permissions if present
        if (permissions.fileSystemPermissions) {
            permissionSet.fileSystemPermissions = {
                ...this.defaultPermissions.fileSystemPermissions,
                ...permissions.fileSystemPermissions
            };
        }

        // Add network permissions if present
        if (permissions.networkPermissions) {
            permissionSet.networkPermissions = {
                ...this.defaultPermissions.networkPermissions,
                ...permissions.networkPermissions
            };
        }

        // Add system call permissions if present, but always disable subprocesses by default
        if (permissions.systemCallPermissions) {
            permissionSet.systemCallPermissions = {
                ...this.defaultPermissions.systemCallPermissions,
                ...permissions.systemCallPermissions,
                allowSubprocesses: false // Always disabled by default
            };
        }

        // Set environment access to false by default
        permissionSet.allowEnvironmentAccess = false;

        this.setScriptPermissions(scriptId, permissionSet);
    }

    /**
     * Grant temporary permission for a specific duration
     * @param scriptId The ID of the script
     * @param permissionType The type of permission to grant
     * @param value The value for the permission (path, host, etc.)
     * @param duration The duration in milliseconds for the permission
     */
    public grantTemporaryPermission(
        scriptId: string,
        permissionType: string,
        value: any,
        duration: number
    ): void {
        const currentPermissions = this.getScriptPermissions(scriptId);
        const tempPermissions = { ...currentPermissions };

        // Update the permissions based on the type
        switch (permissionType) {
            case 'fileSystemRead':
                if (typeof value === 'string' && !tempPermissions.fileSystemPermissions.read.includes(value)) {
                    tempPermissions.fileSystemPermissions.read = [
                        ...tempPermissions.fileSystemPermissions.read,
                        value
                    ];
                }
                break;
            case 'fileSystemWrite':
                if (typeof value === 'string' && !tempPermissions.fileSystemPermissions.write.includes(value)) {
                    tempPermissions.fileSystemPermissions.write = [
                        ...tempPermissions.fileSystemPermissions.write,
                        value
                    ];
                }
                break;
            case 'fileSystemDelete':
                if (typeof value === 'boolean') {
                    tempPermissions.fileSystemPermissions.delete = value;
                }
                break;
            case 'networkHost':
                if (typeof value === 'string' && !tempPermissions.networkPermissions.allowedHosts.includes(value)) {
                    tempPermissions.networkPermissions.allowedHosts = [
                        ...tempPermissions.networkPermissions.allowedHosts,
                        value
                    ];
                }
                break;
            case 'networkPort':
                if (typeof value === 'number' && !tempPermissions.networkPermissions.allowedPorts.includes(value)) {
                    tempPermissions.networkPermissions.allowedPorts = [
                        ...tempPermissions.networkPermissions.allowedPorts,
                        value
                    ];
                }
                break;
            case 'networkLocalhost':
                if (typeof value === 'boolean') {
                    tempPermissions.networkPermissions.allowLocalhost = value;
                }
                break;
            case 'systemCall':
                if (typeof value === 'string' && !tempPermissions.systemCallPermissions.allowedCalls.includes(value)) {
                    tempPermissions.systemCallPermissions.allowedCalls = [
                        ...tempPermissions.systemCallPermissions.allowedCalls,
                        value
                    ];
                }
                break;
            case 'subprocess':
                if (typeof value === 'boolean') {
                    tempPermissions.systemCallPermissions.allowSubprocesses = value;
                }
                break;
            case 'allowedImports':
                if (typeof value === 'string' && !tempPermissions.allowedImports.includes(value)) {
                    tempPermissions.allowedImports = [...tempPermissions.allowedImports, value];
                }
                break;
            case 'environmentAccess':
                if (typeof value === 'boolean') {
                    tempPermissions.allowEnvironmentAccess = value;
                }
                break;
        }

        this.scriptPermissions.set(scriptId, tempPermissions);

        setTimeout(() => {
            this.scriptPermissions.set(scriptId, currentPermissions);
        }, duration);
    }

    public validatePermissions(scriptId: string, requiredPermissions: Partial<PermissionSet>): {
        isValid: boolean;
        missingPermissions: string[];
    } {
        const currentPermissions = this.getScriptPermissions(scriptId);
        const missingPermissions: string[] = [];

        // Check required imports
        if (requiredPermissions.allowedImports) {
            for (const imp of requiredPermissions.allowedImports) {
                if (!currentPermissions.allowedImports.includes(imp)) {
                    missingPermissions.push(`Unauthorized import: ${imp}`);
                }
            }
        }

        // Check file system read permissions
        if (requiredPermissions.fileSystemPermissions?.read) {
            for (const p of requiredPermissions.fileSystemPermissions.read) {
                if (!this.checkPermission(scriptId, 'fileSystemRead', p)) {
                    missingPermissions.push(`Unauthorized read path: ${p}`);
                }
            }
        }

        // Check file system write permissions
        if (requiredPermissions.fileSystemPermissions?.write) {
            for (const p of requiredPermissions.fileSystemPermissions.write) {
                if (!this.checkPermission(scriptId, 'fileSystemWrite', p)) {
                    missingPermissions.push(`Unauthorized write path: ${p}`);
                }
            }
        }

        // Check file deletion permission
        if (requiredPermissions.fileSystemPermissions?.delete && 
            !currentPermissions.fileSystemPermissions.delete) {
            missingPermissions.push(`Missing permission: file deletion`);
        }

        // Check network host permissions
        if (requiredPermissions.networkPermissions?.allowedHosts) {
            for (const host of requiredPermissions.networkPermissions.allowedHosts) {
                if (!this.checkPermission(scriptId, 'networkHost', host)) {
                    missingPermissions.push(`Unauthorized network host: ${host}`);
                }
            }
        }

        // Check network port permissions
        if (requiredPermissions.networkPermissions?.allowedPorts) {
            for (const port of requiredPermissions.networkPermissions.allowedPorts) {
                if (!this.checkPermission(scriptId, 'networkPort', String(port))) {
                    missingPermissions.push(`Unauthorized network port: ${port}`);
                }
            }
        }

        // Check localhost network permission
        if (requiredPermissions.networkPermissions?.allowLocalhost && 
            !currentPermissions.networkPermissions.allowLocalhost) {
            missingPermissions.push(`Missing permission: localhost network access`);
        }

        // Check system call permissions
        if (requiredPermissions.systemCallPermissions?.allowedCalls) {
            for (const call of requiredPermissions.systemCallPermissions.allowedCalls) {
                if (!this.checkPermission(scriptId, 'systemCall', call)) {
                    missingPermissions.push(`Unauthorized system call: ${call}`);
                }
            }
        }

        // Check subprocess permission
        if (requiredPermissions.systemCallPermissions?.allowSubprocesses && 
            !currentPermissions.systemCallPermissions.allowSubprocesses) {
            missingPermissions.push(`Missing permission: subprocess creation`);
        }

        // Check environment access permission
        if (requiredPermissions.allowEnvironmentAccess && 
            !currentPermissions.allowEnvironmentAccess) {
            missingPermissions.push(`Missing permission: environment access`);
        }

        return {
            isValid: missingPermissions.length === 0,
            missingPermissions
        };
    }

    /**
     * Get the effective permissions and their sources (default vs script-defined)
     */
    public getEffectivePermissions(scriptId: string): {
        effective: PermissionSet;
        source: Record<string, 'default' | 'script'>;
    } {
        const scriptPerms = this.scriptPermissions.get(scriptId);
        const effective = this.getScriptPermissions(scriptId);
        
        // Initialize all sources as 'default'
        const source: Record<string, 'default' | 'script'> = {
            'allowedImports': 'default',
            'fileSystemPermissions': 'default',
            'networkPermissions': 'default',
            'systemCallPermissions': 'default',
            'allowEnvironmentAccess': 'default'
        };

        // Update source to 'script' for any permissions set by the script
        if (scriptPerms) {
            for (const [key, value] of Object.entries(scriptPerms)) {
                // Deep comparison for object properties
                if (JSON.stringify(value) !== JSON.stringify(this.defaultPermissions[key as keyof PermissionSet])) {
                    source[key] = 'script';
                }
            }
        }

        return { effective, source };
    }

    /**
     * Export permissions to a JSON string
     */
    public exportPermissions(scriptId: string): string {
        const permissions = this.getScriptPermissions(scriptId);
        return JSON.stringify(permissions, null, 2);
    }

    /**
     * Import permissions from a JSON string
     */
    public importPermissions(scriptId: string, permissionsJson: string): void {
        try {
            const permissions = JSON.parse(permissionsJson) as PermissionSet;
            this.setScriptPermissions(scriptId, permissions);
        } catch (error) {
            throw new Error(`Error importing permissions: ${error}`);
        }
    }

    /**
     * Requests user permission for a specific operation
     * @param scriptId The ID of the script
     * @param permissionType The type of permission requested
     * @param details Details about the requested permission
     * @returns Promise resolving to true if permission granted, false otherwise
     */
    public async requestPermission(
        scriptId: string, 
        permissionType: string, 
        details: any
    ): Promise<boolean> {
        // Create user-friendly message based on permission type
        let message = `Script is requesting ${permissionType} permission`;
        
        switch(permissionType) {
            case 'fileSystemRead':
                message = `Script is requesting read access to: ${details.path}`;
                break;
            case 'fileSystemWrite':
                message = `Script is requesting write access to: ${details.path}`;
                break;
            case 'fileSystemDelete':
                message = `Script is requesting permission to delete files`;
                break;
            case 'networkHost':
                message = `Script is requesting network access to: ${details.host}`;
                break;
            case 'systemCall':
                message = `Script is attempting to use system call: ${details.call}`;
                break;
            case 'subprocess':
                message = `Script is attempting to create a subprocess`;
                break;
            case 'import':
                message = `Script is attempting to import module: ${details.module}`;
                break;
        }
        
        // Use VS Code API to show permission request
        const vscode = require('vscode');
        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Allow',
            'Allow Temporarily',
            'Deny'
        );
        
        if (choice === 'Allow' || choice === 'Allow Temporarily') {
            const tempDuration = 60 * 60 * 1000; // 1 hour in milliseconds
            
            if (choice === 'Allow') {
                // Grant permanent permission
                this.grantTemporaryPermission(scriptId, permissionType, details, Number.MAX_SAFE_INTEGER);
            } else {
                // Grant temporary permission
                this.grantTemporaryPermission(scriptId, permissionType, details, tempDuration);
            }
            
            return true;
        }
        
        return false;
    }

    /**
     * Convert a PermissionSet to a security profile that can be used by the sandbox
     * @param scriptId The ID of the script
     * @returns A security profile object that can be passed to the sandbox
     */
    public getSecurityProfile(scriptId: string): any {
        const permissions = this.getScriptPermissions(scriptId);
        
        return {
            allowed_imports: permissions.allowedImports,
            filesystem: {
                read_paths: permissions.fileSystemPermissions.read,
                write_paths: permissions.fileSystemPermissions.write,
                allow_delete: permissions.fileSystemPermissions.delete
            },
            network: {
                allowed_hosts: permissions.networkPermissions.allowedHosts,
                allowed_ports: permissions.networkPermissions.allowedPorts,
                allow_localhost: permissions.networkPermissions.allowLocalhost
            },
            system: {
                allowed_calls: permissions.systemCallPermissions.allowedCalls,
                allow_subprocesses: permissions.systemCallPermissions.allowSubprocesses
            },
            environment: {
                allow_access: permissions.allowEnvironmentAccess
            }
        };
    }
}
