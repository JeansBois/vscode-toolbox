import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // Le dossier contenant le package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        
        // Le dossier contenant les tests
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Configuration de NYC pour la couverture de code
        const nycConfig = {
            include: [
                'src/**/*.ts',
                'src/**/*.tsx'
            ],
            exclude: [
                'src/test/**',
                'out/**',
                'coverage/**'
            ],
            reporter: ['text', 'html'],
            'report-dir': './coverage',
            all: true
        };

        // Exécuter les tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions',
                '--disable-gpu'
            ],
            extensionTestsEnv: {
                NYC_CONFIG: JSON.stringify(nycConfig),
                NODE_ENV: 'test'
            }
        });
    } catch (err) {
        console.error('Erreur lors de l\'exécution des tests:', err);
        process.exit(1);
    }
}

// Point d'entrée principal
main();
