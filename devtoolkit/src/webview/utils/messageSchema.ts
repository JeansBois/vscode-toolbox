/**
 * Message validation schema system for WebView <-> Extension communication
 * 
 * This file provides a centralized system for:
 * - Type definitions for all message types
 * - Schema validation for runtime type checking
 * - Validation utility functions
 */

// Base interface for all messages
export interface BaseMessage {
    type: string;
}

// Extension to WebView message types
export interface ScriptSelectedMessage extends BaseMessage {
    type: 'script-selected';
    scriptId: string;
}

export interface ScriptExecutionStartMessage extends BaseMessage {
    type: 'script-execution-start';
    scriptId: string;
}

export interface ScriptExecutionCompleteMessage extends BaseMessage {
    type: 'script-execution-complete';
    scriptId: string;
    success: boolean;
    result?: any;
}

export interface ScriptExecutionErrorMessage extends BaseMessage {
    type: 'script-execution-error';
    scriptId: string;
    error: string;
}

export interface FilesUpdatedMessage extends BaseMessage {
    type: 'files-updated';
    paths: string[];
    action: 'select' | 'deselect';
}

export interface NotificationMessage extends BaseMessage {
    type: 'error' | 'success' | 'warning' | 'info';
    message: string;
}

export interface ProgressUpdateMessage extends BaseMessage {
    type: 'progress-update';
    progress: number;
    message?: string;
}

export interface UpdateScriptsMessage extends BaseMessage {
    type: 'update-scripts';
    scripts: any[]; // Define proper script type later
}

export interface UpdateFilesMessage extends BaseMessage {
    type: 'update-files';
    files: any[]; // Define proper file type later
}

// WebView to Extension message types
export interface ScriptMessage extends BaseMessage {
    type: 'script';
    action: 'select' | 'execute' | 'cancel';
    scriptId: string;
    config?: Record<string, unknown>;
    files?: string[];
}

export interface FileMessage extends BaseMessage {
    type: 'file';
    action: 'select' | 'deselect';
    paths: string[];
}

export interface ThemeMessage extends BaseMessage {
    type: 'theme';
    theme: 'dark' | 'light' | 'high-contrast';
}

export interface AlertMessage extends BaseMessage {
    type: 'alert';
    command: 'alert';
    text: string;
}

// Union types for all messages
// Keeping the original WebviewMessage type for backward compatibility
export type WebviewMessage = 
    | ScriptMessage 
    | FileMessage 
    | ThemeMessage;

export type WebviewToExtensionMessage = 
    | ScriptMessage 
    | FileMessage 
    | ThemeMessage 
    | AlertMessage;

export type ExtensionToWebviewMessage = 
    | ScriptSelectedMessage
    | ScriptExecutionStartMessage
    | ScriptExecutionCompleteMessage
    | ScriptExecutionErrorMessage
    | FilesUpdatedMessage
    | NotificationMessage
    | ProgressUpdateMessage
    | UpdateScriptsMessage
    | UpdateFilesMessage;

// Schema definition interface
export interface MessageSchema {
    requiredProps: string[];
    propValidators: { 
        [prop: string]: (value: any) => boolean 
    };
    maxLength?: { 
        [prop: string]: number 
    };
}

