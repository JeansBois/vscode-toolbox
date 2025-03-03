import * as fs from 'fs';
import * as path from 'path';
import { ScriptManifest, ScriptInfo } from '../types';
import { ManifestManager } from '../manifest/manager';

interface TemplateInfo {
    name: string;
    description: string;
    baseTemplate?: string;
    variables: {
        name: string;
        description: string;
        type: string;
        required: boolean;
        default?: any;
    }[];
}

export class TemplateManager {
    private readonly templatesDir: string;
    private readonly manifestManager: ManifestManager;
    private static instance: TemplateManager;

    private constructor(baseDir: string) {
        this.templatesDir = path.join(baseDir, 'templates');
        this.manifestManager = ManifestManager.getInstance();
        this.ensureTemplateDirectory();
    }

    public static getInstance(baseDir: string): TemplateManager {
        if (!TemplateManager.instance) {
            TemplateManager.instance = new TemplateManager(baseDir);
        }
        return TemplateManager.instance;
    }

    private ensureTemplateDirectory(): void {
        if (!fs.existsSync(this.templatesDir)) {
            fs.mkdirSync(this.templatesDir, { recursive: true });
        }
    }

    public async createTemplate(
        name: string,
        sourceScript: string,
        info: TemplateInfo
    ): Promise<void> {
        const templateDir = path.join(this.templatesDir, name);
        
        try {
            // Créer le répertoire du template
            await fs.promises.mkdir(templateDir, { recursive: true });
            
            // Copier le script source
            const scriptContent = await fs.promises.readFile(sourceScript, 'utf-8');
            const templateScript = this.processScriptTemplate(scriptContent, info.variables);
            await fs.promises.writeFile(
                path.join(templateDir, 'template.py'),
                templateScript
            );
            
            // Sauvegarder les informations du template
            await fs.promises.writeFile(
                path.join(templateDir, 'template.json'),
                JSON.stringify(info, null, 2)
            );
            
            // Si basé sur un autre template, copier et fusionner
            if (info.baseTemplate) {
                await this.inheritFromTemplate(templateDir, info.baseTemplate);
            }
        } catch (error) {
            throw new Error(`Erreur lors de la création du template: ${error}`);
        }
    }

    public async instantiateTemplate(
        templateName: string,
        variables: Record<string, any>,
        targetDir: string,
        scriptInfo: Partial<ScriptManifest>
    ): Promise<ScriptManifest> {
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
            const defaultScriptInfo: ScriptInfo = {
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
            await this.manifestManager.saveManifest(
                manifest,
                path.join(targetDir, `${manifest.script_info.id}_manifest.json`)
            );
            
            return manifest;
        } catch (error) {
            throw new Error(`Erreur lors de l'instanciation du template: ${error}`);
        }
    }

    public async listTemplates(): Promise<TemplateInfo[]> {
        try {
            const templates: TemplateInfo[] = [];
            const entries = await fs.promises.readdir(this.templatesDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const info = await this.loadTemplateInfo(entry.name);
                    templates.push(info);
                }
            }
            
            return templates;
        } catch (error) {
            throw new Error(`Erreur lors de la lecture des templates: ${error}`);
        }
    }

    private async loadTemplateInfo(templateName: string): Promise<TemplateInfo> {
        const infoPath = path.join(this.templatesDir, templateName, 'template.json');
        try {
            const content = await fs.promises.readFile(infoPath, 'utf-8');
            return JSON.parse(content) as TemplateInfo;
        } catch (error) {
            throw new Error(`Erreur lors du chargement des informations du template: ${error}`);
        }
    }

    private validateTemplateVariables(
        templateVars: TemplateInfo['variables'],
        providedVars: Record<string, any>
    ): void {
        const errors: string[] = [];
        
        // Vérifier les variables requises
        for (const templateVar of templateVars) {
            if (templateVar.required && !(templateVar.name in providedVars)) {
                errors.push(`Variable requise manquante: ${templateVar.name}`);
                continue;
            }
            
            if (templateVar.name in providedVars) {
                const value = providedVars[templateVar.name];
                if (!this.validateVariableType(value, templateVar.type)) {
                    errors.push(
                        `Type invalide pour ${templateVar.name}: attendu ${templateVar.type}`
                    );
                }
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Validation des variables échouée:\n${errors.join('\n')}`);
        }
    }

    private validateVariableType(value: any, expectedType: string): boolean {
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

    private processScriptTemplate(content: string, variables: TemplateInfo['variables']): string {
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

    private processScriptContent(content: string, variables: Record<string, any>): string {
        let processedContent = content;
        
        // Remplacer les variables dans le contenu
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            processedContent = processedContent.replace(
                new RegExp(placeholder, 'g'),
                String(value)
            );
        }
        
        return processedContent;
    }

    private async inheritFromTemplate(
        targetDir: string,
        baseTemplateName: string
    ): Promise<void> {
        const baseTemplateDir = path.join(this.templatesDir, baseTemplateName);
        
        try {
            // Vérifier que le template de base existe
            if (!fs.existsSync(baseTemplateDir)) {
                throw new Error(`Template de base ${baseTemplateName} non trouvé`);
            }
            
            // Charger les informations des deux templates
            const baseInfo = await this.loadTemplateInfo(baseTemplateName);
            const targetInfo = JSON.parse(
                await fs.promises.readFile(
                    path.join(targetDir, 'template.json'),
                    'utf-8'
                )
            ) as TemplateInfo;
            
            // Fusionner les variables
            targetInfo.variables = [
                ...baseInfo.variables,
                ...targetInfo.variables.filter(v => 
                    !baseInfo.variables.some(bv => bv.name === v.name)
                )
            ];
            
            // Sauvegarder les informations mises à jour
            await fs.promises.writeFile(
                path.join(targetDir, 'template.json'),
                JSON.stringify(targetInfo, null, 2)
            );
            
            // Copier les fichiers supplémentaires du template de base
            const files = await fs.promises.readdir(baseTemplateDir);
            for (const file of files) {
                if (file !== 'template.json' && file !== 'template.py') {
                    await fs.promises.copyFile(
                        path.join(baseTemplateDir, file),
                        path.join(targetDir, file)
                    );
                }
            }
        } catch (error) {
            throw new Error(`Erreur lors de l'héritage du template: ${error}`);
        }
    }
}
