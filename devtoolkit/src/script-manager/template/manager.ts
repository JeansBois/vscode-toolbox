import * as fs from 'fs';
import * as path from 'path';
import { ScriptManifest, ScriptInfo } from '../types';
import { ManifestManager } from '../manifest/manager';
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
 * Represents a template variable definition
 */
interface TemplateVariable {
    name: string;
    description: string;
    type: string;
    required: boolean;
    default?: any;
}

/**
 * Represents metadata for a script template
 */
interface TemplateInfo {
    name: string;
    description: string;
    baseTemplate?: string;
    variables: TemplateVariable[];
}

/**
 * Valid types for template variables
 */
type ValidVariableType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * Manages script templates for the application
 */
export class TemplateManager {
    private readonly templatesDir: string;
    private readonly manifestManager: ManifestManager;
    private static instance: TemplateManager;

    private constructor(baseDir: string) {
        this.templatesDir = path.join(baseDir, 'templates');
        this.manifestManager = ManifestManager.getInstance();
        this.ensureTemplateDirectory();
    }

    /**
     * Gets the singleton instance of TemplateManager
     * @param baseDir Base directory for the application
     * @returns TemplateManager instance
     */
    public static getInstance(baseDir: string): TemplateManager {
        if (!TemplateManager.instance) {
            TemplateManager.instance = new TemplateManager(baseDir);
        }
        return TemplateManager.instance;
    }

    /**
     * Ensures the templates directory exists
     * @throws {FileSystemError} If directory creation fails
     */
    private ensureTemplateDirectory(): void {
        try {
            if (!fs.existsSync(this.templatesDir)) {
                fs.mkdirSync(this.templatesDir, { recursive: true });
            }
        } catch (error) {
            throw new FileSystemError(
                `Failed to create templates directory: ${this.templatesDir}`, 
                {
                    originalError: error as Error,
                    context: { templatesDir: this.templatesDir }
                }
            );
        }
    }

    /**
     * Creates a new script template
     * @param name Template name
     * @param sourceScript Path to the source script file
     * @param info Template metadata
     * @throws {ValidationError} If validation fails
     * @throws {FileSystemError} If file operations fail
     * @throws {NotFoundError} If base template is not found
     */
    public async createTemplate(
        name: string,
        sourceScript: string,
        info: TemplateInfo
    ): Promise<void> {
        try {
            // Validate inputs
            this.validateTemplateCreationParams(name, sourceScript, info);
            
            const templateDir = path.join(this.templatesDir, name);
            
            // Check if template already exists
            if (fs.existsSync(templateDir)) {
                throw new ValidationError(`Template "${name}" already exists`, {
                    isUserError: true,
                    context: { name, templateDir }
                });
            }
            
            // Create template directory
            await fs.promises.mkdir(templateDir, { recursive: true })
                .catch(err => {
                    throw new FileSystemError(`Failed to create template directory: ${err.message}`, {
                        originalError: err,
                        context: { templateDir }
                    });
                });
            
            // Read source script
            const scriptContent = await fs.promises.readFile(sourceScript, 'utf-8')
                .catch(err => {
                    throw new FileSystemError(`Failed to read source script: ${err.message}`, {
                        originalError: err,
                        context: { sourceScript }
                    });
                });
            
            // Process script template
            const templateScript = this.processScriptTemplate(scriptContent, info.variables);
            
            // Write template script
            await fs.promises.writeFile(
                path.join(templateDir, 'template.py'),
                templateScript
            ).catch(err => {
                throw new FileSystemError(`Failed to write template script: ${err.message}`, {
                    originalError: err,
                    context: { outputPath: path.join(templateDir, 'template.py') }
                });
            });
            
            // Save template info
            await fs.promises.writeFile(
                path.join(templateDir, 'template.json'),
                JSON.stringify(info, null, 2)
            ).catch(err => {
                throw new FileSystemError(`Failed to write template info: ${err.message}`, {
                    originalError: err,
                    context: { outputPath: path.join(templateDir, 'template.json') }
                });
            });
            
            // Handle inheritance from base template
            if (info.baseTemplate) {
                await this.inheritFromTemplate(templateDir, info.baseTemplate);
            }
            
            logError(`Template "${name}" created successfully`, { severity: 'info' });
        } catch (error) {
            // Remove failed template directory if it was created
            const templateDir = path.join(this.templatesDir, name);
            if (fs.existsSync(templateDir)) {
                try {
                    // Cleanup if template creation failed partially
                    fs.rmSync(templateDir, { recursive: true, force: true });
                } catch (cleanupError) {
                    logError(cleanupError, { 
                        operation: 'createTemplate.cleanup',
                        templateDir
                    });
                }
            }
            
            if (error instanceof AppError) {
                throw error;
            }
            throw new FileSystemError(`Error creating template "${name}": ${(error as Error).message}`, {
                originalError: error as Error,
                context: { name, sourceScript }
            });
        }
    }
    
