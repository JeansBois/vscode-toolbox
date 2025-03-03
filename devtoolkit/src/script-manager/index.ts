// Core exports
export { ScriptManager } from './manager';
export { ScriptRegistry } from './core/registry';
export { ScriptCache } from './core/cache';
export { ScriptEventManager, ScriptEvent } from './core/events';

// Manifest management
export { ManifestManager } from './manifest/manager';
export { ManifestValidator } from './manifest/validator';

// Dependency management
export { DependencyManager } from './dependency/manager';

// Security
export { SecurityValidator } from './security/validator';
export { PermissionManager } from './security/permissions';
export type { PermissionSet } from './security/permissions';
export { ResourceLimitsManager } from './security/resource-limits';
export type { ResourceLimits } from './security/resource-limits';

// Template management
export { TemplateManager } from './template/manager';

// Types
export type {
    ScriptInfo,
    ScriptExecution,
    ScriptManifest,
    ScriptMetadata,
    ScriptStatus,
    ValidationResult,
    ValidationError,
    InstallResult,
    ExecutionResult,
    ExecutionProgress,
    ExecutionStats,
    DependencyConflict,
    DependencyConflictResult,
    ScriptInterface,
    PathValidationResult
} from './types';

// Execution
export { ExecutionManager } from './execution/manager';
export { ResourceMonitor } from './execution/resource-monitor';
export type { ResourceUsage } from './execution/resource-monitor';
export { ExecutionLogger } from './execution/logger';
export type { LogLevel, LogEntry } from './execution/logger';
