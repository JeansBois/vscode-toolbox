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
exports.PermissionManager = void 0;
const path = __importStar(require("path"));
class PermissionManager {
    constructor() {
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
    static getInstance() {
        if (!PermissionManager.instance) {
            PermissionManager.instance = new PermissionManager();
        }
        return PermissionManager.instance;
    }
    setScriptPermissions(scriptId, permissions) {
        const currentPermissions = this.getScriptPermissions(scriptId);
        this.scriptPermissions.set(scriptId, {
            ...currentPermissions,
            ...permissions
        });
    }
    getScriptPermissions(scriptId) {
        return {
            ...this.defaultPermissions,
            ...this.scriptPermissions.get(scriptId)
        };
    }
    removeScriptPermissions(scriptId) {
        this.scriptPermissions.delete(scriptId);
    }
    updateDefaultPermissions(permissions) {
        Object.assign(this.defaultPermissions, permissions);
    }
    checkPermission(scriptId, permission, value) {
        const permissions = this.getScriptPermissions(scriptId);
        switch (permission) {
            case 'allowedImports':
                return value ? permissions.allowedImports.includes(value) : false;
            case 'allowedPaths':
                if (!value)
                    return false;
                return permissions.allowedPaths.some(allowedPath => path.resolve(value).startsWith(path.resolve(allowedPath)));
            default:
                return permissions[permission] || false;
        }
    }
    async loadPermissionsFromManifest(scriptId, manifest) {
        const permissions = manifest.validation?.permissions;
        if (!permissions)
            return;
        this.setScriptPermissions(scriptId, {
            allowedImports: permissions.allowedImports || this.defaultPermissions.allowedImports,
            allowedPaths: permissions.allowedPaths || this.defaultPermissions.allowedPaths,
            allowNetworking: permissions.allowNetworking || false,
            allowFileSystem: permissions.allowFileSystem || false,
            allowSubprocess: false, // Toujours désactivé par défaut
            allowEnvironmentAccess: false // Toujours désactivé par défaut
        });
    }
    grantTemporaryPermission(scriptId, permission, value, duration) {
        const currentPermissions = this.getScriptPermissions(scriptId);
        const tempPermissions = { ...currentPermissions };
        if (typeof value === 'boolean') {
            tempPermissions[permission] = value;
        }
        else if (permission === 'allowedImports' && !tempPermissions.allowedImports.includes(value)) {
            tempPermissions.allowedImports = [...tempPermissions.allowedImports, value];
        }
        else if (permission === 'allowedPaths' && !tempPermissions.allowedPaths.includes(value)) {
            tempPermissions.allowedPaths = [...tempPermissions.allowedPaths, value];
        }
        this.scriptPermissions.set(scriptId, tempPermissions);
        setTimeout(() => {
            this.scriptPermissions.set(scriptId, currentPermissions);
        }, duration);
    }
    validatePermissions(scriptId, requiredPermissions) {
        const currentPermissions = this.getScriptPermissions(scriptId);
        const missingPermissions = [];
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
        const booleanPermissions = [
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
    getEffectivePermissions(scriptId) {
        const scriptPerms = this.scriptPermissions.get(scriptId);
        const effective = this.getScriptPermissions(scriptId);
        const source = {
            allowedImports: 'default',
            allowedPaths: 'default',
            allowNetworking: 'default',
            allowFileSystem: 'default',
            allowSubprocess: 'default',
            allowEnvironmentAccess: 'default'
        };
        if (scriptPerms) {
            for (const [key, value] of Object.entries(scriptPerms)) {
                if (value !== this.defaultPermissions[key]) {
                    source[key] = 'script';
                }
            }
        }
        return { effective, source };
    }
    exportPermissions(scriptId) {
        const permissions = this.getScriptPermissions(scriptId);
        return JSON.stringify(permissions, null, 2);
    }
    importPermissions(scriptId, permissionsJson) {
        try {
            const permissions = JSON.parse(permissionsJson);
            this.setScriptPermissions(scriptId, permissions);
        }
        catch (error) {
            throw new Error(`Erreur lors de l'import des permissions: ${error}`);
        }
    }
}
exports.PermissionManager = PermissionManager;
//# sourceMappingURL=permissions.js.map