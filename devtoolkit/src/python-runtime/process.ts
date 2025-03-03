import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { ConfigManager } from '../config/config-manager';

// Interfaces pour la gestion de l'environnement Python
export interface Package {
    name: string;
    version: string;
    dependencies: string[];
}

export interface PythonEnvironment {
    pythonPath: string;
    version: string;
    packages: Package[];
    virtualEnv?: string;
}

// Options pour l'exécution des scripts
export interface ExecutionOptions {
    timeout?: number;
    env?: Record<string, string>;
    cwd?: string;
    args?: string[];
    onOutput?: (data: string) => void;
    onError?: (data: string) => void;
    onProgress?: (progress: number) => void;
}

// Résultat de l'exécution
export interface ExecutionResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    duration: number;
}

// Gestionnaire d'environnement Python
export class PythonEnvironmentManager {
    private static instance: PythonEnvironmentManager;
    private readonly configManager: ConfigManager;

    private constructor() {
        this.configManager = ConfigManager.getInstance();
    }

    public static getInstance(): PythonEnvironmentManager {
        if (!PythonEnvironmentManager.instance) {
            PythonEnvironmentManager.instance = new PythonEnvironmentManager();
        }
        return PythonEnvironmentManager.instance;
    }

    public async createVirtualEnv(name: string): Promise<string> {
        const storageUri = vscode.Uri.file(path.join(this.configManager.getConfiguration().scriptsDirectory, '../storage'));
        const venvPath = path.join(storageUri.fsPath, 'venvs', name);
        const executor = new ScriptExecutor();
        
        try {
            await executor.executeCommand(['-m', 'venv', venvPath]);
            return venvPath;
        } catch (error) {
            throw new Error(`Erreur lors de la création de l'environnement virtuel: ${error}`);
        }
    }

    public async activateVirtualEnv(venvPath: string): Promise<void> {
        const activateScript = process.platform === 'win32'
            ? path.join(venvPath, 'Scripts', 'activate.bat')
            : path.join(venvPath, 'bin', 'activate');

        if (!await this.pathExists(activateScript)) {
            throw new Error(`Script d'activation non trouvé: ${activateScript}`);
        }

        process.env.VIRTUAL_ENV = venvPath;
        process.env.PATH = `${path.join(venvPath, 'bin')}${path.delimiter}${process.env.PATH}`;
    }

    public async installPackage(name: string, version?: string): Promise<void> {
        const executor = new ScriptExecutor();
        const packageSpec = version ? `${name}==${version}` : name;
        
        try {
            await executor.executeCommand(['-m', 'pip', 'install', packageSpec]);
        } catch (error) {
            throw new Error(`Erreur lors de l'installation du package ${packageSpec}: ${error}`);
        }
    }

    public async uninstallPackage(name: string): Promise<void> {
        const executor = new ScriptExecutor();
        
        try {
            await executor.executeCommand(['-m', 'pip', 'uninstall', '-y', name]);
        } catch (error) {
            throw new Error(`Erreur lors de la désinstallation du package ${name}: ${error}`);
        }
    }

    public async listPackages(): Promise<Package[]> {
        const executor = new ScriptExecutor();
        
        try {
            const result = await executor.executeCommand(['-m', 'pip', 'list', '--format=json']);
            return JSON.parse(result.stdout);
        } catch (error) {
            throw new Error(`Erreur lors de la liste des packages: ${error}`);
        }
    }

    public async validateEnvironment(): Promise<boolean> {
        try {
            const executor = new ScriptExecutor();
            const result = await executor.executeCommand(['-c', 'import sys; print("Python " + ".".join(map(str, sys.version_info[:3])))']);
            return result.exitCode === 0;
        } catch {
            return false;
        }
    }

    public async checkDependencies(required: string[]): Promise<boolean> {
        const installed = await this.listPackages();
        const installedMap = new Map(installed.map(pkg => [pkg.name, pkg.version]));
        
        return required.every(req => {
            const [name, version] = req.split('==');
            const installedVersion = installedMap.get(name);
            return installedVersion && (!version || installedVersion === version);
        });
    }

    private async pathExists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            const stat = await vscode.workspace.fs.stat(uri);
            return stat !== undefined;
        } catch {
            return false;
        }
    }
}

// Exécuteur de scripts Python
export class ScriptExecutor {
    private static readonly DEFAULT_TIMEOUT = 30000;
    private currentProcess?: cp.ChildProcess;
    private readonly pythonPath: string;

    constructor(pythonPath?: string) {
        this.pythonPath = pythonPath || ConfigManager.getInstance().getConfiguration().pythonPath;
    }

    public async executeScript(
        scriptPath: string,
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        return this.execute([scriptPath, ...(options.args || [])], options);
    }

    public async executeCommand(
        command: string[],
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        return this.execute(command, options);
    }

    private async execute(
        args: string[],
        options: ExecutionOptions
    ): Promise<ExecutionResult> {
        return new Promise<ExecutionResult>((resolve) => {
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

            this.currentProcess.stdout?.on('data', (data: Buffer) => {
                const str = data.toString();
                stdout += str;
                options.onOutput?.(str);
            });

            this.currentProcess.stderr?.on('data', (data: Buffer) => {
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

            this.currentProcess.on('close', (code: number | null) => {
                clearTimeout(timer);
                const duration = Date.now() - startTime;
                
                resolve({
                    stdout,
                    stderr,
                    exitCode: code,
                    duration
                });
            });

            this.currentProcess.on('error', (error: Error) => {
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

    public killProcess(): void {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = undefined;
        }
    }

    public isRunning(): boolean {
        return this.currentProcess !== undefined && !this.currentProcess.killed;
    }
}

// Classe principale du Runtime Python (maintient la rétrocompatibilité)
export class PythonRuntime {
    private readonly executor: ScriptExecutor;
    private readonly envManager: PythonEnvironmentManager;

    constructor(pythonPath?: string) {
        this.executor = new ScriptExecutor(pythonPath);
        this.envManager = PythonEnvironmentManager.getInstance();
    }

    public async executeScript(
        scriptPath: string,
        args: string[] = [],
        options: ExecutionOptions = {}
    ): Promise<ExecutionResult> {
        return this.executor.executeScript(scriptPath, {
            ...options,
            args
        });
    }

    public async validatePythonInstallation(): Promise<boolean> {
        return this.envManager.validateEnvironment();
    }

    public killProcess(): void {
        this.executor.killProcess();
    }

    public async getPythonVersion(): Promise<string | undefined> {
        try {
            const result = await this.executor.executeCommand(['--version'], {
                timeout: 5000
            });
            
            if (result.exitCode === 0) {
                return result.stdout.trim() || result.stderr.trim();
            }
            return undefined;
        } catch (error) {
            console.error('Erreur lors de la récupération de la version Python:', error);
            return undefined;
        }
    }

    public static async findPythonPath(): Promise<string | undefined> {
        const config = ConfigManager.getInstance().getConfiguration();
        const configuredPath = config.pythonPath;
        
        try {
            const runtime = new PythonRuntime(configuredPath);
            const isValid = await runtime.validatePythonInstallation();
            if (isValid) {
                return configuredPath;
            }
        } catch (error) {
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
                    await ConfigManager.getInstance().updateConfiguration('pythonPath', pythonPath);
                    return pythonPath;
                }
            } catch (error) {
                continue;
            }
        }

        vscode.window.showErrorMessage('Aucun interpréteur Python valide trouvé. Veuillez configurer le chemin Python dans les paramètres.');
        return undefined;
    }
}
