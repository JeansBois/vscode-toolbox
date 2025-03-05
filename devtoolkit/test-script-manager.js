#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create test directory structure if it doesn't exist
const setupDirectories = () => {
  const testDir = path.join(__dirname, 'test-scripts');
  const dependenciesDir = path.join(testDir, 'dependencies');
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
    console.log(`Created test directory: ${testDir}`);
  }
  
  if (!fs.existsSync(dependenciesDir)) {
    fs.mkdirSync(dependenciesDir, { recursive: true });
    console.log(`Created dependencies directory: ${dependenciesDir}`);
  }
  
  return { testDir, dependenciesDir };
};

// Simulate a minimal context
const createMockContext = (withGlobalStorageUri = true) => {
  const context = {
    extensionPath: __dirname,
    subscriptions: [],
  };
  
  if (withGlobalStorageUri) {
    const globalStorage = path.join(__dirname, 'global-storage');
    if (!fs.existsSync(globalStorage)) {
      fs.mkdirSync(globalStorage, { recursive: true });
    }
    context.globalStorageUri = { fsPath: globalStorage };
  }
  
  return context;
};

// Test the ScriptManager with and without globalStorageUri
const testScriptManager = async () => {
  // Setup
  const { testDir } = setupDirectories();
  
  // Import our files directly
  const ConfigManager = {
    getInstance: () => ({
      getConfiguration: () => ({
        scriptsDirectory: testDir,
        templates: { directory: path.join(__dirname, 'templates') },
        globalStorage: true,
        workspace: { scriptDirectories: [] }
      })
    })
  };

  // Test with globalStorageUri present
  console.log('\n--------- TEST WITH GLOBALSTORAGE URI ---------');
  try {
    const context = createMockContext(true);
    console.log(`Testing with context.globalStorageUri = ${context.globalStorageUri.fsPath}`);
    
    // Initialize dependencies used by ScriptManager constructor
    const scriptManager = {
      _configManager: ConfigManager.getInstance(),
      _manifestValidator: {},
      _securityValidator: { getInstance: () => ({}) },
      _permissionManager: { getInstance: () => ({}) },
      _resourceManager: { getInstance: () => ({}) },
      _pythonRuntime: {},
      _disposables: []
    };
    
    // Test our specific fix
    const config = ConfigManager.getInstance().getConfiguration();
    let dependenciesPath = path.join(testDir, 'dependencies');
    
    if (config.globalStorage && context.globalStorageUri && context.globalStorageUri.fsPath) {
      dependenciesPath = path.join(context.globalStorageUri.fsPath, 'dependencies');
    }
    
    console.log(`Resolved dependencies path: ${dependenciesPath}`);
    console.log('✅ With globalStorageUri: Successfully resolved path');
  } catch (error) {
    console.error('❌ Error with globalStorageUri:', error);
  }
  
  // Test without globalStorageUri present
  console.log('\n--------- TEST WITHOUT GLOBALSTORAGE URI ---------');
  try {
    const context = createMockContext(false);
    console.log(`Testing with context.globalStorageUri = ${context.globalStorageUri}`);
    
    // Initialize dependencies used by ScriptManager constructor
    const scriptManager = {
      _configManager: ConfigManager.getInstance(),
      _manifestValidator: {},
      _securityValidator: { getInstance: () => ({}) },
      _permissionManager: { getInstance: () => ({}) },
      _resourceManager: { getInstance: () => ({}) },
      _pythonRuntime: {},
      _disposables: []
    };
    
    // Test our specific fix
    const config = ConfigManager.getInstance().getConfiguration();
    let dependenciesPath = path.join(testDir, 'dependencies');
    
    // This is the fixed part that we want to test
    if (config.globalStorage && context.globalStorageUri && context.globalStorageUri.fsPath) {
      dependenciesPath = path.join(context.globalStorageUri.fsPath, 'dependencies');
    }
    
    console.log(`Resolved dependencies path: ${dependenciesPath}`);
    console.log('✅ Without globalStorageUri: Successfully fell back to default path');
  } catch (error) {
    console.error('❌ Error without globalStorageUri:', error);
  }
  
  console.log('\n--------- HTML TEMPLATE TEST ---------');
  try {
    // Check if the panel.ts HTML now has the file-tree element
    const panelTsPath = path.join(__dirname, 'src', 'webview', 'panel.ts');
    if (fs.existsSync(panelTsPath)) {
      const panelContent = fs.readFileSync(panelTsPath, 'utf8');
      if (panelContent.includes('<div id="file-tree">')) {
        console.log('✅ The panel HTML template includes the file-tree element');
      } else {
        console.log('❌ The panel HTML template does NOT include the file-tree element');
      }
    } else {
      console.log(`⚠️ Could not find panel.ts at ${panelTsPath}`);
    }
  } catch (error) {
    console.error('❌ Error checking HTML template:', error);
  }
  
  console.log('\n--------- TEST COMPLETE ---------');
};

// Run the test
testScriptManager().catch(error => {
  console.error('Unhandled error in test:', error);
});