// Schema repository
export const schemas: Record<string, MessageSchema> = {
    // WebView to Extension message schemas
    'script': {
        requiredProps: ['type', 'action', 'scriptId'],
        propValidators: {
            'type': (val) => val === 'script',
            'action': (val) => typeof val === 'string' && ['select', 'execute', 'cancel'].includes(val),
            'scriptId': (val) => typeof val === 'string' && val.length > 0,
            'config': (val) => !val || (typeof val === 'object' && val !== null),
            'files': (val) => !val || (Array.isArray(val) && val.every(f => typeof f === 'string'))
        },
        maxLength: {
            'scriptId': 100,
            'files': 100 // Maximum number of files
        }
    },
    'file': {
        requiredProps: ['type', 'action', 'paths'],
        propValidators: {
            'type': (val) => val === 'file',
            'action': (val) => typeof val === 'string' && ['select', 'deselect'].includes(val),
            'paths': (val) => Array.isArray(val) && val.every(p => typeof p === 'string')
        },
        maxLength: {
            'paths': 100 // Maximum number of paths
        }
    },
    'theme': {
        requiredProps: ['type', 'theme'],
        propValidators: {
            'type': (val) => val === 'theme',
            'theme': (val) => typeof val === 'string' && ['dark', 'light', 'high-contrast'].includes(val)
        }
    },
    'alert': {
        requiredProps: ['type', 'command', 'text'],
        propValidators: {
            'type': (val) => val === 'alert',
            'command': (val) => val === 'alert',
            'text': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'text': 1000 // Maximum length of alert text
        }
    },
    
    // Extension to WebView message schemas
    'script-selected': {
        requiredProps: ['type', 'scriptId'],
        propValidators: {
            'type': (val) => val === 'script-selected',
            'scriptId': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'scriptId': 100
        }
    },
    'script-execution-start': {
        requiredProps: ['type', 'scriptId'],
        propValidators: {
            'type': (val) => val === 'script-execution-start',
            'scriptId': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'scriptId': 100
        }
    },
    'script-execution-complete': {
        requiredProps: ['type', 'scriptId', 'success'],
        propValidators: {
            'type': (val) => val === 'script-execution-complete',
            'scriptId': (val) => typeof val === 'string' && val.length > 0,
            'success': (val) => typeof val === 'boolean',
            'result': (val) => !val || typeof val === 'object'
        },
        maxLength: {
            'scriptId': 100
        }
    },
    'script-execution-error': {
        requiredProps: ['type', 'scriptId', 'error'],
        propValidators: {
            'type': (val) => val === 'script-execution-error',
            'scriptId': (val) => typeof val === 'string' && val.length > 0,
            'error': (val) => typeof val === 'string'
        },
        maxLength: {
            'scriptId': 100,
            'error': 1000
        }
    },
    'files-updated': {
        requiredProps: ['type', 'paths', 'action'],
        propValidators: {
            'type': (val) => val === 'files-updated',
            'paths': (val) => Array.isArray(val) && val.every(p => typeof p === 'string'),
            'action': (val) => typeof val === 'string' && ['select', 'deselect'].includes(val)
        },
        maxLength: {
            'paths': 100
        }
    },
    'error': {
        requiredProps: ['type', 'message'],
        propValidators: {
            'type': (val) => val === 'error',
            'message': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'message': 1000
        }
    },
    'success': {
        requiredProps: ['type', 'message'],
        propValidators: {
            'type': (val) => val === 'success',
            'message': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'message': 1000
        }
    },
    'warning': {
        requiredProps: ['type', 'message'],
        propValidators: {
            'type': (val) => val === 'warning',
            'message': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'message': 1000
        }
    },
    'info': {
        requiredProps: ['type', 'message'],
        propValidators: {
            'type': (val) => val === 'info',
            'message': (val) => typeof val === 'string' && val.length > 0
        },
        maxLength: {
            'message': 1000
        }
    },
    'progress-update': {
        requiredProps: ['type', 'progress'],
        propValidators: {
            'type': (val) => val === 'progress-update',
            'progress': (val) => typeof val === 'number' && val >= 0 && val <= 100,
            'message': (val) => !val || typeof val === 'string'
        },
        maxLength: {
            'message': 500
        }
    },
    'update-scripts': {
        requiredProps: ['type', 'scripts'],
        propValidators: {
            'type': (val) => val === 'update-scripts',
            'scripts': (val) => Array.isArray(val)
        }
    },
    'update-files': {
        requiredProps: ['type', 'files'],
        propValidators: {
            'type': (val) => val === 'update-files',
            'files': (val) => Array.isArray(val)
        }
    }
};

