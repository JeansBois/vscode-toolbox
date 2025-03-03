"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.themeManager = exports.ThemeManager = void 0;
class ThemeManager {
    constructor() {
        this.currentTheme = '';
        this.initializeTheme();
        this.setupMessageListener();
    }
    static getInstance() {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }
    initializeTheme() {
        // Détecter le thème initial
        const bodyClasses = document.body.className.split(' ');
        if (bodyClasses.includes('vscode-dark')) {
            this.currentTheme = 'dark';
        }
        else if (bodyClasses.includes('vscode-light')) {
            this.currentTheme = 'light';
        }
        else if (bodyClasses.includes('vscode-high-contrast')) {
            this.currentTheme = 'high-contrast';
        }
        // Appliquer les classes de thème
        this.applyThemeClasses();
    }
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'theme-change') {
                this.handleThemeChange(message.theme);
            }
        });
    }
    handleThemeChange(newTheme) {
        if (this.currentTheme === newTheme) {
            return;
        }
        this.currentTheme = newTheme;
        this.applyThemeClasses();
        // Déclencher un événement personnalisé pour les composants qui doivent réagir
        const event = new CustomEvent('vscode-theme-change', {
            detail: { theme: newTheme }
        });
        document.dispatchEvent(event);
    }
    applyThemeClasses() {
        const root = document.documentElement;
        // Supprimer les classes de thème existantes
        root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
        // Ajouter la nouvelle classe de thème
        root.classList.add(`theme-${this.currentTheme}`);
        // Mettre à jour les propriétés CSS personnalisées
        this.updateCustomProperties();
    }
    updateCustomProperties() {
        const style = getComputedStyle(document.documentElement);
        const customProperties = {
            // Couleurs de base
            '--app-background': style.getPropertyValue('--vscode-editor-background'),
            '--app-foreground': style.getPropertyValue('--vscode-editor-foreground'),
            // Couleurs d'accentuation
            '--accent-color': style.getPropertyValue('--vscode-focusBorder'),
            // Couleurs des états
            '--hover-color': this.currentTheme === 'high-contrast'
                ? style.getPropertyValue('--vscode-contrastActiveBorder')
                : style.getPropertyValue('--vscode-list-hoverBackground'),
            // Opacités
            '--overlay-opacity': this.currentTheme === 'high-contrast' ? '0.9' : '0.8'
        };
        // Appliquer les propriétés personnalisées
        Object.entries(customProperties).forEach(([key, value]) => {
            document.documentElement.style.setProperty(key, value);
        });
    }
    getCurrentTheme() {
        return this.currentTheme;
    }
    isDarkTheme() {
        return this.currentTheme === 'dark';
    }
    isHighContrastTheme() {
        return this.currentTheme === 'high-contrast';
    }
    // Utilitaire pour obtenir une couleur adaptée au thème
    getThemedColor(darkColor, lightColor, highContrastColor) {
        if (this.isHighContrastTheme() && highContrastColor) {
            return highContrastColor;
        }
        return this.isDarkTheme() ? darkColor : lightColor;
    }
    // Utilitaire pour obtenir une opacité adaptée au thème
    getThemedOpacity(darkOpacity, lightOpacity, highContrastOpacity) {
        if (this.isHighContrastTheme() && highContrastOpacity !== undefined) {
            return highContrastOpacity;
        }
        return this.isDarkTheme() ? darkOpacity : lightOpacity;
    }
}
exports.ThemeManager = ThemeManager;
// Exporter une instance unique
exports.themeManager = ThemeManager.getInstance();
//# sourceMappingURL=themeManager.js.map