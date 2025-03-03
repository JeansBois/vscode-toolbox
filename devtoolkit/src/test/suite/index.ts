import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';
import { promisify } from 'util';

const globPromise = promisify(glob) as (pattern: string, options?: any) => Promise<string[]>;

export async function run(): Promise<void> {
    // Créer l'instance de test Mocha
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 60000, // Timeout plus long pour les tests d'intégration
        reporter: 'spec'
    });

    const testsRoot = path.resolve(__dirname, '.');

    try {
        // Trouver tous les fichiers de test
        const files = await globPromise('**/**.test.js', { cwd: testsRoot });

        // Ajouter les fichiers à Mocha
        files.forEach((file: string) => mocha.addFile(path.resolve(testsRoot, file)));

        // Exécuter les tests
        return new Promise<void>((resolve, reject) => {
            try {
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests ont échoué.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    } catch (err) {
        console.error('Erreur lors de la recherche des fichiers de test:', err);
        throw err;
    }
}
