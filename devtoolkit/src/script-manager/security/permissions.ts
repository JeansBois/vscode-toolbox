import * as fs from 'fs';
import * as path from 'path';
import { ScriptManifest } from '../types';

export interface PermissionSet {
    allowedImports: string[];
    allowedPaths: string[];
    allowNetworking: boolean;
    allowFileSystem: boolean;
    allowSubprocess: boolean;
    allowEnvironmentAccess: boolean;
}

export class PermissionManager {
    private readonly defaultPermissions: PermissionSet;
    private readonly scriptPermissions: Map<string, PermissionSet>;
    private static instance: PermissionManager;

    private constructor() {
        this.defaultPermissions = {
            allowedImports: ['os', 'sys', 'typing', 'json', 'datetime'],
            allowedPaths: [],
            allowNetworking: false,
            allowFileSystem: false,
            allowSubprocess: false,
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
        permission: keyof PermissionSet,
        value?: string
    ): boolean {
        const permissions = this.getScriptPermissions(scriptId);

        switch (permission) {
            case 'allowedImports':
                return value ? permissions.allowedImports.includes(value) : false;
            case 'allowedPaths':
                if (!value) return false;
                return permissions.allowedPaths.some(allowedPath => 
                    path.resolve(value).startsWith(path.resolve(allowedPath))
                );
            default:
                return permissions[permission] || false;
        }
    }

    public async loadPermissionsFromManifest(
        scriptId: string,
        manifest: ScriptManifest
    ): Promise<void> {
        const permissions = manifest.validation?.permissions;
        if (!permissions) return;

        this.setScriptPermissions(scriptId, {
            allowedImports: permissions.allowedImports || this.defaultPermissions.allowedImports,
            allowedPaths: permissions.allowedPaths || this.defaultPermissions.allowedPaths,
            allowNetworking: permissions.allowNetworking || false,
            allowFileSystem: permissions.allowFileSystem || false,
            allowSubprocess: false, // Toujours désactivé par défaut
            allowEnvironmentAccess: false // Toujours désactivé par défaut
        });
    }

    public grantTemporaryPermission(
        scriptId: string,
        permission: keyof PermissionSet,
        value: boolean | string,
        duration: number
    ): void {
        const currentPermissions = this.getScriptPermissions(scriptId);
        const tempPermissions = { ...currentPermissions };

        if (typeof value === 'boolean') {
            (tempPermissions[permission] as boolean) = value;
        } else if (permission === 'allowedImports' && !tempPermissions.allowedImports.includes(value)) {
            tempPermissions.allowedImports = [...tempPermissions.allowedImports, value];
        } else if (permission === 'allowedPaths' && !tempPermissions.allowedPaths.includes(value)) {
            tempPermissions.allowedPaths = [...tempPermissions.allowedPaths, value];
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

        // Vérifier les imports requis
        if (requiredPermissions.allowedImports) {
            for (const imp of requiredPermissions.allowedImports) {
                if (!currentPermissions.allowedImports.includes(imp)) {
                    missingPermissions.push(`Import non autorisé: ${imp}`);
                }
            }
        }

        // Vérifier les chemins requis
        if (requiredPermissions.allowedPaths) {
            for (const p of requiredPermissions.allowedPaths) {
                if (!this.checkPermission(scriptId, 'allowedPaths', p)) {
                    missingPermissions.push(`Chemin non autorisé: ${p}`);
                }
            }
        }

        // Vérifier les autres permissions
        const booleanPermissions: (keyof PermissionSet)[] = [
            'allowNetworking',
            'allowFileSystem',
            'allowSubprocess',
            'allowEnvironmentAccess'
        ];

        for (const perm of booleanPermissions) {
            if (requiredPermissions[perm] && !currentPermissions[perm]) {
                missingPermissions.push(`Permission manquante: ${perm}`);
            }
        }

        return {
            isValid: missingPermissions.length === 0,
            missingPermissions
        };
    }

    public getEffectivePermissions(scriptId: string): {
        effective: PermissionSet;
        source: { [K in keyof PermissionSet]: 'default' | 'script' };
    } {
        const scriptPerms = this.scriptPermissions.get(scriptId);
        const effective = this.getScriptPermissions(scriptId);
        const source: { [K in keyof PermissionSet]: 'default' | 'script' } = {
            allowedImports: 'default',
            allowedPaths: 'default',
            allowNetworking: 'default',
            allowFileSystem: 'default',
            allowSubprocess: 'default',
            allowEnvironmentAccess: 'default'
        };

        if (scriptPerms) {
            for (const [key, value] of Object.entries(scriptPerms)) {
                if (value !== this.defaultPermissions[key as keyof PermissionSet]) {
                    source[key as keyof PermissionSet] = 'script';
                }
            }
        }

        return { effective, source };
    }

    public exportPermissions(scriptId: string): string {
        const permissions = this.getScriptPermissions(scriptId);
        return JSON.stringify(permissions, null, 2);
    }

    public importPermissions(scriptId: string, permissionsJson: string): void {
        try {
            const permissions = JSON.parse(permissionsJson) as PermissionSet;
            this.setScriptPermissions(scriptId, permissions);
        } catch (error) {
            throw new Error(`Erreur lors de l'import des permissions: ${error}`);
        }
    }
}