    /**
     * Validates parameters for template creation
     * @param name Template name
     * @param sourceScript Source script path
     * @param info Template info object
     * @throws {ValidationError} If validation fails
     */
    private validateTemplateCreationParams(
        name: string, 
        sourceScript: string, 
        info: TemplateInfo
    ): void {
        // Validate name
        if (!name || typeof name !== 'string' || name.trim() === '') {
            throw new ValidationError('Invalid template name', {
                isUserError: true,
                context: { name }
            });
        }
        
        // Validate source script
        if (!sourceScript || typeof sourceScript !== 'string') {
            throw new ValidationError('Invalid source script path', {
                isUserError: true,
                context: { sourceScript }
            });
        }
        
        if (!fs.existsSync(sourceScript)) {
            throw new NotFoundError(`Source script not found: ${sourceScript}`, {
                isUserError: true,
                context: { sourceScript }
            });
        }
        
        // Validate info object
        if (!info || typeof info !== 'object') {
            throw new ValidationError('Invalid template info object', {
                isUserError: true,
                context: { info }
            });
        }
        
        if (!info.description || typeof info.description !== 'string') {
            throw new ValidationError('Template description is required', {
                isUserError: true,
                context: { description: info.description }
            });
        }
        
        // Validate variables
        if (!Array.isArray(info.variables)) {
            throw new ValidationError('Template variables must be an array', {
                isUserError: true,
                context: { variables: info.variables }
            });
        }
        
        // Validate each variable
        for (const variable of info.variables) {
            if (!variable.name || typeof variable.name !== 'string') {
                throw new ValidationError('All template variables must have a valid name', {
                    isUserError: true,
                    context: { variable }
                });
            }
            
            if (!variable.type || typeof variable.type !== 'string') {
                throw new ValidationError(`Variable "${variable.name}" must have a valid type`, {
                    isUserError: true,
                    context: { variable }
                });
            }
            
            // Validate variable type
            const validTypes: ValidVariableType[] = ['string', 'number', 'boolean', 'array', 'object'];
            if (!validTypes.includes(variable.type.toLowerCase() as ValidVariableType)) {
                throw new ValidationError(
                    `Invalid type "${variable.type}" for variable "${variable.name}". ` +
                    `Valid types are: ${validTypes.join(', ')}`,
                    {
                        isUserError: true,
                        context: { variable }
                    }
                );
            }
        }
        
        // Validate base template if specified
        if (info.baseTemplate) {
            const baseTemplatePath = path.join(this.templatesDir, info.baseTemplate);
            if (!fs.existsSync(baseTemplatePath)) {
                throw new NotFoundError(`Base template not found: ${info.baseTemplate}`, {
                    isUserError: true,
                    context: { baseTemplate: info.baseTemplate, baseTemplatePath }
                });
            }
        }
    }

