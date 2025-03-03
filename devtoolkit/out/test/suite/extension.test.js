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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const sinon = __importStar(require("sinon"));
suite('Extension Test Suite', () => {
    let sandbox;
    setup(() => {
        sandbox = sinon.createSandbox();
    });
    teardown(() => {
        sandbox.restore();
    });
    test('Extension devrait s\'activer', async () => {
        const extension = vscode.extensions.getExtension('devtoolkit.devtoolkit');
        assert.ok(extension);
        await extension?.activate();
        assert.strictEqual(extension?.isActive, true);
    });
    test('Les commandes devraient être enregistrées', () => {
        return vscode.commands.getCommands(true).then((commands) => {
            const devToolkitCommands = commands.filter(cmd => cmd.startsWith('devtoolkit.'));
            assert.ok(devToolkitCommands.includes('devtoolkit.openPanel'));
            assert.ok(devToolkitCommands.includes('devtoolkit.runScript'));
            assert.ok(devToolkitCommands.includes('devtoolkit.addToChecklist'));
        });
    });
});
//# sourceMappingURL=extension.test.js.map