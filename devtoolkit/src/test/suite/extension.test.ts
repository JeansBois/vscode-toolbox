import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

suite('Extension Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

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
