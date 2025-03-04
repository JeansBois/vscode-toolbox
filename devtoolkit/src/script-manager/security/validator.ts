import * as crypto from 'crypto';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ScriptManifest, ValidationResult, ValidationError } from '../types';
import { PermissionManager, PermissionSet } from './permissions';

interface SecurityConfig {
    allowedImports: string[];
    blockedImports: string[];
    dangerousPatterns: RegExp[];
    maxFileSize: number;
    allowedPaths: string[];
    resourceLimits: {
        maxMemory: number;
        maxCpu: number;
        maxDuration: number;
    };
    // New options for enhanced security
    enforceStrictImports: boolean;     // Only allow explicitly permitted imports
    scanForVulnerabilities: boolean;   // Perform deep code scanning
    allowNetworkAccess: boolean;       // Allow network access by default
    allowFileSystemAccess: boolean;    // Allow file system access by default
    userPermissionPrompts: boolean;    // Show permission prompts to user
}

// Types of potentially dangerous operations that can be found in code
export enum DangerousOperationType {
    SUBPROCESS = 'subprocess',
    NETWORK = 'network',
    FILE_WRITE = 'file_write',
    FILE_READ = 'file_read',
    UNSAFE_IMPORT = 'unsafe_import',
    EVAL = 'eval',
    SYSTEM_CALL = 'system_call'
}

// Detailed information about a potentially dangerous operation
export interface DangerousOperation {
    type: DangerousOperationType;
    lineNumber: number;
    code: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    suggestedPermission?: keyof PermissionSet;
}

export class SecurityValidator {
    private readonly config: SecurityConfig;
    private static instance: SecurityValidator;
    private readonly permissionManager: PermissionManager;
    // Store warnings as a class property to avoid TS6133 error
    private securityWarnings: ValidationError[] = [];
    