    /**
     * Instantiates a template with provided variables
     * @param templateName Name of the template to instantiate
     * @param variables Variables to apply to the template
     * @param targetDir Target directory for the generated script
     * @param scriptInfo Script manifest info
     * @returns Generated script manifest
     * @throws {NotFoundError} If template is not found
     * @throws {ValidationError} If variable validation fails
     * @throws {FileSystemError} If file operations fail
     */
    public async instantiateTemplate(
        templateName: string,
        variables: Record<string, any>,
        targetDir: string,
        scriptInfo: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
        const templateDir = path.join(this.templatesDir, templateName);
        let createdFiles: string[] = [];
        
        try {
            // Validate template existence
            if (!fs.existsSync(templateDir)) {
                throw new NotFoundError(`Template "${templateName}" not found`, {
                    isUserError: true,
                    context: { templateName, templateDir }
                });
            }
            
            // Load template info
            const info = await this.loadTemplateInfo(templateName);
            
            // Validate variables
            this.validateTemplateVariables(info.variables, variables);
            
            // Load and process template script
            const templatePath = path.join(templateDir, 'template.py');
            
            const templateContent = await fs.promises.readFile(templatePath, 'utf-8')
                .catch(err => {
                    throw new FileSystemError(`Failed to read template script: ${err.message}`, {
                        originalError: err,
                        context: { templatePath }
                    });
                });
                
            const processedScript = this.processScriptContent(templateContent, variables);
            
            // Create target directory if needed
            await fs.promises.mkdir(targetDir, { recursive: true })
                .catch(err => {
                    throw new FileSystemError(`Failed to create target directory: ${err.message}`, {
                        originalError: err,
                        context: { targetDir }
                    });
                });
            
            // Generate script filename
            const scriptName = scriptInfo.script_info?.name || 
                               `${templateName}_${new Date().getTime()}`;
            const scriptPath = path.join(targetDir, `${scriptName}.py`);
            
            // Write generated script
            await fs.promises.writeFile(scriptPath, processedScript)
                .catch(err => {
                    throw new FileSystemError(`Failed to write generated script: ${err.message}`, {
                        originalError: err,
                        context: { scriptPath }
                    });
                });
                
            createdFiles.push(scriptPath);
            
            // Generate default script info
            const defaultScriptInfo: ScriptInfo = {
                id: `script_${Date.now()}`,
                name: path.basename(scriptPath, '.py'),
                version: '1.0.0',
                description: `Script generated from template "${templateName}"`,
                author: 'System',
                category: 'generated',
                tags: ['generated'],
                template: templateName
            };

            // Generate manifest
            let manifest: ScriptManifest;
            try {
                manifest = await this.manifestManager.generateManifest(scriptPath, {
                    ...scriptInfo,
                    script_info: {
                        ...defaultScriptInfo,
                        ...scriptInfo.script_info,
                        template: templateName
                    }
                });
            } catch (error) {
                throw new ValidationError(`Failed to generate manifest: ${(error as Error).message}`, {
                    originalError: error as Error,
                    context: { scriptPath, templateName }
                });
            }
            
            // Save manifest
            const manifestPath = path.join(targetDir, `${manifest.script_info.id}_manifest.json`);
            await this.manifestManager.saveManifest(manifest, manifestPath)
                .catch(err => {
                    throw new FileSystemError(`Failed to save manifest: ${err.message}`, {
                        originalError: err,
                        context: { manifestPath }
                    });
                });
                
            createdFiles.push(manifestPath);
            
            return manifest;
        } catch (error) {
            // Cleanup on failure - remove created files
            if (createdFiles.length > 0) {
                try {
                    for (const file of createdFiles) {
                        if (fs.existsSync(file)) {
                            fs.unlinkSync(file);
                        }
                    }
                } catch (cleanupError) {
                    logError(cleanupError, {
                        operation: 'instantiateTemplate.cleanup',
                        createdFiles
                    });
                }
            }
            
            if (error instanceof AppError) {
                throw error;
            }
            throw wrapError(
                error, 
                ErrorCode.INTERNAL_ERROR,
                `Error instantiating template "${templateName}"`,
                { templateName, targetDir }
            );
        }
    }

