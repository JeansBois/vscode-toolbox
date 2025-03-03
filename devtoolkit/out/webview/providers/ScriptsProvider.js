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
exports.ScriptsProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class ScriptsProvider {
    constructor(scriptManager, workspaceRoot) {
        this.scriptManager = scriptManager;
        this.workspaceRoot = workspaceRoot;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!this.workspaceRoot) {
            return Promise.resolve([]);
        }
        if (element) {
            return Promise.resolve([]);
        }
        else {
            const scripts = await this.scriptManager.listScripts();
            return scripts.map(script => new ScriptItem(path.basename(script), script, vscode.TreeItemCollapsibleState.None, {
                command: 'devtoolkit.runScript',
                title: 'Exécuter le script',
                arguments: [script]
            }));
        }
    }
}
exports.ScriptsProvider = ScriptsProvider;
class ScriptItem extends vscode.TreeItem {
    constructor(label, scriptPath, collapsibleState, command) {
        super(label, collapsibleState);
        this.label = label;
        this.scriptPath = scriptPath;
        this.collapsibleState = collapsibleState;
        this.command = command;
        this.contextValue = 'script';
        this.tooltip = scriptPath;
        this.description = path.relative(vscode.workspace.rootPath || '', scriptPath);
        this.iconPath = new vscode.ThemeIcon('symbol-method');
    }
}
//# sourceMappingURL=ScriptsProvider.js.map