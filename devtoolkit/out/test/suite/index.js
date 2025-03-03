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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const path = __importStar(require("path"));
const mocha_1 = __importDefault(require("mocha"));
const glob_1 = require("glob");
const util_1 = require("util");
const globPromise = (0, util_1.promisify)(glob_1.glob);
async function run() {
    // Créer l'instance de test Mocha
    const mocha = new mocha_1.default({
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
        files.forEach((file) => mocha.addFile(path.resolve(testsRoot, file)));
        // Exécuter les tests
        return new Promise((resolve, reject) => {
            try {
                mocha.run((failures) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests ont échoué.`));
                    }
                    else {
                        resolve();
                    }
                });
            }
            catch (err) {
                console.error(err);
                reject(err);
            }
        });
    }
    catch (err) {
        console.error('Erreur lors de la recherche des fichiers de test:', err);
        throw err;
    }
}
//# sourceMappingURL=index.js.map