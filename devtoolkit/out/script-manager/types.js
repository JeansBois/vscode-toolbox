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
exports.DependencyManager = exports.ScriptStatus = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
var ScriptStatus;
(function (ScriptStatus) {
    ScriptStatus["Unknown"] = "unknown";
    ScriptStatus["Idle"] = "idle";
    ScriptStatus["Running"] = "running";
    ScriptStatus["Completed"] = "completed";
    ScriptStatus["Failed"] = "failed";
    ScriptStatus["Cancelled"] = "cancelled";
})(ScriptStatus || (exports.ScriptStatus = ScriptStatus = {}));
class DependencyManager {
    constructor(pythonRuntime, dependenciesPath) {
        this.pythonRuntime = pythonRuntime;
        this.dependenciesPath = dependenciesPath;
    }
    async installDependencies(dependencies, scriptId) {
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
        }
        catch (error) {
            return {
                success: false,
                installed: [],
                errors: [`Failed to install dependencies: ${error}`]
            };
        }
    }
    async uninstallDependencies(scriptId) {
        const installPath = path.join(this.dependenciesPath, scriptId);
        console.log(`Removing dependencies from ${installPath}`);
        try {
            await fs.promises.rm(installPath, { recursive: true, force: true });
            return true;
        }
        catch (error) {
            console.error(`Failed to remove dependencies: ${error}`);
            return false;
        }
    }
    checkDependencyConflicts(scriptId) {
        // Vérifier les conflits avec les dépendances existantes
        const conflicts = [];
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
exports.DependencyManager = DependencyManager;
//# sourceMappingURL=types.js.map