    private constructor(config: Partial<SecurityConfig> = {}) {
        // Common built-in modules that are generally safe
        const safeBuiltins = [
            'os.path', 'sys', 'typing', 'json', 'datetime', 'math', 'random',
            'string', 're', 'collections', 'functools', 'itertools', 
            'abc', 'copy', 'enum', 'time', 'uuid', 'numbers'
        ];
        
        // Default dangerous patterns to detect
        const defaultDangerousPatterns = [
            /subprocess\./g,
            /os\.system\s*\(/g,
            /eval\s*\(/g,
            /exec\s*\(/g,
            /socket\./g,
            /requests\./g,
            /urllib/g,
            /open\s*\([^)]*['"]w['"]|['"]a['"]|['"]x['"]|['"]\+['"]/g, // Write/append file modes
            /__import__\s*\(/g,
            /globals\(\)\[/g,
            /getattr\s*\([^)]*["']__/g, // Accessing dunder methods via getattr
            /setattr\s*\([^)]*["']__/g  // Setting dunder attributes
        ];
        
        this.config = {
            allowedImports: [...safeBuiltins, ...(config.allowedImports || [])],
            blockedImports: [
                'subprocess', 'socket', 'requests', 'urllib', 'urllib2', 'http.client', 
                'ftplib', 'telnetlib', 'smtplib', 'poplib', 'imaplib', 'nntplib',
                'pty', 'platform', 'pdb', 'getpass', ...(config.blockedImports || [])
            ],
            dangerousPatterns: config.dangerousPatterns || defaultDangerousPatterns,
            maxFileSize: config.maxFileSize || 1024 * 1024, // 1MB default
            allowedPaths: config.allowedPaths || [],
            resourceLimits: {
                maxMemory: config.resourceLimits?.maxMemory || 512, // MB
                maxCpu: config.resourceLimits?.maxCpu || 50, // %
                maxDuration: config.resourceLimits?.maxDuration || 300 // seconds
            },
            enforceStrictImports: config.enforceStrictImports !== undefined ? config.enforceStrictImports : true,
            scanForVulnerabilities: config.scanForVulnerabilities !== undefined ? config.scanForVulnerabilities : true,
            allowNetworkAccess: config.allowNetworkAccess !== undefined ? config.allowNetworkAccess : false,
            allowFileSystemAccess: config.allowFileSystemAccess !== undefined ? config.allowFileSystemAccess : false,
            userPermissionPrompts: config.userPermissionPrompts !== undefined ? config.userPermissionPrompts : true
        };
        
        this.permissionManager = PermissionManager.getInstance();
    }

    public static getInstance(config?: Partial<SecurityConfig>): SecurityValidator {
        if (!SecurityValidator.instance) {
            SecurityValidator.instance = new SecurityValidator(config);
        }
        return SecurityValidator.instance;
    }

    public async validateScript(
        scriptPath: string,
        manifest: ScriptManifest,
        scriptId: string
    ): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        // Reset warnings before starting validation
        this.securityWarnings = [];
        const dangerousOperations: DangerousOperation[] = [];
        
        // Tracks if we use the warnings for user prompts
        let warningsUsed = false;

        try {
            // Check file size
            await this.validateFileSize(scriptPath, errors);

            // Read script content
            const content = await fs.promises.readFile(scriptPath, 'utf-8');

            // Basic validation checks
            this.validateImports(content, errors, dangerousOperations);
            this.validateFileAccess(content, errors, dangerousOperations);
            this.validateSystemCalls(content, errors, dangerousOperations);
            this.validateNetworkAccess(content, errors, dangerousOperations);
            this.validateResourceUsage(manifest, errors);

            // Check signature if present
            if (manifest.validation?.signature) {
                await this.validateSignature(scriptPath, manifest.validation.signature, errors);
            }

            // Advanced security analysis if enabled
            if (this.config.scanForVulnerabilities) {
                await this.performAdvancedScanForVulnerabilities(content, errors, dangerousOperations);
            }

            // Show warnings to user if configured
            if (this.config.userPermissionPrompts && this.securityWarnings.length > 0) {
                await this.showUserWarnings(scriptId, dangerousOperations);
                warningsUsed = true;
            }
            
            // Force TypeScript to recognize that warnings are used
            if (!warningsUsed && this.securityWarnings.length > 0) {
                console.debug(`${this.securityWarnings.length} warnings were collected but not shown to user`);
            }

            // Update permissions based on detected operations if user allowed them
            if (dangerousOperations.length > 0) {
                this.updateRequiredPermissions(scriptId, dangerousOperations);
            }

        // Return validation result with additional details
        const validationResult: ValidationResult = {
            isValid: errors.length === 0,
            errors
        };
        
        // Only include dangerous operations if they exist
        // We don't include warnings in the result anymore as per the updated ValidationResult interface
        
        if (dangerousOperations.length > 0) {
            validationResult.dangerousOperations = dangerousOperations;
        }
        
        return validationResult;
        } catch (error) {
            errors.push({
                field: 'security',
                message: `Error during security validation: ${error}`
            });

            return {
                isValid: false,
                errors
            };
        }
    }

    private async validateFileSize(scriptPath: string, errors: ValidationError[]): Promise<void> {
        const stats = await fs.promises.stat(scriptPath);
        if (stats.size > this.config.maxFileSize) {
            errors.push({
                field: 'file_size',
                message: `File size exceeds the limit of ${this.config.maxFileSize} bytes`
            });
        }
    }

    private validateImports(
        content: string, 
        _errors: ValidationError[],
        dangerousOperations: DangerousOperation[] = []
    ): void {
        // Match both import and from...import statements
        const importRegex = /^(?:from|import)\s+([a-zA-Z0-9_.]+)(?:\s+import\s+)?/gm;
        let match;
        const detectedImports = new Set<string>();

        // Find all imports in the file
        while ((match = importRegex.exec(content)) !== null) {
            const importName = match[1].split('.')[0];
            const lineNumber = this.getLineNumber(content, match.index);
            detectedImports.add(importName);

            // Check against blocked imports (high security risk)
            if (this.config.blockedImports.includes(importName)) {
                _errors.push({
                    field: 'imports',
                    message: `Blocked import at line ${lineNumber}: ${importName}`
                });
                
                dangerousOperations.push({
                    type: DangerousOperationType.UNSAFE_IMPORT,
                    lineNumber,
                    code: match[0],
                    description: `Import of blocked module: ${importName}`,
                    severity: 'high',
                    suggestedPermission: 'allowedImports'
                });
            }

            // Check against allowed imports if strict imports are enforced
            if (this.config.enforceStrictImports && !this.config.allowedImports.includes(importName)) {
                this.securityWarnings.push({
                    field: 'imports',
                    message: `Potentially unsafe import at line ${lineNumber}: ${importName}`
                });
                
                dangerousOperations.push({
                    type: DangerousOperationType.UNSAFE_IMPORT,
                    lineNumber,
                    code: match[0],
                    description: `Import of module not in allowlist: ${importName}`,
                    severity: 'medium',
                    suggestedPermission: 'allowedImports'
                });
            }
        }

        // Check for dynamic imports
        const dynamicImportRegex = /__import__\s*\(|importlib|import_module/g;
        while ((match = dynamicImportRegex.exec(content)) !== null) {
            const lineNumber = this.getLineNumber(content, match.index);
            _errors.push({
                field: 'imports',
                message: `Dynamic import detected at line ${lineNumber}. This is not allowed.`
            });
            
            dangerousOperations.push({
                type: DangerousOperationType.UNSAFE_IMPORT,
                lineNumber,
                code: match[0],
                description: 'Dynamic import mechanism detected',
                severity: 'high'
            });
        }
    }

    private validateFileAccess(
        content: string, 
        _errors: ValidationError[], 
        dangerousOperations: DangerousOperation[] = []
    ): void {
        // Check for read operations
        const readPatterns = [
            {
                regex: /open\s*\(['"]([^'"]+)['"]\s*(?:,\s*['"]r['"]\s*)?(?:,|\))/g,
                description: "File open for reading"
            },
            {
                regex: /with\s+open\s*\(['"]([^'"]+)['"]\s*(?:,\s*['"]r['"]\s*)?(?:,|\))/g,
                description: "File open for reading with context manager"
            },
            {
                regex: /Path\s*\(['"]([^'"]+)['"]\)\.read/g,
                description: "Path reading operation"
            },
            {
                regex: /os\.path\.exists\s*\(['"]([^'"]+)['"]\)/g,
                description: "File existence check"
            },
            {
                regex: /os\.listdir\s*\(['"]([^'"]+)['"]\)/g,
                description: "Directory listing"
            }
        ];

        // Check for write operations
        const writePatterns = [
            {
                regex: /open\s*\(['"]([^'"]+)['"]\s*,\s*['"](?:w|a|x|\+)['"]\s*(?:,|\))/g,
                description: "File open for writing"
            },
            {
                regex: /with\s+open\s*\(['"]([^'"]+)['"]\s*,\s*['"](?:w|a|x|\+)['"]\s*(?:,|\))/g,
                description: "File open for writing with context manager"
            },
            {
                regex: /Path\s*\(['"]([^'"]+)['"]\)\.write/g,
                description: "Path writing operation"
            },
            {
                regex: /os\.remove\s*\(['"]([^'"]+)['"]\)/g,
                description: "File deletion"
            },
            {
                regex: /os\.unlink\s*\(['"]([^'"]+)['"]\)/g,
                description: "File unlinking (deletion)"
            }
        ];

        // Process read patterns
        for (const pattern of readPatterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                const filePath = match[1];
                const lineNumber = this.getLineNumber(content, match.index);
                
                if (!this.config.allowFileSystemAccess) {
                    this.securityWarnings.push({
                        field: 'file_access',
                        message: `${pattern.description} at line ${lineNumber}: ${filePath}`
                    });
                    
                    dangerousOperations.push({
                        type: DangerousOperationType.FILE_READ,
                        lineNumber,
                        code: match[0],
                        description: `${pattern.description}: ${filePath}`,
                        severity: 'medium',
                        suggestedPermission: 'fileSystemPermissions'
                    });
                }
            }
        }

        // Process write patterns
        for (const pattern of writePatterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                const filePath = match[1];
                const lineNumber = this.getLineNumber(content, match.index);
                
                this.securityWarnings.push({
                    field: 'file_access',
                    message: `${pattern.description} at line ${lineNumber}: ${filePath}`
                });
                
                dangerousOperations.push({
                    type: DangerousOperationType.FILE_WRITE,
                    lineNumber,
                    code: match[0],
                    description: `${pattern.description}: ${filePath}`,
                    severity: 'high',
                    suggestedPermission: 'fileSystemPermissions'
                });
            }
        }
    }

    private validateSystemCalls(
        content: string, 
        _errors: ValidationError[], 
        dangerousOperations: DangerousOperation[] = []
    ): void {
        // Check for dangerous system calls
        const systemCallPatterns = [
            {
                regex: /subprocess\.(Popen|call|run|check_output|check_call)/g,
                description: "Subprocess execution",
                severity: 'high' as const
            },
            {
                regex: /os\.system\s*\(/g,
                description: "OS system command execution",
                severity: 'high' as const
            },
            {
                regex: /os\.popen\s*\(/g,
                description: "OS popen command execution",
                severity: 'high' as const
            },
            {
                regex: /eval\s*\(/g,
                description: "Eval function (code execution)",
                severity: 'high' as const
            },
            {
                regex: /exec\s*\(/g,
                description: "Exec function (code execution)",
                severity: 'high' as const
            },
            {
                regex: /globals\(\)\s*\[\s*(['"].*?['"])\s*\]/g,
                description: "Global namespace manipulation",
                severity: 'medium' as const
            },
            {
                regex: /locals\(\)\s*\[\s*(['"].*?['"])\s*\]\s*=/g,
                description: "Local namespace manipulation",
                severity: 'medium' as const
            }
        ];

        for (const pattern of systemCallPatterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                const lineNumber = this.getLineNumber(content, match.index);
                
                _errors.push({
                    field: 'system_calls',
                    message: `${pattern.description} at line ${lineNumber}. This is not allowed.`
                });
                
                dangerousOperations.push({
                    type: DangerousOperationType.SYSTEM_CALL,
                    lineNumber,
                    code: match[0],
                    description: pattern.description,
                    severity: pattern.severity,
                    suggestedPermission: 'systemCallPermissions'
                });
            }
        }

        // Check for attempts to modify Python builtins or attributes
        const modificationPatterns = [
            {
                regex: /__builtins__\s*\[\s*(['"].*?['"])\s*\]\s*=/g,
                description: "Modifying built-in functions",
                severity: 'high' as const
            },
            {
                regex: /setattr\s*\([^,]+,\s*['"]__[^'"]+['"]/g,
                description: "Setting special attributes",
                severity: 'high' as const
            }
        ];

        for (const pattern of modificationPatterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                const lineNumber = this.getLineNumber(content, match.index);
                
                _errors.push({
                    field: 'system_calls',
                    message: `${pattern.description} at line ${lineNumber}. This is not allowed.`
                });
                
                dangerousOperations.push({
                    type: DangerousOperationType.SYSTEM_CALL,
                    lineNumber,
                    code: match[0],
                    description: pattern.description,
                    severity: pattern.severity
                });
            }
        }
    }

    private validateNetworkAccess(
        content: string, 
        _errors: ValidationError[], 
        dangerousOperations: DangerousOperation[] = []
    ): void {
        // Check for network operations
        const networkPatterns = [
            {
                regex: /socket\./g,
                description: "Socket operations"
            },
            {
                regex: /requests\./g, 
                description: "HTTP requests"
            },
            {
                regex: /urllib\.request/g,
                description: "URL handling"
            },
            {
                regex: /http\.client/g,
                description: "HTTP client operations"
            },
            {
                regex: /ftplib\./g,
                description: "FTP operations"
            },
            {
                regex: /smtplib\./g,
                description: "SMTP (email) operations"
            },
            {
                regex: /asyncio\.open_connection/g,
                description: "Async network connection"
            }
        ];

        for (const pattern of networkPatterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                const lineNumber = this.getLineNumber(content, match.index);
                
                if (!this.config.allowNetworkAccess) {
                    this.securityWarnings.push({
                        field: 'network',
                        message: `${pattern.description} at line ${lineNumber}. Network access not permitted.`
                    });
                    
                    dangerousOperations.push({
                        type: DangerousOperationType.NETWORK,
                        lineNumber,
                        code: match[0],
                        description: pattern.description,
                        severity: 'medium',
                        suggestedPermission: 'networkPermissions'
                    });
                }
            }
        }

        // Extract URL patterns to determine network targets
        const urlPatterns = [
            /['"](?:http|https|ftp|ws|wss):\/\/([^\/'"]+)/g
        ];

        for (const pattern of urlPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const host = match[1];
                const lineNumber = this.getLineNumber(content, match.index);
                
                if (!this.config.allowNetworkAccess) {
                    this.securityWarnings.push({
                        field: 'network',
                        message: `URL to external host at line ${lineNumber}: ${host}`
                    });
                    
                    dangerousOperations.push({
                        type: DangerousOperationType.NETWORK,
                        lineNumber,
                        code: match[0],
                        description: `URL to host: ${host}`,
                        severity: 'medium',
                        suggestedPermission: 'networkPermissions'
                    });
                }
            }
        }
    }

    private validateResourceUsage(manifest: ScriptManifest, errors: ValidationError[]): void {
        const resourceLimits = manifest.execution.resource_limits || {};

        if (resourceLimits.memory && resourceLimits.memory > this.config.resourceLimits.maxMemory) {
            errors.push({
                field: 'resources',
                message: `Memory limit too high: ${resourceLimits.memory}MB (max: ${this.config.resourceLimits.maxMemory}MB)`
            });
        }

        if (resourceLimits.cpu && resourceLimits.cpu > this.config.resourceLimits.maxCpu) {
            errors.push({
                field: 'resources',
                message: `CPU limit too high: ${resourceLimits.cpu}% (max: ${this.config.resourceLimits.maxCpu}%)`
            });
        }

        if (resourceLimits.duration && resourceLimits.duration > this.config.resourceLimits.maxDuration) {
            errors.push({
                field: 'resources',
                message: `Maximum duration too high: ${resourceLimits.duration}s (max: ${this.config.resourceLimits.maxDuration}s)`
            });
        }
    }

    private async validateSignature(
        scriptPath: string,
        signature: string,
        errors: ValidationError[]
    ): Promise<void> {
        try {
            const content = await fs.promises.readFile(scriptPath);
            const hash = crypto
                .createHash('sha256')
                .update(content)
                .digest('hex');

            if (hash !== signature) {
                errors.push({
                    field: 'signature',
                    message: 'Script signature is invalid'
                });
            }
        } catch (error) {
            errors.push({
                field: 'signature',
                message: `Error during signature validation: ${error}`
            });
        }
    }

    /**
     * Performs advanced code scanning for vulnerabilities
     */
    private async performAdvancedScanForVulnerabilities(
        content: string, 
        _errors: ValidationError[], 
        dangerousOperations: DangerousOperation[] = []
    ): Promise<void> {
        // Custom patterns for deeper security analysis
        const vulnerabilityPatterns = [
            // Command injection
            {
                regex: /\+\s*(?:user_input|args|params|request\..*?|.*?_data|.*?_input)/g,
                description: "Potential command injection vulnerability (string concatenation with user input)"
            },
            // Arbitrary file access
            {
                regex: /open\s*\(\s*(?:user_input|args|params|request\..*?|.*?_data|.*?_input)/g,
                description: "Potential arbitrary file access (using user input as filename)"
            },
            // SQL injection
            {
                regex: /execute\s*\(\s*(?:f['"]|['"].*?\s*%|['"].*?\s*\.format|['"].*?\s*\+)/g,
                description: "Potential SQL injection (formatting SQL queries with variables)"
            },
            // Serialization/deserialization
            {
                regex: /pickle\.(?:loads|load)\s*\(/g,
                description: "Insecure deserialization (pickle)"
            },
            // Insecure randomness
            {
                regex: /random\.(?:random|randint|choice|sample)/g,
                description: "Potentially insecure random number generation (not cryptographically secure)"
            },
            // Hardcoded credentials
            {
                regex: /(?:password|token|api_key|apikey|secret)\s*=\s*['"][^'"]{8,}['"]/gi,
                description: "Possible hardcoded credentials"
            }
        ];

        for (const pattern of vulnerabilityPatterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                const lineNumber = this.getLineNumber(content, match.index);
                
                this.securityWarnings.push({
                    field: 'vulnerability',
                    message: `${pattern.description} at line ${lineNumber}`
                });
            }
        }

        // Check for a selection of dangerous patterns from the config
        for (const pattern of this.config.dangerousPatterns) {
            let match;
            pattern.lastIndex = 0; // Reset regex state
            while ((match = pattern.exec(content)) !== null) {
                const lineNumber = this.getLineNumber(content, match.index);
                
                this.securityWarnings.push({
                    field: 'dangerous_pattern',
                    message: `Potentially dangerous code pattern at line ${lineNumber}: ${match[0]}`
                });
                
                // Determine operation type based on pattern
                let opType = DangerousOperationType.SYSTEM_CALL;
                if (pattern.source.includes('subprocess') || pattern.source.includes('system')) {
                    opType = DangerousOperationType.SUBPROCESS;
                } else if (pattern.source.includes('open') || pattern.source.includes('Path')) {
                    opType = DangerousOperationType.FILE_WRITE;
                } else if (pattern.source.includes('socket') || pattern.source.includes('requests') || pattern.source.includes('urllib')) {
                    opType = DangerousOperationType.NETWORK;
                } else if (pattern.source.includes('eval') || pattern.source.includes('exec')) {
                    opType = DangerousOperationType.EVAL;
                }
                
                dangerousOperations.push({
                    type: opType,
                    lineNumber,
                    code: match[0],
                    description: `Potentially dangerous code pattern`,
                    severity: 'medium'
                });
            }
        }
    }

    /**
     * Gets the line number for a position in the text
     */
    private getLineNumber(text: string, position: number): number {
        const textUpToPosition = text.substring(0, position);
        return (textUpToPosition.match(/\n/g) || []).length + 1;
    }

    /**
     * Shows warnings to the user and prompts for permission if needed
     */
    private async showUserWarnings(
        scriptId: string,
        dangerousOperations: DangerousOperation[]
    ): Promise<void> {
        if (!this.securityWarnings.length || !this.config.userPermissionPrompts) {
            return;
        }

        // Group related warnings
        const fileReadWarnings = this.securityWarnings.filter(w => w.field === 'file_access' && w.message.includes('read'));
        const fileWriteWarnings = this.securityWarnings.filter(w => w.field === 'file_access' && !w.message.includes('read'));
        const networkWarnings = this.securityWarnings.filter(w => w.field === 'network');
        const importWarnings = this.securityWarnings.filter(w => w.field === 'imports');
        const systemWarnings = this.securityWarnings.filter(w => w.field === 'system_calls');
        
        // Show summary of potential security issues
        let warningMessage = 'The script contains potentially unsafe operations:\n';
        
        if (fileReadWarnings.length) {
            warningMessage += `• ${fileReadWarnings.length} file read operations\n`;
        }
        
        if (fileWriteWarnings.length) {
            warningMessage += `• ${fileWriteWarnings.length} file write operations\n`;
        }
        
        if (networkWarnings.length) {
            warningMessage += `• ${networkWarnings.length} network operations\n`;
        }
        
        if (importWarnings.length) {
            warningMessage += `• ${importWarnings.length} potentially unsafe imports\n`;
        }
        
        if (systemWarnings.length) {
            warningMessage += `• ${systemWarnings.length} system operations\n`;
        }
        
        warningMessage += '\nWould you like to allow these operations?';
        
        const choice = await vscode.window.showWarningMessage(
            warningMessage,
            { modal: true },
            'Allow All',
            'Allow Temporarily',
            'Choose Individual Permissions',
            'Deny All'
        );
        
        if (choice === 'Allow All') {
            // Grant all requested permissions
            this.grantAllPermissions(scriptId, dangerousOperations);
        } else if (choice === 'Allow Temporarily') {
            // Grant temporary permissions
            this.grantAllPermissions(scriptId, dangerousOperations, true);
        } else if (choice === 'Choose Individual Permissions') {
            // Let user select which permissions to grant
            await this.promptForIndividualPermissions(scriptId, dangerousOperations);
        }
    }
    
    /**
     * Grant all permissions required by dangerous operations
     */
    private grantAllPermissions(
        scriptId: string, 
        dangerousOperations: DangerousOperation[],
        temporary: boolean = false
    ): void {
        // Extract unique permission requirements
        const fileReadPaths = new Set<string>();
        const fileWritePaths = new Set<string>();
        const networkHosts = new Set<string>();
        const imports = new Set<string>();
        let needsSubprocess = false;
        let needsFileDelete = false;
        
        for (const op of dangerousOperations) {
            switch (op.type) {
                case DangerousOperationType.FILE_READ:
                    if (op.code.match(/['"]([^'"]+)['"]/)) {
                        const path = RegExp.$1;
                        fileReadPaths.add(path);
                    }
                    break;
                case DangerousOperationType.FILE_WRITE:
                    if (op.code.match(/['"]([^'"]+)['"]/)) {
                        const path = RegExp.$1;
                        fileWritePaths.add(path);
                    }
                    needsFileDelete = needsFileDelete || op.code.includes('remove') || op.code.includes('unlink');
                    break;
                case DangerousOperationType.NETWORK:
                    if (op.code.match(/['"](?:http|https|ftp):\/\/([^\/'"]+)/)) {
                        const host = RegExp.$1;
                        networkHosts.add(host);
                    } else {
                        networkHosts.add('*'); // Generic network access
                    }
                    break;
                case DangerousOperationType.UNSAFE_IMPORT:
                    if (op.code.match(/import\s+([a-zA-Z0-9_.]+)/)) {
                        const importName = RegExp.$1.split('.')[0];
                        imports.add(importName);
                    }
                    break;
                case DangerousOperationType.SUBPROCESS:
                case DangerousOperationType.SYSTEM_CALL:
                    needsSubprocess = true;
                    break;
            }
        }
        
        // Build permission set
        const permissionUpdate: Partial<PermissionSet> = {
            allowedImports: [...imports],
            fileSystemPermissions: {
                read: [...fileReadPaths],
                write: [...fileWritePaths],
                delete: needsFileDelete
            },
            networkPermissions: {
                allowedHosts: [...networkHosts],
                allowedPorts: [80, 443], // Standard HTTP/HTTPS ports
                allowLocalhost: true
            },
            systemCallPermissions: {
                allowedCalls: [],
                allowSubprocesses: needsSubprocess
            }
        };
        
        if (temporary) {
            // Set temporary permission (for 1 hour)
            const tempDuration = 60 * 60 * 1000; // 1 hour in milliseconds
            
            // Apply each permission type separately
            if (imports.size > 0) {
                this.permissionManager.grantTemporaryPermission(scriptId, 'allowedImports', 
                    [...imports], tempDuration);
            }
            
            if (fileReadPaths.size > 0 || fileWritePaths.size > 0) {
                this.permissionManager.grantTemporaryPermission(scriptId, 'fileSystemPermissions', 
                    permissionUpdate.fileSystemPermissions, tempDuration);
            }
            
            if (networkHosts.size > 0) {
                this.permissionManager.grantTemporaryPermission(scriptId, 'networkPermissions', 
                    permissionUpdate.networkPermissions, tempDuration);
            }
            
            if (needsSubprocess) {
                this.permissionManager.grantTemporaryPermission(scriptId, 'systemCallPermissions', 
                    permissionUpdate.systemCallPermissions, tempDuration);
            }
        } else {
            // Set permanent permissions
            this.permissionManager.setScriptPermissions(scriptId, permissionUpdate);
        }
    }
    
    /**
     * Prompt the user for individual permissions
     */
    private async promptForIndividualPermissions(
        scriptId: string, 
        dangerousOperations: DangerousOperation[]
    ): Promise<void> {
        // Group operations by type for better user experience
        const opsByType = new Map<DangerousOperationType, DangerousOperation[]>();
        
        for (const op of dangerousOperations) {
            if (!opsByType.has(op.type)) {
                opsByType.set(op.type, []);
            }
            opsByType.get(op.type)?.push(op);
        }
        
        // Ask for each permission type
        for (const [type, ops] of opsByType.entries()) {
            let permissionDetails: any = {};
            let permissionType = '';
            
            switch (type) {
                case DangerousOperationType.FILE_READ:
                    const readPaths = ops.map(op => {
                        const match = op.code.match(/['"]([^'"]+)['"]/);
                        return match ? match[1] : '';
                    }).filter(Boolean);
                    
                    for (const path of readPaths) {
                        permissionDetails = { path };
                        permissionType = 'fileSystemRead';
                        await this.permissionManager.requestPermission(scriptId, permissionType, permissionDetails);
                    }
                    break;
                
                case DangerousOperationType.FILE_WRITE:
                    const writePaths = ops.map(op => {
                        const match = op.code.match(/['"]([^'"]+)['"]/);
                        return match ? match[1] : '';
                    }).filter(Boolean);
                    
                    for (const path of writePaths) {
                        permissionDetails = { path };
                        permissionType = 'fileSystemWrite';
                        await this.permissionManager.requestPermission(scriptId, permissionType, permissionDetails);
                    }
                    
                    if (ops.some(op => op.code.includes('remove') || op.code.includes('unlink'))) {
                        permissionDetails = { value: true };
                        permissionType = 'fileSystemDelete';
                        await this.permissionManager.requestPermission(scriptId, permissionType, permissionDetails);
                    }
                    break;
                
                case DangerousOperationType.NETWORK:
                    const hosts = ops.map(op => {
                        const match = op.code.match(/['"](?:http|https|ftp):\/\/([^\/'"]+)/);
                        return match ? match[1] : '';
                    }).filter(Boolean);
                    
                    if (hosts.length === 0) {
                        // Generic network access
                        permissionDetails = { host: '*' };
                        permissionType = 'networkHost';
                        await this.permissionManager.requestPermission(scriptId, permissionType, permissionDetails);
                    } else {
                        for (const host of hosts) {
                            permissionDetails = { host };
                            permissionType = 'networkHost';
                            await this.permissionManager.requestPermission(scriptId, permissionType, permissionDetails);
                        }
                    }
                    break;
                
                case DangerousOperationType.UNSAFE_IMPORT:
                    const imports = ops.map(op => {
                        const match = op.code.match(/import\s+([a-zA-Z0-9_.]+)/);
                        return match ? match[1].split('.')[0] : '';
                    }).filter(Boolean);
                    
                    for (const importModule of imports) {
                        permissionDetails = { module: importModule };
                        permissionType = 'import';
                        await this.permissionManager.requestPermission(scriptId, permissionType, permissionDetails);
                    }
                    break;
                
                case DangerousOperationType.SUBPROCESS:
                case DangerousOperationType.SYSTEM_CALL:
                    permissionDetails = { value: true };
                    permissionType = 'subprocess';
                    await this.permissionManager.requestPermission(scriptId, permissionType, permissionDetails);
                    break;
            }
        }
    }
    
    /**
     * Update required permissions based on detected operations
     */
    private updateRequiredPermissions(scriptId: string, dangerousOperations: DangerousOperation[]): void {
        // If no operations need permissions, nothing to do
        if (dangerousOperations.length === 0) {
            return;
        }
        
        // Check if we need to prompt the user for permissions
        const autoGrant = !this.config.userPermissionPrompts;
        
        if (autoGrant) {
            // Auto-grant all permissions if prompts are disabled
            this.grantAllPermissions(scriptId, dangerousOperations);
        }
    }

    public updateConfig(newConfig: Partial<SecurityConfig>): void {
        if (newConfig.allowedImports) {
            this.config.allowedImports = [
                ...new Set([...this.config.allowedImports, ...newConfig.allowedImports])
            ];
        }
        
        if (newConfig.blockedImports) {
            this.config.blockedImports = [
                ...new Set([...this.config.blockedImports, ...newConfig.blockedImports])
            ];
        }
        
        if (newConfig.maxFileSize) {
            this.config.maxFileSize = newConfig.maxFileSize;
        }
        
        if (newConfig.allowedPaths) {
            this.config.allowedPaths = [
                ...new Set([...this.config.allowedPaths, ...newConfig.allowedPaths])
            ];
        }
        
        if (newConfig.resourceLimits) {
            this.config.resourceLimits = {
                ...this.config.resourceLimits,
                ...newConfig.resourceLimits
            };
        }
        
        if (newConfig.dangerousPatterns) {
            this.config.dangerousPatterns = [
                ...this.config.dangerousPatterns,
                ...newConfig.dangerousPatterns
            ];
        }
        
        // Update boolean settings
        if (newConfig.enforceStrictImports !== undefined) {
            this.config.enforceStrictImports = newConfig.enforceStrictImports;
        }
        
        if (newConfig.scanForVulnerabilities !== undefined) {
            this.config.scanForVulnerabilities = newConfig.scanForVulnerabilities;
        }
        
        if (newConfig.allowNetworkAccess !== undefined) {
            this.config.allowNetworkAccess = newConfig.allowNetworkAccess;
        }
        
        if (newConfig.allowFileSystemAccess !== undefined) {
            this.config.allowFileSystemAccess = newConfig.allowFileSystemAccess;
        }
        
        if (newConfig.userPermissionPrompts !== undefined) {
            this.config.userPermissionPrompts = newConfig.userPermissionPrompts;
        }
    }

    public getConfig(): SecurityConfig {
        return { ...this.config };
    }
}