// Schema for default message structure
const baseSchema: MessageSchema = {
    requiredProps: ['type'],
    propValidators: {
        'type': (val) => typeof val === 'string' && val.length > 0
    }
};

/**
 * Validate a message against its schema
 * @param message The message to validate
 * @param type Message type (if not provided, extracted from message)
 * @returns Validation result with error details if applicable
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateMessage(message: any, type?: string): ValidationResult {
    const result: ValidationResult = { 
        valid: true, 
        errors: [] 
    };

    // Basic validation
    if (!message || typeof message !== 'object') {
        result.valid = false;
        result.errors.push('Message must be an object');
        return result;
    }

    // Validate against base schema
    if (!validateAgainstSchema(message, baseSchema, result)) {
        return result;
    }

    // Determine message type if not provided
    const messageType = type || message.type;
    if (!messageType) {
        result.valid = false;
        result.errors.push('Message type is required');
        return result;
    }

    // Validate against specific schema if it exists
    const schema = schemas[messageType];
    if (!schema) {
        result.valid = false;
        result.errors.push(`Unknown message type: ${messageType}`);
        return result;
    }

    validateAgainstSchema(message, schema, result);
    return result;
}

/**
 * Validate a message against a specific schema
 * @param message The message to validate
 * @param schema The schema to validate against
 * @param result The validation result to update
 * @returns Whether validation passed (for early termination)
 */
function validateAgainstSchema(
    message: any, 
    schema: MessageSchema, 
    result: ValidationResult
): boolean {
    // Check required properties
    for (const prop of schema.requiredProps) {
        if (message[prop] === undefined) {
            result.valid = false;
            result.errors.push(`Required property missing: ${prop}`);
        }
    }

    // If required properties are missing, don't continue with validation
    if (!result.valid) {
        return false;
    }

    // Validate property types and values
    for (const [prop, validator] of Object.entries(schema.propValidators)) {
        if (message[prop] !== undefined && !validator(message[prop])) {
            result.valid = false;
            result.errors.push(`Property validation failed: ${prop}`);
        }
    }

    // Check max lengths for strings and arrays
    if (schema.maxLength) {
        for (const [prop, maxLen] of Object.entries(schema.maxLength)) {
            const value = message[prop];
            if (value) {
                if (typeof value === 'string' && value.length > maxLen) {
                    result.valid = false;
                    result.errors.push(`Property '${prop}' exceeds max length: ${value.length}/${maxLen}`);
                } else if (Array.isArray(value) && value.length > maxLen) {
                    result.valid = false;
                    result.errors.push(`Property '${prop}' exceeds max items: ${value.length}/${maxLen}`);
                }
            }
        }
    }

    return result.valid;
}

/**
 * Sanitize a message according to its schema - removes unknown properties
 * @param message Message to sanitize
 * @param type Message type
 * @returns Sanitized message
 */
export function sanitizeMessage<T extends BaseMessage>(message: any, type: string): T {
    const schema = schemas[type];
    if (!schema) {
        return message as T;
    }

    const sanitized: any = { type };
    
    // Copy only properties defined in the schema
    const allowedProps = ['type', ...Object.keys(schema.propValidators)];
    for (const prop of allowedProps) {
        if (message[prop] !== undefined) {
            sanitized[prop] = message[prop];
        }
    }
    
    return sanitized as T;
}

/**
 * Create a message with schema validation
 * @param type Message type
 * @param data Message data
 * @returns Validated message or null if invalid
 */
export function createMessage<T extends BaseMessage>(type: string, data: Omit<T, 'type'>): T | null {
    const message = { type, ...data };
    const result = validateMessage(message, type);
    
    if (!result.valid) {
        console.error('Invalid message creation:', result.errors);
        return null;
    }
    
    return sanitizeMessage<T>(message, type);
}
