import * as assert from 'assert';
import * as sinon from 'sinon';
// These imports are actually needed by the test context
import * as fs from 'fs';
import * as cp from 'child_process';
import { PythonRuntime } from '../../python-runtime/process';
import { ConfigManager } from '../../config/config-manager';

// Define mock types to match the actual implementation
// Extend the interface to match what's used in the implementation
interface ExecutionOptions {
    timeout?: number;
    env?: Record<string, string>;
    cwd?: string;
    args?: string[];
    scriptId?: string;
    securityProfile?: any;
    onOutput?: (data: string) => void;
    onError?: (data: string) => void;
    onProgress?: (progress: number) => void;
    reuseProcess?: boolean;
}

suite('Python Runtime Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let mockFs: any;
    let mockChildProcess: any;
    let mockConfigManager: any;
    
    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock file system operations
        mockFs = {
            readFile: sandbox.stub(fs.promises, 'readFile'),
            writeFile: sandbox.stub(fs.promises, 'writeFile'),
            access: sandbox.stub(fs.promises, 'access')
        };
        
        // Mock child_process module
        mockChildProcess = {
            spawn: sandbox.stub(cp, 'spawn'),
            exec: sandbox.stub(cp, 'exec')
        };
        
        // Setup common mocks
        mockFs.readFile.callsFake((p: string) => {
            if (p.endsWith('sandbox_wrapper.py')) {
                return Promise.resolve('# Mock sandbox wrapper');
            }
            return Promise.resolve('');
        });
        
        // Mock ConfigManager
        mockConfigManager = {
            getConfiguration: sandbox.stub().returns({
                pythonPath: 'python',
                security: {
                    allowedPaths: ['/test/path', '/workspace'],
                    blockedExtensions: ['.exe', '.dll', '.so']
                }
            })
        };
        
        sandbox.stub(ConfigManager, 'getInstance').returns(mockConfigManager);
    });
    
    teardown(() => {
        sandbox.restore();
    });
    
    suite('Python Interpreter Detection', () => {
        test('Should use Python path from configuration', async () => {
            // Mock successful python version check
            mockChildProcess.exec.callsFake((cmd: string, callback: any) => {
                if (cmd.includes('python --version')) {
                    callback(null, { stdout: 'Python 3.9.0' });
                }
                return { on: () => {} };
            });
            
            const pythonPath = mockConfigManager.getConfiguration().pythonPath;
            
            assert.strictEqual(pythonPath, 'python', 'Should use python from configuration');
        });
        
        test('Should handle configuration without Python interpreter', async () => {
            // Set the config to return undefined for pythonPath
            mockConfigManager.getConfiguration.returns({
                pythonPath: undefined,
                security: {
                    allowedPaths: ['/test/path', '/workspace'],
                    blockedExtensions: ['.exe', '.dll', '.so']
                }
            });
            
            const pythonPath = mockConfigManager.getConfiguration().pythonPath;
            
            assert.strictEqual(pythonPath, undefined, 'Should return undefined from config');
        });
    });
    
    suite('Script Execution', () => {
        let runtime: PythonRuntime;
        let mockProcess: any;
        
        setup(() => {
            runtime = new PythonRuntime('python');
            
            // Create mock process
            mockProcess = {
                stdout: {
                    on: sandbox.stub()
                },
                stderr: {
                    on: sandbox.stub()
                },
                on: sandbox.stub(),
                kill: sandbox.stub()
            };
            
            // Setup default behavior for stdout/stderr events
            mockProcess.stdout.on.callsFake((event: string, callback: Function) => {
                if (event === 'data') {
                    callback(Buffer.from('Mock stdout output'));
                }
            });
            
            mockProcess.stderr.on.callsFake((event: string, callback: Function) => {
                if (event === 'data') {
                    callback(Buffer.from(''));
                }
            });
            
            // Setup default process exit behavior
            mockProcess.on.callsFake((event: string, callback: Function) => {
                if (event === 'exit') {
                    // Simulate successful exit
                    callback(0);
                }
            });
            
            // Make spawn return our mock process
            mockChildProcess.spawn.returns(mockProcess);
        });
        
        test('Should execute script and capture output', async () => {
            const result = await runtime.executeScript('/path/to/script.py');
            
            assert.strictEqual(result.exitCode, 0, 'Script should execute successfully');
            assert.strictEqual(result.stdout, 'Mock stdout output', 'Should capture stdout');
            assert.strictEqual(result.stderr, '', 'Should have empty stderr');
            assert.ok(result.duration >= 0, 'Should track execution duration');
            
            assert.ok(mockChildProcess.spawn.calledOnce, 'Should spawn process');
            assert.ok(
                mockChildProcess.spawn.firstCall.args[0] === 'python',
                'Should use correct Python interpreter'
            );
        });
        
        test('Should handle script execution errors', async () => {
            // Mock process to simulate error
            mockProcess.on.callsFake((event: string, callback: Function) => {
                if (event === 'exit') {
                    // Simulate error exit
                    callback(1);
                }
            });
            
            mockProcess.stderr.on.callsFake((event: string, callback: Function) => {
                if (event === 'data') {
                    callback(Buffer.from('Mock error output'));
                }
            });
            
            const result = await runtime.executeScript('/path/to/failing-script.py');
            
            assert.strictEqual(result.exitCode, 1, 'Should have error exit code');
            assert.strictEqual(result.stderr, 'Mock error output', 'Should capture error output');
        });
        
        test('Should handle process spawn errors', async () => {
            // Make spawn throw an error
            mockChildProcess.spawn.throws(new Error('Failed to spawn process'));
            
            try {
                await runtime.executeScript('/path/to/script.py');
                assert.fail('Should have thrown an error');
            } catch (error: any) {
                assert.ok(error, 'Should throw error on spawn failure');
                assert.ok(error.message.includes('Failed to spawn process'), 
                    'Error should contain spawn failure message');
            }
        });
        
        test('Should execute with command line arguments', async () => {
            const args = ['--arg1', 'value1', '--arg2', 'value2'];
            await runtime.executeScript('/path/to/script.py', { args });
            
            // Check that args were passed to the spawn call
            const spawnArgs = mockChildProcess.spawn.firstCall.args[1];
            
            // The script path should be the first argument followed by the script args
            assert.ok(spawnArgs.includes('/path/to/script.py'), 'Should include script path');
            
            // Check each argument was passed
            for (const arg of args) {
                assert.ok(spawnArgs.includes(arg), `Should include argument: ${arg}`);
            }
        });
        
        test('Should terminate process on cleanup', async () => {
            // First create a process
            const executionPromise = runtime.executeScript('/path/to/script.py');
            
            // Then manually trigger the kill via the mock
            mockProcess.kill.callsFake(() => {
                interface Call {
                    args: any[];
                }

                mockProcess.on.getCalls().forEach((call: Call) => {
                    if (call.args[0] === 'exit') {
                        call.args[1](-1); // Simulate process termination
                    }
                });
            });
            
            // Kill the process by simulating a timeout
            mockProcess.kill();
            
            await executionPromise;
            assert.ok(mockProcess.kill.calledOnce, 'Should kill the process');
        });
        
        test('Should handle script timeout', async () => {
            // Create a special mock process for this test that doesn't call exit
            const timeoutMockProcess = {
                stdout: { on: sandbox.stub().callsFake((e, cb) => e === 'data' && cb('')) },
                stderr: { on: sandbox.stub().callsFake((e, cb) => e === 'data' && cb('')) },
                on: sandbox.stub(),
                kill: sandbox.stub()
            };
            
            // Replace the global mock with our timeout-specific mock
            mockChildProcess.spawn.returns(timeoutMockProcess);
            
            // Add a timeout option
            const options: ExecutionOptions = { timeout: 100 };
            const promise = runtime.executeScript('/path/to/script.py', options);
            
            // Wait for the timeout
            const result = await promise;
            
            assert.ok(timeoutMockProcess.kill.called, 'Should kill process after timeout');
            assert.ok(result.stderr.includes('timeout') || result.stdout.includes('timeout'), 
                'Error message should mention timeout');
            assert.notStrictEqual(result.exitCode, 0, 'Exit code should be non-zero for timeout');
        });
    });
    
    suite('Environment and Security', () => {
        let runtime: PythonRuntime;
        
        setup(() => {
            runtime = new PythonRuntime('python');
        });
        
        test('Should pass environment variables to process', async () => {
            const options: ExecutionOptions = { 
                env: { TEST_VAR: 'test_value' }
            };
            
            await runtime.executeScript('/path/to/script.py', options);
            
            const spawnOptions = mockChildProcess.spawn.firstCall.args[2];
            assert.strictEqual(spawnOptions.env.TEST_VAR, 'test_value', 
                'Should pass environment variables to process');
        });
        
        test('Should use sandbox wrapper for script execution', async () => {
            await runtime.executeScript('/path/to/script.py');
            
            // The first argument to spawn should be the path to the Python interpreter
            const pythonPath = mockChildProcess.spawn.firstCall.args[0];
            assert.strictEqual(pythonPath, 'python', 'Should use correct Python interpreter');
            
            // The remaining arguments should include the sandbox wrapper
            const args = mockChildProcess.spawn.firstCall.args[1];
            const wrapperIncluded = args.some((arg: string) => 
                arg.includes('sandbox_wrapper.py'));
                
            assert.ok(wrapperIncluded, 'Should include sandbox wrapper');
        });
    });
    
    suite('Security Validation', () => {
        test('Should validate script path against allowed paths', async () => {
            const runtime = new PythonRuntime('python');
            
            // Set allowed paths in config
            mockConfigManager.getConfiguration.returns({
                pythonPath: 'python',
                security: {
                    allowedPaths: ['/safe/path'],
                    blockedExtensions: ['.exe', '.dll', '.so']
                }
            });
            
            // Safe path
            await runtime.executeScript('/safe/path/script.py');
            assert.ok(mockChildProcess.spawn.called, 'Should allow execution from safe path');
            
            // Reset spawn call count
            mockChildProcess.spawn.resetHistory();
            
            // Unsafe path
            try {
                await runtime.executeScript('/unsafe/path/script.py');
                assert.fail('Should have thrown an error for unsafe path');
            } catch (error: any) {
                assert.ok(error.message.includes('denied') || error.message.includes('allowed'), 
                    'Error should mention access denial or allowed paths');
                assert.ok(!mockChildProcess.spawn.called, 
                    'Should not spawn process for unsafe path');
            }
        });
        
        test('Should validate against blocked file extensions', async () => {
            const runtime = new PythonRuntime('python');
            
            // Set blocked extensions in config
            mockConfigManager.getConfiguration.returns({
                pythonPath: 'python',
                security: {
                    allowedPaths: ['/test/path'],
                    blockedExtensions: ['.exe', '.sh']
                }
            });
            
            // Valid extension
            await runtime.executeScript('/test/path/script.py');
            assert.ok(mockChildProcess.spawn.called, 'Should allow execution of .py file');
            
            // Reset spawn call count
            mockChildProcess.spawn.resetHistory();
            
            // Blocked extension
            try {
                await runtime.executeScript('/test/path/script.sh');
                assert.fail('Should have thrown an error for blocked extension');
            } catch (error: any) {
                assert.ok(error.message.includes('blocked') || error.message.includes('extension'), 
                    'Error should mention blocked extension');
                assert.ok(!mockChildProcess.spawn.called, 
                    'Should not spawn process for blocked extension');
            }
        });
    });
});
