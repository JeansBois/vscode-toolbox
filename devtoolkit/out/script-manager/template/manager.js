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
exports.TemplateManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const manager_1 = require("../manifest/manager");
class TemplateManager {
    constructor(baseDir) {
        this.templatesDir = path.join(baseDir, 'templates');
        this.manifestManager = manager_1.ManifestManager.getInstance();
        this.ensureTemplateDirectory();
    }
    static getInstance(baseDir) {
        if (!TemplateManager.instance) {
            TemplateManager.instance = new TemplateManager(baseDir);
        }
        return TemplateManager.instance;
    }
    ensureTemplateDirectory() {
        if (!fs.existsSync(this.templatesDir)) {
            fs.mkdirSync(this.templatesDir, { recursive: true });
        }
    }
    async createTemplate(name, sourceScript, info) {
        const templateDir = path.join(this.templatesDir, name);
        try {
            // Créer le répertoire du template
            await fs.promises.mkdir(templateDir, { recursive: true });
            // Copier le script source
            const scriptContent = await fs.promises.readFile(sourceScript, 'utf-8');
            const templateScript = this.processScriptTemplate(scriptContent, info.variables);
            await fs.promises.writeFile(path.join(templateDir, 'template.py'), templateScript);
            // Sauvegarder les informations du template
            await fs.promises.writeFile(path.join(templateDir, 'template.json'), JSON.stringify(info, null, 2));
            // Si basé sur un autre template, copier et fusionner
            if (info.baseTemplate) {
                await this.inheritFromTemplate(templateDir, info.baseTemplate);
            }
        }
        catch (error) {
            throw new Error(`Erreur lors de la création du template: ${error}`);
        }
    }
    async instantiateTemplate(templateName, variables, targetDir, scriptInfo) {
        const templateDir = path.join(this.templatesDir, templateName);
        try {
            // Vérifier que le template existe
            if (!fs.existsSync(templateDir)) {
                throw new Error(`Template ${templateName} non trouvé`);
            }
            // Charger les informations du template
            const info = await this.loadTemplateInfo(templateName);
            // Valider les variables
            this.validateTemplateVariables(info.variables, variables);
            // Charger et traiter le script template
            const templatePath = path.join(templateDir, 'template.py');
            const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
            const processedScript = this.processScriptContent(templateContent, variables);
            // Créer le répertoire cible si nécessaire
            await fs.promises.mkdir(targetDir, { recursive: true });
            // Écrire le script généré
            const scriptPath = path.join(targetDir, `${scriptInfo.script_info?.name || 'script'}.py`);
            await fs.promises.writeFile(scriptPath, processedScript);
            // Générer le manifest
            const defaultScriptInfo = {
                id: `script_${Date.now()}`,
                name: path.basename(scriptPath, '.py'),
                version: '1.0.0',
                description: `Script généré à partir du template ${templateName}`,
                author: 'System',
                category: 'generated',
                tags: ['generated'],
                template: templateName
            };
            const manifest = await this.manifestManager.generateManifest(scriptPath, {
                ...scriptInfo,
                script_info: {
                    ...defaultScriptInfo,
                    ...scriptInfo.script_info,
                    template: templateName // S'assurer que le template est toujours défini
                }
            });
            // Sauvegarder le manifest
            await this.manifestManager.saveManifest(manifest, path.join(targetDir, `${manifest.script_info.id}_manifest.json`));
            return manifest;
        }
        catch (error) {
            throw new Error(`Erreur lors de l'instanciation du template: ${error}`);
        }
    }
    async listTemplates() {
        try {
            const templates = [];
            const entries = await fs.promises.readdir(this.templatesDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const info = await this.loadTemplateInfo(entry.name);
                    templates.push(info);
                }
            }
            return templates;
        }
        catch (error) {
            throw new Error(`Erreur lors de la lecture des templates: ${error}`);
        }
    }
    async loadTemplateInfo(templateName) {
        const infoPath = path.join(this.templatesDir, templateName, 'template.json');
        try {
            const content = await fs.promises.readFile(infoPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            throw new Error(`Erreur lors du chargement des informations du template: ${error}`);
        }
    }
    validateTemplateVariables(templateVars, providedVars) {
        const errors = [];
        // Vérifier les variables requises
        for (const templateVar of templateVars) {
            if (templateVar.required && !(templateVar.name in providedVars)) {
                errors.push(`Variable requise manquante: ${templateVar.name}`);
                continue;
            }
            if (templateVar.name in providedVars) {
                const value = providedVars[templateVar.name];
                if (!this.validateVariableType(value, templateVar.type)) {
                    errors.push(`Type invalide pour ${templateVar.name}: attendu ${templateVar.type}`);
                }
            }
        }
        if (errors.length > 0) {
            throw new Error(`Validation des variables échouée:\n${errors.join('\n')}`);
        }
    }
    validateVariableType(value, expectedType) {
        switch (expectedType.toLowerCase()) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number';
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null;
            default:
                return true;
        }
    }
    processScriptTemplate(content, variables) {
        // Ajouter les imports et variables nécessaires
        let processedContent = '#!/usr/bin/env python\n\n';
        processedContent += '"""Script généré à partir d\'un template.\n\n';
        // Ajouter la documentation des variables
        for (const variable of variables) {
            processedContent += `${variable.name}: ${variable.type}\n    ${variable.description}\n`;
        }
        processedContent += '"""\n\n';
        processedContent += content;
        return processedContent;
    }
    processScriptContent(content, variables) {
        let processedContent = content;
        // Remplacer les variables dans le contenu
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            processedContent = processedContent.replace(new RegExp(placeholder, 'g'), String(value));
        }
        return processedContent;
    }
    async inheritFromTemplate(targetDir, baseTemplateName) {
        const baseTemplateDir = path.join(this.templatesDir, baseTemplateName);
        try {
            // Vérifier que le template de base existe
            if (!fs.existsSync(baseTemplateDir)) {
                throw new Error(`Template de base ${baseTemplateName} non trouvé`);
            }
            // Charger les informations des deux templates
            const baseInfo = await this.loadTemplateInfo(baseTemplateName);
            const targetInfo = JSON.parse(await fs.promises.readFile(path.join(targetDir, 'template.json'), 'utf-8'));
            // Fusionner les variables
            targetInfo.variables = [
                ...baseInfo.variables,
                ...targetInfo.variables.filter(v => !baseInfo.variables.some(bv => bv.name === v.name))
            ];
            // Sauvegarder les informations mises à jour
            await fs.promises.writeFile(path.join(targetDir, 'template.json'), JSON.stringify(targetInfo, null, 2));
            // Copier les fichiers supplémentaires du template de base
            const files = await fs.promises.readdir(baseTemplateDir);
            for (const file of files) {
                if (file !== 'template.json' && file !== 'template.py') {
                    await fs.promises.copyFile(path.join(baseTemplateDir, file), path.join(targetDir, file));
                }
            }
        }
        catch (error) {
            throw new Error(`Erreur lors de l'héritage du template: ${error}`);
        }
    }
}
exports.TemplateManager = TemplateManager;
//# sourceMappingURL=manager.js.map