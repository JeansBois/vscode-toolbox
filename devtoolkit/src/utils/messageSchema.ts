/**
 * Validation result interface
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Standard message interface for script operations
 */
export interface ScriptMessage {
    type: 'script';
    action: 'execute' | 'cancel' | 'select';
    scriptId: string;
    params?: Record<string, any>;
}

/**
 * Interface for file operations
 */
export interface FileMessage {
    type: 'file';
    action: 'select' | 'deselect';
    paths: string[];
}

/**
 * Validates a message against a schema
 * @param message Message to validate
 * @param type Expected message type
 * @returns Validation result
 */
export function validateMessage(message: any, type: string): ValidationResult {
    const errors: string[] = [];
    
    if (!message) {
        errors.push('Message is null or undefined');
        return { valid: false, errors };
    }
    
    // Common validation for all message types
    if (typeof message !== 'object') {
        errors.push('Message must be an object');
        return { valid: false, errors };
    }
    
    if (message.type !== type) {
        errors.push(`Message type must be "${type}", got "${message.type}"`);
    }
    
    // Type-specific validation
    switch (type) {
        case 'script':
            validateScriptMessage(message, errors);
            break;
        case 'file':
            validateFileMessage(message, errors);
            break;
        case 'alert':
            if (!message.text || typeof message.text !== 'string') {
                errors.push('Alert message must have a "text" property of type string');
            }
            break;
        case 'theme':
            if (!message.theme || typeof message.theme !== 'string') {
                errors.push('Theme message must have a "theme" property of type string');
            }
            break;
        case 'form':
            if (!message.formId || typeof message.formId !== 'string') {
                errors.push('Form message must have a "formId" property of type string');
            }
            if (!message.values || typeof message.values !== 'object') {
                errors.push('Form message must have a "values" property of type object');
            }
            break;
        default:
            errors.push(`Unknown message type: ${type}`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates a script message
 */
function validateScriptMessage(message: any, errors: string[]): void {
    if (!message.action) {
        errors.push('Script message must have an "action" property');
    } else if (!['execute', 'cancel', 'select'].includes(message.action)) {
        errors.push(`Invalid script action: ${message.action}`);
    }
    
    if (!message.scriptId || typeof message.scriptId !== 'string') {
        errors.push('Script message must have a "scriptId" property of type string');
    }
    
    if (message.action === 'execute' && message.params) {
        if (typeof message.params !== 'object') {
            errors.push('Script params must be an object');
        }
    }
}

/**
 * Validates a file message
 */
function validateFileMessage(message: any, errors: string[]): void {
    if (!message.action) {
        errors.push('File message must have an "action" property');
    } else if (!['select', 'deselect'].includes(message.action)) {
        errors.push(`Invalid file action: ${message.action}`);
    }
    
    if (!message.paths || !Array.isArray(message.paths)) {
        errors.push('File message must have a "paths" property of type array');
    } else if (message.paths.some((path: string) => typeof path !== 'string')) {
        errors.push('All paths must be strings');
    }
}