    /**
     * Lists all available templates
     * @returns Array of template information objects
     * @throws {FileSystemError} If template directory cannot be read
     */
    public async listTemplates(): Promise<TemplateInfo[]> {
        try {
            // Check if templates directory exists
            if (!fs.existsSync(this.templatesDir)) {
                return []; // Return empty array instead of failing
            }
            
            const templates: TemplateInfo[] = [];
            
            // Read template directory entries
            const entries = await fs.promises.readdir(this.templatesDir, { withFileTypes: true })
                .catch(err => {
                    throw new FileSystemError(`Failed to read templates directory: ${err.message}`, {
                        originalError: err,
                        context: { templatesDir: this.templatesDir }
                    });
                });
            
            // Load each template's info
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    try {
                        const info = await this.loadTemplateInfo(entry.name);
                        templates.push(info);
                    } catch (error) {
                        // Log but continue with other templates
                        logError(error, {
                            operation: 'listTemplates.loadTemplateInfo',
                            templateName: entry.name
                        });
                    }
                }
            }
            
            return templates;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new FileSystemError(`Error listing templates: ${(error as Error).message}`, {
                originalError: error as Error,
                context: { templatesDir: this.templatesDir }
            });
        }
    }

    /**
     * Loads template information from disk
     * @param templateName Name of the template to load
     * @returns Template information object
     * @throws {NotFoundError} If template doesn't exist
     * @throws {FileSystemError} If template info file cannot be read or parsed
     */
    private async loadTemplateInfo(templateName: string): Promise<TemplateInfo> {
        const templateDir = path.join(this.templatesDir, templateName);
        const infoPath = path.join(templateDir, 'template.json');
        
        try {
            // Check if template directory exists
            if (!fs.existsSync(templateDir)) {
                throw new NotFoundError(`Template "${templateName}" not found`, {
                    isUserError: true,
                    context: { templateName, templateDir }
                });
            }
            
            // Check if template info file exists
            if (!fs.existsSync(infoPath)) {
                throw new FileSystemError(`Template info file not found for "${templateName}"`, {
                    context: { templateName, infoPath }
                });
            }
            
            // Read and parse template info
            const content = await fs.promises.readFile(infoPath, 'utf-8')
                .catch(err => {
                    throw new FileSystemError(`Failed to read template info file: ${err.message}`, {
                        originalError: err,
                        context: { infoPath }
                    });
                });
                
            try {
                const info = JSON.parse(content) as TemplateInfo;
                return this.validateLoadedTemplateInfo(info, templateName);
            } catch (parseError) {
                throw new FileSystemError(`Failed to parse template info: ${(parseError as Error).message}`, {
                    originalError: parseError as Error,
                    context: { templateName, infoPath }
                });
            }
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new FileSystemError(`Error loading template "${templateName}": ${(error as Error).message}`, {
                originalError: error as Error,
                context: { templateName }
            });
        }
    }
    
    /**
     * Validates loaded template info object
     * @param info Template info object to validate
     * @param templateName Name of the template for error context
     * @returns Validated template info
     * @throws {ValidationError} If template info is invalid
     */
    private validateLoadedTemplateInfo(info: any, templateName: string): TemplateInfo {
        // Check required properties
        if (!info.name || typeof info.name !== 'string') {
            info.name = templateName; // Use directory name as fallback
        }
        
        if (!info.description || typeof info.description !== 'string') {
            info.description = `Template ${templateName}`; // Use generic description as fallback
        }
        
        // Ensure variables array exists
        if (!Array.isArray(info.variables)) {
            info.variables = [];
        }
        
        // Validate each variable
        info.variables = info.variables.map((variable: any) => {
            if (!variable || typeof variable !== 'object') {
                return {
                    name: 'unknown',
                    description: 'Recovered variable',
                    type: 'string',
                    required: false
                };
            }
            
            // Ensure required properties
            if (!variable.name || typeof variable.name !== 'string') {
                variable.name = `var_${Math.random().toString(36).substring(2, 9)}`;
            }
            
            if (!variable.description || typeof variable.description !== 'string') {
                variable.description = `Variable ${variable.name}`;
            }
            
            if (!variable.type || typeof variable.type !== 'string') {
                variable.type = 'string';
            }
            
            if (typeof variable.required !== 'boolean') {
                variable.required = false;
            }
            
            return variable;
        });
        
        return info as TemplateInfo;
    }

    /**
     * Validates template variables against provided values
     * @param templateVars Template variable definitions
     * @param providedVars Variables provided for instantiation
     * @throws {ValidationError} If validation fails
     */
    private validateTemplateVariables(
        templateVars: TemplateVariable[],
        providedVars: Record<string, any>
    ): void {
        const errors: string[] = [];
        const missingVars: string[] = [];
        const typeErrors: string[] = [];
        
        // Check for required variables and type validation
        for (const templateVar of templateVars) {
            // Check if required variable is missing
            if (templateVar.required && !(templateVar.name in providedVars)) {
                missingVars.push(templateVar.name);
                continue;
            }
            
            // Validate type if variable is provided
            if (templateVar.name in providedVars) {
                const value = providedVars[templateVar.name];
                if (!this.validateVariableType(value, templateVar.type)) {
                    typeErrors.push(
                        `"${templateVar.name}": expected ${templateVar.type}, got ${typeof value}`
                    );
                }
            }
        }
        
        // Check for unknown variables
        const unknownVars = Object.keys(providedVars).filter(
            varName => !templateVars.some(templateVar => templateVar.name === varName)
        );
        
        // Build error messages
        if (missingVars.length > 0) {
            errors.push(`Missing required variables: ${missingVars.join(', ')}`);
        }
        
        if (typeErrors.length > 0) {
            errors.push(`Type validation errors:\n- ${typeErrors.join('\n- ')}`);
        }
        
        if (unknownVars.length > 0) {
            errors.push(`Unknown variables: ${unknownVars.join(', ')}`);
        }
        
        // Throw validation error if any errors found
        if (errors.length > 0) {
            throw new ValidationError(`Template variable validation failed`, {
                isUserError: true,
                technicalDetails: errors.join('\n'),
                context: { 
                    providedVars,
                    templateVars: templateVars.map(v => v.name),
                    missingVars,
                    typeErrors,
                    unknownVars
                }
            });
        }
    }

    /**
     * Validates a variable value against an expected type
     * @param value Value to validate
     * @param expectedType Expected type
     * @returns True if value matches the expected type
     */
    private validateVariableType(value: any, expectedType: string): boolean {
        const type = expectedType.toLowerCase();
        
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null;
            default:
                return true;
        }
    }

    private processScriptTemplate(content: string, variables: TemplateInfo['variables']): string {
        // Ajouter les imports et variables nécessaires
        let processedContent = '#!/usr/bin/env python\n\n';
        processedContent += '"""Script généré à partir d\'un template.\n\n';
        
        // Ajouter la documentation des variables
        for (const variable of variables) {
            processedContent += `${variable.name}: ${variable.type}\n    ${variable.description}\n`;
        }
        
        processedContent += '"""\n\n';
        processedContent += content;
        
        return processedContent;
    }

    private processScriptContent(content: string, variables: Record<string, any>): string {
        let processedContent = content;
        
        // Remplacer les variables dans le contenu
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            processedContent = processedContent.replace(
                new RegExp(placeholder, 'g'),
                String(value)
            );
        }
        
        return processedContent;
    }

    /**
     * Inherits properties and files from a base template
     * @param targetDir Target template directory
     * @param baseTemplateName Base template name to inherit from
     * @throws {NotFoundError} If base template is not found
     * @throws {FileSystemError} If file operations fail
     * @throws {ValidationError} If template validation fails
     */
    private async inheritFromTemplate(
        targetDir: string,
        baseTemplateName: string
    ): Promise<void> {
        const baseTemplateDir = path.join(this.templatesDir, baseTemplateName);
        
        try {
            // Validate parameters
            if (!targetDir || !fs.existsSync(targetDir)) {
                throw new NotFoundError(`Target template directory not found: ${targetDir}`, {
                    context: { targetDir, baseTemplateName }
                });
            }
            
            // Check if base template exists
            if (!fs.existsSync(baseTemplateDir)) {
                throw new NotFoundError(`Base template "${baseTemplateName}" not found`, {
                    isUserError: true,
                    context: { baseTemplateName, baseTemplateDir }
                });
            }
            
            // Load base template info
            let baseInfo: TemplateInfo;
            try {
                baseInfo = await this.loadTemplateInfo(baseTemplateName);
            } catch (error) {
                throw new ValidationError(`Failed to load base template info: ${(error as Error).message}`, {
                    originalError: error as Error,
                    context: { baseTemplateName }
                });
            }
            
            // Load target template info
            let targetInfo: TemplateInfo;
            try {
                const targetInfoPath = path.join(targetDir, 'template.json');
                const targetInfoContent = await fs.promises.readFile(targetInfoPath, 'utf-8')
                    .catch(err => {
                        throw new FileSystemError(`Failed to read target template info: ${err.message}`, {
                            originalError: err,
                            context: { targetInfoPath }
                        });
                    });
                    
                targetInfo = JSON.parse(targetInfoContent);
            } catch (parseError) {
                throw new ValidationError(`Failed to parse target template info: ${(parseError as Error).message}`, {
                    originalError: parseError as Error,
                    context: { targetDir }
                });
            }
            
            // Merge variables from base template
            // Preserve target variables that have the same name as base variables
            const baseVarNames = new Set(baseInfo.variables.map(v => v.name));
            const targetUniqueVars = targetInfo.variables.filter(v => !baseVarNames.has(v.name));
            const mergedVariables = [...baseInfo.variables, ...targetUniqueVars];
            
            // Create backup of target info before modifying
            const backupPath = path.join(targetDir, 'template.json.bak');
            try {
                await fs.promises.copyFile(
                    path.join(targetDir, 'template.json'),
                    backupPath
                );
            } catch (backupError) {
                // Log but continue - backup is optional
                logError(backupError, {
                    operation: 'inheritFromTemplate.backup',
                    targetDir
                });
            }
            
            // Update target info with merged variables
            targetInfo.variables = mergedVariables;
            
            // Save updated template info
            try {
                await fs.promises.writeFile(
                    path.join(targetDir, 'template.json'),
                    JSON.stringify(targetInfo, null, 2)
                );
            } catch (writeError) {
                // Try to restore from backup if save fails
                try {
                    if (fs.existsSync(backupPath)) {
                        await fs.promises.copyFile(
                            backupPath,
                            path.join(targetDir, 'template.json')
                        );
                    }
                } catch (restoreError) {
                    logError(restoreError, {
                        operation: 'inheritFromTemplate.restoreBackup',
                        targetDir
                    });
                }
                
                throw new FileSystemError(`Failed to save updated template info: ${(writeError as Error).message}`, {
                    originalError: writeError as Error,
                    context: { targetDir }
                });
            }
            
            // Copy additional files from base template
            try {
                const files = await fs.promises.readdir(baseTemplateDir);
                for (const file of files) {
                    // Skip template.json and template.py files to avoid overwriting
                    if (file !== 'template.json' && file !== 'template.py') {
                        const sourcePath = path.join(baseTemplateDir, file);
                        const targetPath = path.join(targetDir, file);
                        
                        // Check if source is a file (not a directory)
                        const stats = await fs.promises.stat(sourcePath);
                        if (stats.isFile()) {
                            await fs.promises.copyFile(sourcePath, targetPath);
                        }
                    }
                }
            } catch (copyError) {
                logError(copyError, {
                    operation: 'inheritFromTemplate.copyFiles',
                    baseTemplateDir,
                    targetDir
                });
                
                // Non-critical error - the template inheritance still succeeded
                // with merged variables, but some files may be missing
                throw new FileSystemError(
                    `Template inheritance partially completed. Variables merged, but some files may not have been copied: ${(copyError as Error).message}`,
                    {
                        originalError: copyError as Error,
                        context: { baseTemplateName, targetDir },
                        isUserError: true
                    }
                );
            }
            
            // Clean up backup file if everything succeeded
            if (fs.existsSync(backupPath)) {
                try {
                    fs.unlinkSync(backupPath);
                } catch (cleanupError) {
                    // Just log, don't fail the operation for this
                    logError(cleanupError, {
                        operation: 'inheritFromTemplate.cleanupBackup',
                        backupPath
                    });
                }
            }
            
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw wrapError(
                error,
                ErrorCode.INTERNAL_ERROR,
                `Failed to inherit from template "${baseTemplateName}"`,
                { baseTemplateName, targetDir }
            );
        }
    }
}
