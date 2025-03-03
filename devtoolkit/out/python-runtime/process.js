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
exports.PythonRuntime = exports.ScriptExecutor = exports.PythonEnvironmentManager = void 0;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const config_manager_1 = require("../config/config-manager");
// Gestionnaire d'environnement Python
class PythonEnvironmentManager {
    constructor() {
        this.configManager = config_manager_1.ConfigManager.getInstance();
    }
    static getInstance() {
        if (!PythonEnvironmentManager.instance) {
            PythonEnvironmentManager.instance = new PythonEnvironmentManager();
        }
        return PythonEnvironmentManager.instance;
    }
    async createVirtualEnv(name) {
        const storageUri = vscode.Uri.file(path.join(this.configManager.getConfiguration().scriptsDirectory, '../storage'));
        const venvPath = path.join(storageUri.fsPath, 'venvs', name);
        const executor = new ScriptExecutor();
        try {
            await executor.executeCommand(['-m', 'venv', venvPath]);
            return venvPath;
        }
        catch (error) {
            throw new Error(`Erreur lors de la création de l'environnement virtuel: ${error}`);
        }
    }
    async activateVirtualEnv(venvPath) {
        const activateScript = process.platform === 'win32'
            ? path.join(venvPath, 'Scripts', 'activate.bat')
            : path.join(venvPath, 'bin', 'activate');
        if (!await this.pathExists(activateScript)) {
            throw new Error(`Script d'activation non trouvé: ${activateScript}`);
        }
        process.env.VIRTUAL_ENV = venvPath;
        process.env.PATH = `${path.join(venvPath, 'bin')}${path.delimiter}${process.env.PATH}`;
    }
    async installPackage(name, version) {
        const executor = new ScriptExecutor();
        const packageSpec = version ? `${name}==${version}` : name;
        try {
            await executor.executeCommand(['-m', 'pip', 'install', packageSpec]);
        }
        catch (error) {
            throw new Error(`Erreur lors de l'installation du package ${packageSpec}: ${error}`);
        }
    }
    async uninstallPackage(name) {
        const executor = new ScriptExecutor();
        try {
            await executor.executeCommand(['-m', 'pip', 'uninstall', '-y', name]);
        }
        catch (error) {
            throw new Error(`Erreur lors de la désinstallation du package ${name}: ${error}`);
        }
    }
    async listPackages() {
        const executor = new ScriptExecutor();
        try {
            const result = await executor.executeCommand(['-m', 'pip', 'list', '--format=json']);
            return JSON.parse(result.stdout);
        }
        catch (error) {
            throw new Error(`Erreur lors de la liste des packages: ${error}`);
        }
    }
    async validateEnvironment() {
        try {
            const executor = new ScriptExecutor();
            const result = await executor.executeCommand(['-c', 'import sys; print("Python " + ".".join(map(str, sys.version_info[:3])))']);
            return result.exitCode === 0;
        }
        catch {
            return false;
        }
    }
    async checkDependencies(required) {
        const installed = await this.listPackages();
        const installedMap = new Map(installed.map(pkg => [pkg.name, pkg.version]));
        return required.every(req => {
            const [name, version] = req.split('==');
            const installedVersion = installedMap.get(name);
            return installedVersion && (!version || installedVersion === version);
        });
    }
    async pathExists(filePath) {
        try {
            const uri = vscode.Uri.file(filePath);
            const stat = await vscode.workspace.fs.stat(uri);
            return stat !== undefined;
        }
        catch {
            return false;
        }
    }
}
exports.PythonEnvironmentManager = PythonEnvironmentManager;
// Exécuteur de scripts Python
class ScriptExecutor {
    constructor(pythonPath) {
        this.pythonPath = pythonPath || config_manager_1.ConfigManager.getInstance().getConfiguration().pythonPath;
    }
    async executeScript(scriptPath, options = {}) {
        return this.execute([scriptPath, ...(options.args || [])], options);
    }
    async executeCommand(command, options = {}) {
        return this.execute(command, options);
    }
    async execute(args, options) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            const timeout = options.timeout || ScriptExecutor.DEFAULT_TIMEOUT;
            this.currentProcess = cp.spawn(this.pythonPath, args, {
                cwd: options.cwd,
                env: {
                    ...process.env,
                    ...options.env,
                    PYTHONUNBUFFERED: '1'
                }
            });
            this.currentProcess.stdout?.on('data', (data) => {
                const str = data.toString();
                stdout += str;
                options.onOutput?.(str);
            });
            this.currentProcess.stderr?.on('data', (data) => {
                const str = data.toString();
                stderr += str;
                options.onError?.(str);
            });
            const timer = setTimeout(() => {
                this.killProcess();
                resolve({
                    stdout,
                    stderr: `Processus interrompu après ${timeout}ms`,
                    exitCode: null,
                    duration: Date.now() - startTime
                });
            }, timeout);
            this.currentProcess.on('close', (code) => {
                clearTimeout(timer);
                const duration = Date.now() - startTime;
                resolve({
                    stdout,
                    stderr,
                    exitCode: code,
                    duration
                });
            });
            this.currentProcess.on('error', (error) => {
                clearTimeout(timer);
                const duration = Date.now() - startTime;
                resolve({
                    stdout,
                    stderr: error.message,
                    exitCode: null,
                    duration
                });
            });
        });
    }
    killProcess() {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = undefined;
        }
    }
    isRunning() {
        return this.currentProcess !== undefined && !this.currentProcess.killed;
    }
}
exports.ScriptExecutor = ScriptExecutor;
ScriptExecutor.DEFAULT_TIMEOUT = 30000;
// Classe principale du Runtime Python (maintient la rétrocompatibilité)
class PythonRuntime {
    constructor(pythonPath) {
        this.executor = new ScriptExecutor(pythonPath);
        this.envManager = PythonEnvironmentManager.getInstance();
    }
    async executeScript(scriptPath, args = [], options = {}) {
        return this.executor.executeScript(scriptPath, {
            ...options,
            args
        });
    }
    async validatePythonInstallation() {
        return this.envManager.validateEnvironment();
    }
    killProcess() {
        this.executor.killProcess();
    }
    async getPythonVersion() {
        try {
            const result = await this.executor.executeCommand(['--version'], {
                timeout: 5000
            });
            if (result.exitCode === 0) {
                return result.stdout.trim() || result.stderr.trim();
            }
            return undefined;
        }
        catch (error) {
            console.error('Erreur lors de la récupération de la version Python:', error);
            return undefined;
        }
    }
    static async findPythonPath() {
        const config = config_manager_1.ConfigManager.getInstance().getConfiguration();
        const configuredPath = config.pythonPath;
        try {
            const runtime = new PythonRuntime(configuredPath);
            const isValid = await runtime.validatePythonInstallation();
            if (isValid) {
                return configuredPath;
            }
        }
        catch (error) {
            console.error('Erreur avec le chemin Python configuré:', error);
        }
        const defaultPaths = process.platform === 'win32'
            ? ['python.exe', 'python3.exe', 'py.exe']
            : ['python3', 'python'];
        for (const pythonPath of defaultPaths) {
            try {
                const runtime = new PythonRuntime(pythonPath);
                const isValid = await runtime.validatePythonInstallation();
                if (isValid) {
                    await config_manager_1.ConfigManager.getInstance().updateConfiguration('pythonPath', pythonPath);
                    return pythonPath;
                }
            }
            catch (error) {
                continue;
            }
        }
        vscode.window.showErrorMessage('Aucun interpréteur Python valide trouvé. Veuillez configurer le chemin Python dans les paramètres.');
        return undefined;
    }
}
exports.PythonRuntime = PythonRuntime;
//# sourceMappingURL=process.js.map