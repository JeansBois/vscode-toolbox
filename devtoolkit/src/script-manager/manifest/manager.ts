import * as fs from 'fs';
import * as path from 'path';
import { ScriptManifest, ValidationResult, ValidationError as ManifestValidationError } from '../types';
import { ManifestValidator } from './validator';
import { ScriptEventManager } from '../core/events';
import { 
    AppError, 
    FileSystemError, 
    ValidationError, 
    NotFoundError,
    logError,
    wrapError,
    ErrorCode
} from '../../utils/error-handling';

/**
 * Manages script manifests including loading, saving, validation, generation, and updates
 */
export class ManifestManager {
    private readonly validator: ManifestValidator;
    private readonly eventManager: ScriptEventManager;
    private static instance: ManifestManager;
    private manifestBackupDir: string | null = null;

    private constructor() {
        this.validator = new ManifestValidator();
        this.eventManager = ScriptEventManager.getInstance();
        
        // Try to create a backup directory for manifests
        try {
            const backupDir = path.join(process.cwd(), '.manifest_backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            this.manifestBackupDir = backupDir;
        } catch (error) {
            // Just log the error - backup dir is optional
            logError(error, { 
                operation: 'ManifestManager.initBackupDir' 
            });
        }
    }

    /**
     * Gets the singleton instance of ManifestManager
     * @returns ManifestManager instance
     */
    public static getInstance(): ManifestManager {
        if (!ManifestManager.instance) {
            ManifestManager.instance = new ManifestManager();
        }
        return ManifestManager.instance;
    }

    /**
     * Loads a manifest from a file
     * @param manifestPath Path to the manifest file
     * @returns Loaded and validated manifest
     * @throws {NotFoundError} If manifest file does not exist
     * @throws {ValidationError} If manifest is invalid
     * @throws {FileSystemError} If file operations fail
     */
    public async loadManifest(manifestPath: string): Promise<ScriptManifest> {
        try {
            // Validate input
            if (!manifestPath || typeof manifestPath !== 'string') {
                throw new ValidationError('Invalid manifest path', {
                    isUserError: true,
                    context: { manifestPath }
                });
            }
            
            // Check if file exists
            if (!fs.existsSync(manifestPath)) {
                throw new NotFoundError(`Manifest file not found: ${manifestPath}`, {
                    isUserError: true,
                    context: { manifestPath }
                });
            }
            
            // Read manifest file
            const content = await fs.promises.readFile(manifestPath, 'utf-8')
                .catch(err => {
                    throw new FileSystemError(`Failed to read manifest file: ${err.message}`, {
                        originalError: err,
                        context: { manifestPath }
                    });
                });
                
            // Parse manifest
            let manifest: ScriptManifest;
            try {
                manifest = JSON.parse(content) as ScriptManifest;
            } catch (parseError) {
                // Try to recover from JSON parse error with a more permissive parser
                try {
                    // Log the original error
                    logError(parseError, {
                        operation: 'loadManifest.parse',
                        manifestPath
                    });
                    
                    // Attempt recovery using a more lenient approach
                    manifest = this.attemptJsonRecovery(content);
                    
                    // Log recovery success
                    logError('Successfully recovered corrupted manifest', { 
                        severity: 'info',
                        operation: 'loadManifest.recovery',
                        manifestPath
                    });
                } catch (recoveryError) {
                    // If recovery also fails, throw a more helpful error
                    throw new ValidationError(`Manifest contains invalid JSON: ${(parseError as Error).message}`, {
                        originalError: parseError as Error,
                        context: { manifestPath },
                        technicalDetails: content.substring(0, 100) + (content.length > 100 ? '...' : '')
                    });
                }
            }
            
            // Validate the manifest
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                const errorMessages = validation.errors.map((e: ManifestValidationError) => e.message).join('\n');
                throw new ValidationError(`Invalid manifest: ${errorMessages}`, {
                    isUserError: true,
                    context: { 
                        manifestPath,
                        errors: validation.errors
                    },
                    technicalDetails: JSON.stringify(validation.errors, null, 2)
                });
            }
            
            return manifest;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw wrapError(error, ErrorCode.INTERNAL_ERROR, `Error loading manifest: ${manifestPath}`, {
                manifestPath
            });
        }
    }
    
