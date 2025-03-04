import * as vscode from 'vscode';

// Dedicated output channel for centralized error logging
let outputChannel: vscode.OutputChannel | undefined;

/**
 * Gets or creates the extension output channel for logging
 */
export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('DevToolkit');
  }
  return outputChannel;
}

/**
 * Error codes for categorizing different error types
 */
export enum ErrorCode {
  // User errors (4xx range)
  INVALID_INPUT = 'ERR_400',
  VALIDATION_FAILED = 'ERR_401',
  PERMISSION_DENIED = 'ERR_403',
  NOT_FOUND = 'ERR_404',
  INVALID_CONFIGURATION = 'ERR_405',
  
  // System errors (5xx range)
  INTERNAL_ERROR = 'ERR_500',
  PYTHON_RUNTIME_ERROR = 'ERR_501',
  RESOURCE_LIMIT_EXCEEDED = 'ERR_502',
  FILESYSTEM_ERROR = 'ERR_503',
  EXECUTION_TIMEOUT = 'ERR_504',
  DEPENDENCY_ERROR = 'ERR_505',
  NETWORK_ERROR = 'ERR_506',
  SECURITY_VIOLATION = 'ERR_507'
}

/**
 * Base error class with enhanced properties for standardized error handling
 */
export class AppError extends Error {
  code: string;
  timestamp: Date;
  technicalDetails?: string;
  originalError?: Error;
  context?: Record<string, any>;
  isUserError: boolean;
  
  constructor(
    code: ErrorCode, 
    message: string, 
    options: {
      isUserError?: boolean;
      technicalDetails?: string;
      originalError?: Error | unknown;
      context?: Record<string, any>;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();
    this.isUserError = options.isUserError ?? false;
    this.technicalDetails = options.technicalDetails;
    
    // Handle original error, even if it's not an Error instance
    if (options.originalError) {
      if (options.originalError instanceof Error) {
        this.originalError = options.originalError;
      } else {
        this.originalError = new Error(String(options.originalError));
      }
    }
    
    this.context = options.context;
    
    // Preserve stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      technicalDetails: this.technicalDetails,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
      originalError: this.originalError ? {
        message: this.originalError.message,
        stack: this.originalError.stack,
      } : undefined
    };
  }
  
  /**
   * Returns a formatted string representation of the error
   */
  toString(): string {
    let result = `[${this.code}] ${this.message}`;
    
    if (this.technicalDetails) {
      result += `\nDetails: ${this.technicalDetails}`;
    }
    
    if (this.context) {
      result += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
    }
    
    return result;
  }
}

/**
 * User errors are errors caused by user actions and typically can be resolved by the user
 */
export class UserError extends AppError {
  constructor(
    code: ErrorCode, 
    message: string, 
    options: Omit<ConstructorParameters<typeof AppError>[2], 'isUserError'> = {}
  ) {
    super(code, message, { ...options, isUserError: true });
  }
}

/**
 * System errors are errors caused by system failures and typically require developer intervention
 */
export class SystemError extends AppError {
  constructor(
    code: ErrorCode, 
    message: string, 
    options: Omit<ConstructorParameters<typeof AppError>[2], 'isUserError'> = {}
  ) {
    super(code, message, { ...options, isUserError: false });
  }
}

/**
 * Specific error types for common scenarios
 */
export class ValidationError extends UserError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof UserError>[2], 'code'> = {}
  ) {
    super(ErrorCode.VALIDATION_FAILED, message, options);
  }
}

export class NotFoundError extends UserError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof UserError>[2], 'code'> = {}
  ) {
    super(ErrorCode.NOT_FOUND, message, options);
  }
}

export class PythonRuntimeError extends SystemError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof SystemError>[2], 'code'> = {}
  ) {
    super(ErrorCode.PYTHON_RUNTIME_ERROR, message, options);
  }
}

export class ResourceLimitError extends SystemError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof SystemError>[2], 'code'> = {}
  ) {
    super(ErrorCode.RESOURCE_LIMIT_EXCEEDED, message, options);
  }
}

export class FileSystemError extends SystemError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof SystemError>[2], 'code'> = {}
  ) {
    super(ErrorCode.FILESYSTEM_ERROR, message, options);
  }
}