    /**
     * Attempts to recover from JSON parse errors with a more lenient approach
     * @param content The JSON content to parse
     * @returns Parsed manifest object
     * @throws Error if recovery fails
     */
    private attemptJsonRecovery(content: string): ScriptManifest {
        // Try basic cleanup: remove comments, fix missing commas, etc.
        const cleaned = content
            .replace(/\/\/.*/g, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
            .replace(/([}\]])\s*([^,\s\]}])/g, '$1,$2') // Add missing commas
            .replace(/[\n\r\t\s]+/g, ' ') // Normalize whitespace
            .trim();
            
        try {
            return JSON.parse(cleaned) as ScriptManifest;
        } catch (error) {
            // If still fails, try a last-resort approach: evaluate as JavaScript
            // This is a security risk but limited to manifest files which should be trusted
            throw new Error('Advanced manifest recovery failed');
        }
    }

    /**
     * Saves a manifest to a file
     * @param manifest Manifest to save
     * @param manifestPath Path where to save the manifest
     * @throws {ValidationError} If manifest is invalid
     * @throws {FileSystemError} If file operations fail
     */
    public async saveManifest(manifest: ScriptManifest, manifestPath: string): Promise<void> {
        // Create a backup of the existing manifest if it exists
        let backupPath: string | null = null;
        
        try {
            // Validate input
            if (!manifest || typeof manifest !== 'object') {
                throw new ValidationError('Invalid manifest object', {
                    isUserError: true,
                    context: { manifest }
                });
            }
            
            if (!manifestPath || typeof manifestPath !== 'string') {
                throw new ValidationError('Invalid manifest path', {
                    isUserError: true,
                    context: { manifestPath }
                });
            }
            
            // Create backup if file exists and backup dir is available
            if (fs.existsSync(manifestPath) && this.manifestBackupDir) {
                try {
                    const backupFilename = `${path.basename(manifestPath)}.${Date.now()}.bak`;
                    backupPath = path.join(this.manifestBackupDir, backupFilename);
                    fs.copyFileSync(manifestPath, backupPath);
                } catch (backupError) {
                    // Just log the error - backup is optional
                    logError(backupError, { 
                        operation: 'saveManifest.backup',
                        manifestPath 
                    });
                }
            }
            
            // Validate before saving
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                const errorMessages = validation.errors.map((e: ManifestValidationError) => e.message).join('\n');
                throw new ValidationError(`Cannot save invalid manifest: ${errorMessages}`, {
                    isUserError: true,
                    context: { 
                        manifestPath,
                        errors: validation.errors
                    },
                    technicalDetails: JSON.stringify(validation.errors, null, 2)
                });
            }

            // Update metadata
            const currentMetadata = manifest.metadata || {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            manifest.metadata = {
                ...currentMetadata,
                updated_at: new Date().toISOString()
            };

            // Create parent directory if it doesn't exist
            const parentDir = path.dirname(manifestPath);
            if (!fs.existsSync(parentDir)) {
                await fs.promises.mkdir(parentDir, { recursive: true })
                    .catch(err => {
                        throw new FileSystemError(`Failed to create directory for manifest: ${err.message}`, {
                            originalError: err,
                            context: { parentDir }
                        });
                    });
            }

            // Write the manifest file
            await fs.promises.writeFile(
                manifestPath,
                JSON.stringify(manifest, null, 2),
                'utf-8'
            ).catch(err => {
                // If write fails and we have a backup, try to restore it
                if (backupPath && fs.existsSync(backupPath)) {
                    try {
                        fs.copyFileSync(backupPath, manifestPath);
                        logError('Restored manifest from backup after failed save', {
                            severity: 'info',
                            operation: 'saveManifest.restore',
                            manifestPath,
                            backupPath
                        });
                    } catch (restoreError) {
                        logError(restoreError, {
                            operation: 'saveManifest.restoreBackup',
                            manifestPath,
                            backupPath
                        });
                    }
                }
                
                throw new FileSystemError(`Failed to write manifest file: ${err.message}`, {
                    originalError: err,
                    context: { manifestPath }
                });
            });
            
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw wrapError(error, ErrorCode.INTERNAL_ERROR, `Error saving manifest: ${manifestPath}`, {
                manifestPath
            });
        }
    }

    /**
     * Validates a manifest against schema and business rules
     * @param manifest Manifest to validate
     * @returns Validation result with errors if any
     * @throws {ValidationError} If validation process fails
     */
    public async validateManifest(manifest: ScriptManifest): Promise<ValidationResult> {
        try {
            // Input validation
            if (!manifest || typeof manifest !== 'object') {
                throw new ValidationError('Invalid manifest object', {
                    isUserError: true,
                    context: { manifest }
                });
            }
            
            if (!manifest.script_info || !manifest.script_info.id) {
                throw new ValidationError('Manifest missing required script_info.id', {
                    isUserError: true,
                    context: { manifest }
                });
            }
            
            // Notify validation start
            this.eventManager.notifyValidationStarted(manifest.script_info.id);
            
            // Validate the manifest
            let result: ValidationResult;
            try {
                result = await this.validator.validateManifest(manifest);
            } catch (validationError) {
                // Handle validator errors
                this.eventManager.notifyValidationCompleted(
                    manifest.script_info.id,
                    false,
                    [(validationError as Error).message]
                );
                
                throw new ValidationError(`Manifest validation failed: ${(validationError as Error).message}`, {
                    originalError: validationError as Error,
                    context: { 
                        scriptId: manifest.script_info.id,
                        scriptName: manifest.script_info.name
                    }
                });
            }
            
            // Notify validation result
            if (result.isValid) {
                this.eventManager.notifyValidationCompleted(
                    manifest.script_info.id,
                    true
                );
            } else {
                this.eventManager.notifyValidationCompleted(
                    manifest.script_info.id,
                    false,
                    result.errors.map((error: ManifestValidationError) => error.message)
                );
            }
            
            return result;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            
            // Ensure validation completion notification even for unexpected errors
            if (manifest && manifest.script_info && manifest.script_info.id) {
                this.eventManager.notifyValidationCompleted(
                    manifest.script_info.id,
                    false,
                    [(error as Error).message]
                );
            }
            
            throw wrapError(error, ErrorCode.VALIDATION_FAILED, 'Manifest validation encountered an error');
        }
    }

    /**
     * Generates a manifest for a script file
     * @param scriptPath Path to the script file
     * @param baseInfo Base manifest information to include
     * @returns Generated and validated manifest
     * @throws {NotFoundError} If script file does not exist
     * @throws {ValidationError} If generated manifest is invalid
     * @throws {FileSystemError} If file operations fail
     */
    public async generateManifest(
        scriptPath: string,
        baseInfo: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
        try {
            // Validate input
            if (!scriptPath || typeof scriptPath !== 'string') {
                throw new ValidationError('Invalid script path', {
                    isUserError: true,
                    context: { scriptPath }
                });
            }
            
            // Check if script file exists
            if (!fs.existsSync(scriptPath)) {
                throw new NotFoundError(`Script file not found: ${scriptPath}`, {
                    isUserError: true,
                    context: { scriptPath }
                });
            }
            
            // Read script content
            const scriptContent = await fs.promises.readFile(scriptPath, 'utf-8')
                .catch(err => {
                    throw new FileSystemError(`Failed to read script file: ${err.message}`, {
                        originalError: err,
                        context: { scriptPath }
                    });
                });
                
            // Extract manifest info from script content
            let manifest: ScriptManifest;
            try {
                manifest = await this.extractManifestInfo(scriptContent, baseInfo);
            } catch (extractError) {
                throw new ValidationError(`Failed to extract manifest info: ${(extractError as Error).message}`, {
                    originalError: extractError as Error,
                    context: { scriptPath }
                });
            }
            
            // Validate the generated manifest
            const validation = await this.validateManifest(manifest);
            if (!validation.isValid) {
                const errorMessages = validation.errors.map((e: ManifestValidationError) => e.message).join('\n');
                throw new ValidationError(`Generated manifest is invalid: ${errorMessages}`, {
                    isUserError: true,
                    context: { 
                        scriptPath,
                        errors: validation.errors
                    },
                    technicalDetails: JSON.stringify(validation.errors, null, 2)
                });
            }
            
            return manifest;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw wrapError(error, ErrorCode.INTERNAL_ERROR, `Error generating manifest for: ${scriptPath}`, {
                scriptPath
            });
        }
    }

    /**
     * Updates an existing manifest with new information
     * @param manifest Original manifest
     * @param updates Partial manifest with updates
     * @returns Updated and validated manifest
     * @throws {ValidationError} If updated manifest is invalid
     */
    public async updateManifest(
        manifest: ScriptManifest,
        updates: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
        try {
            // Validate inputs
            if (!manifest || typeof manifest !== 'object') {
                throw new ValidationError('Invalid manifest object', {
                    isUserError: true,
                    context: { manifest }
                });
            }
            
            if (!updates || typeof updates !== 'object') {
                throw new ValidationError('Invalid updates object', {
                    isUserError: true,
                    context: { updates }
                });
            }
            
            // Merge manifests
            const updatedManifest = this.mergeManifests(manifest, updates);
            
            // Validate the updated manifest
            const validation = await this.validateManifest(updatedManifest);
            if (!validation.isValid) {
                const errorMessages = validation.errors.map((e: ManifestValidationError) => e.message).join('\n');
                throw new ValidationError(`Updated manifest is invalid: ${errorMessages}`, {
                    isUserError: true,
                    context: { 
                        scriptId: manifest.script_info?.id,
                        errors: validation.errors
                    },
                    technicalDetails: JSON.stringify(validation.errors, null, 2)
                });
            }
            
            return updatedManifest;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw wrapError(error, ErrorCode.VALIDATION_FAILED, 'Failed to update manifest');
        }
    }

    /**
     * Extracts manifest information from script content
     * @param scriptContent Content of the script file
     * @param baseInfo Base manifest information to include
     * @returns Extracted manifest
     */
    private async extractManifestInfo(
        scriptContent: string,
        baseInfo: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
        try {
            // Extract Python-specific information
            const pythonInfo = this.extractPythonInfo(scriptContent);
            
            // Generate a script ID if not provided
            const scriptId = baseInfo.script_info?.id || this.generateScriptId();
            
            // Determine script name from content or baseInfo
            let scriptName = baseInfo.script_info?.name;
            if (!scriptName && scriptContent) {
                // Try to extract name from filename pattern in first line comment
                const firstLineMatch = scriptContent.split('\n')[0].match(/# ([a-zA-Z0-9_-]+)\.py/);
                if (firstLineMatch && firstLineMatch[1]) {
                    scriptName = firstLineMatch[1];
                } else {
                    // Default to "script" if no name found
                    scriptName = 'script';
                }
            }
            
            // Create the manifest with merged information
            const manifest: ScriptManifest = {
                script_info: {
                    id: scriptId,
                    name: scriptName || 'script',
                    version: baseInfo.script_info?.version || '1.0.0',
                    description: baseInfo.script_info?.description || this.extractDescription(scriptContent) || '',
                    author: baseInfo.script_info?.author || this.extractAuthor(scriptContent) || '',
                    category: baseInfo.script_info?.category || 'general',
                    tags: baseInfo.script_info?.tags || []
                },
                execution: {
                    entry_point: baseInfo.execution?.entry_point || '',
                    python_version: pythonInfo.pythonVersion || '>=3.6',
                    dependencies: [...new Set([...(pythonInfo.dependencies || []), ...(baseInfo.execution?.dependencies || [])])],
                    arguments: pythonInfo.arguments || baseInfo.execution?.arguments || [],
                    environment: baseInfo.execution?.environment || {}
                },
                validation: baseInfo.validation || {
                    input_schema: {},
                    output_schema: {}
                },
                metadata: {
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_executed: baseInfo.metadata?.last_executed,
                    execution_count: baseInfo.metadata?.execution_count || 0
                }
            };
    
            return manifest;
        } catch (error) {
            throw wrapError(
                error, 
                ErrorCode.VALIDATION_FAILED, 
                'Failed to extract manifest information from script'
            );
        }
    }
    
    /**
     * Extracts description from script docstring
     * @param scriptContent Script content
     * @returns Extracted description or empty string
     */
    private extractDescription(scriptContent: string): string {
        const docstringMatch = scriptContent.match(/"""([\s\S]*?)"""/);
        if (docstringMatch && docstringMatch[1]) {
            // Extract first paragraph from docstring
            const firstParagraph = docstringMatch[1].trim().split('\n\n')[0];
            return firstParagraph;
        }
        return '';
    }
    
    /**
     * Extracts author information from script content
     * @param scriptContent Script content
     * @returns Extracted author or empty string
     */
    private extractAuthor(scriptContent: string): string {
        // Look for author tag in docstring
        const authorMatch = scriptContent.match(/@author\s*[:=]?\s*([^\n]+)/i);
        if (authorMatch && authorMatch[1]) {
            return authorMatch[1].trim();
        }
        return '';
    }

    /**
     * Extracts Python-specific information from script content
     * @param scriptContent Script content
     * @returns Object with Python-specific information
     */
    /**
     * Extracts Python-specific information from script content
     * @param scriptContent Script content
     * @returns Object with Python-specific information
     */
    private extractPythonInfo(scriptContent: string): {
        pythonVersion?: string;
        dependencies: string[];
        arguments: Array<{
            name: string;
            type: string;
            description: string;
            required: boolean;
            default?: any;
        }>;
    } {
        const dependencies: string[] = [];
        const scriptArguments: Array<{
            name: string;
            type: string;
            description: string;
            required: boolean;
            default?: any;
        }> = [];
        let pythonVersion: string | undefined;

        // Extract Python version requirement
        try {
            const versionMatch = scriptContent.match(/# Python\s+(\d+\.\d+)(\+|>=?|<=?)?/i);
            if (versionMatch) {
                const version = versionMatch[1];
                const operator = versionMatch[2] || '>=';
                pythonVersion = `${operator}${version}`;
            }
        } catch (versionError) {
            // Just log, don't break extraction for version error
            logError(versionError, {
                operation: 'extractPythonInfo.versionExtraction',
                severity: 'low'
            });
        }

        // Extract dependencies from imports
        try {
            const importRegex = /^(?:from|import)\s+([a-zA-Z0-9_]+)/gm;
            let match;
            while ((match = importRegex.exec(scriptContent)) !== null) {
                if (!['os', 'sys', 'typing'].includes(match[1])) {
                    dependencies.push(match[1]);
                }
            }
        } catch (importError) {
            logError(importError, {
                operation: 'extractPythonInfo.importExtraction',
                severity: 'low'
            });
        }

        // Extract arguments from docstring
        try {
            const docstringRegex = /"""([\s\S]*?)"""/;
            const docMatch = docstringRegex.exec(scriptContent);
            if (docMatch) {
                const docstring = docMatch[1];
                const argRegex = /:param\s+(\w+):\s*\((\w+)\)\s*([^\n]+)/g;
                let argMatch;
                while ((argMatch = argRegex.exec(docstring)) !== null) {
                    scriptArguments.push({
                        name: argMatch[1],
                        type: argMatch[2],
                        description: argMatch[3].trim(),
                        required: !docstring.includes(`(default: `) || !docstring.includes(`(optional)`),
                    });
                }
            }
        } catch (docstringError) {
            logError(docstringError, {
                operation: 'extractPythonInfo.docstringExtraction',
                severity: 'low'
            });
        }

        return {
            pythonVersion,
            dependencies: [...new Set(dependencies)],
            arguments: scriptArguments
        };
    }

    private generateScriptId(): string {
        return `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private mergeManifests(
        base: ScriptManifest,
        updates: Partial<ScriptManifest>
    ): ScriptManifest {
        return {
            script_info: {
                ...base.script_info,
                ...updates.script_info
            },
            execution: {
                ...base.execution,
                ...updates.execution,
                dependencies: [
                    ...new Set([
                        ...(base.execution.dependencies || []),
                        ...(updates.execution?.dependencies || [])
                    ])
                ],
                arguments: [
                    ...(base.execution.arguments || []),
                    ...(updates.execution?.arguments || [])
                ].filter((arg, index, self) => 
                    index === self.findIndex(a => a.name === arg.name)
                )
            },
            validation: {
                ...base.validation,
                ...updates.validation
            },
            metadata: {
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_executed: undefined,
                execution_count: 0
            }
        };
    }
}