export class DependencyError extends SystemError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof SystemError>[2], 'code'> = {}
  ) {
    super(ErrorCode.DEPENDENCY_ERROR, message, options);
  }
}

export class TimeoutError extends SystemError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof SystemError>[2], 'code'> = {}
  ) {
    super(ErrorCode.EXECUTION_TIMEOUT, message, options);
  }
}

/**
 * Error thrown when a security violation is detected
 */
export class SecurityError extends SystemError {
  constructor(
    message: string, 
    options: Omit<ConstructorParameters<typeof SystemError>[2], 'code'> = {}
  ) {
    super(ErrorCode.SECURITY_VIOLATION, message, options);
  }
}

/**
 * Helper function to log errors with proper formatting and context
 */
export function logError(error: unknown, context?: Record<string, any>): void {
  const formattedError = formatError(error, context);
  const channel = getOutputChannel();
  
  if (formattedError instanceof AppError && formattedError.isUserError) {
    // User errors are typically less severe
    console.warn(`[USER ERROR] ${formattedError.toString()}`);
    channel.appendLine(`[USER ERROR] ${formattedError.toString()}`);
  } else {
    // System errors are more severe
    console.error(`[SYSTEM ERROR] ${JSON.stringify(formattedError.toJSON(), null, 2)}`);
    channel.appendLine(`[SYSTEM ERROR] ${JSON.stringify(formattedError.toJSON(), null, 2)}`);
    channel.show(true); // Show the channel for system errors (second param true = preserve focus)
  }
}

/**
 * Helper function to wrap an unknown error into an AppError
 */
export function wrapError(
  error: unknown, 
  defaultCode: ErrorCode = ErrorCode.INTERNAL_ERROR, 
  defaultMessage: string = 'An unexpected error occurred',
  context?: Record<string, any>
): AppError {
  // If it's already an AppError, just add the context if provided
  if (error instanceof AppError) {
    if (context) {
      error.context = { ...error.context, ...context };
    }
    return error;
  }
  
  // If it's an Error but not AppError, wrap it
  if (error instanceof Error) {
    return new AppError(defaultCode, error.message, {
      originalError: error,
      context,
      technicalDetails: error.stack
    });
  }
  
  // If it's a string, use it as the message
  if (typeof error === 'string') {
    return new AppError(defaultCode, error, { context });
  }
  
  // For anything else, use the default message
  return new AppError(defaultCode, defaultMessage, {
    context,
    technicalDetails: `Unknown error type: ${typeof error}`
  });
}

/**
 * Helper function to format an error for display or logging
 */
export function formatError(error: unknown, context?: Record<string, any>): AppError {
  return wrapError(error, ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred', context);
}

/**
 * Helper function to determine if an error is a user error
 */
export function isUserError(error: unknown): boolean {
  return error instanceof AppError && error.isUserError;
}

/**
 * Shows an error message to the user with proper formatting
 */
export function showErrorMessage(error: unknown): void {
  const formattedError = formatError(error);
  
  if (isUserError(formattedError)) {
    // For user errors, show only the friendly message
    vscode.window.showErrorMessage(formattedError.message);
  } else {
    // For system errors, include the code and optional details
    const message = `[${formattedError.code}] ${formattedError.message}`;
    vscode.window.showErrorMessage(message, 'Show Details').then(selection => {
      if (selection === 'Show Details') {
        // Show more details in output channel for technical users
        const channel = getOutputChannel();
        // Add a separator for better readability
        channel.appendLine('\n-------------------------------------------');
        channel.appendLine(`DETAILED ERROR: ${new Date().toLocaleString()}`);
        channel.appendLine('-------------------------------------------');
        channel.appendLine(JSON.stringify(formattedError.toJSON(), null, 2));
        channel.show();
      }
    });
  }
}

/**
 * Helper function to create a custom error from an error code
 */
export function createErrorFromCode(
  code: ErrorCode, 
  message: string, 
  options: Omit<ConstructorParameters<typeof AppError>[2], 'code'> = {}
): AppError {
  // UserError codes are in the 4xx range
  const isUserErrorCode = code.startsWith('ERR_4');
  
  if (isUserErrorCode) {
    return new UserError(code, message, options);
  } else {
    return new SystemError(code, message, options);
  }
}
