interface ThemeChangeMessage {
    type: 'theme-change';
    theme: 'dark' | 'light' | 'high-contrast';
}

export class ThemeManager {
    private static instance: ThemeManager;
    private currentTheme: string = '';

    private constructor() {
        this.initializeTheme();
        this.setupMessageListener();
    }

    public static getInstance(): ThemeManager {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }

    private initializeTheme(): void {
        // Détecter le thème initial
        const bodyClasses = document.body.className.split(' ');
        if (bodyClasses.includes('vscode-dark')) {
            this.currentTheme = 'dark';
        } else if (bodyClasses.includes('vscode-light')) {
            this.currentTheme = 'light';
        } else if (bodyClasses.includes('vscode-high-contrast')) {
            this.currentTheme = 'high-contrast';
        }

        // Appliquer les classes de thème
        this.applyThemeClasses();
    }

    private setupMessageListener(): void {
        window.addEventListener('message', (event) => {
            const message = event.data as ThemeChangeMessage;
            if (message.type === 'theme-change') {
                this.handleThemeChange(message.theme);
            }
        });
    }

    public handleThemeChange(newTheme: 'dark' | 'light' | 'high-contrast'): void {
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

    private applyThemeClasses(): void {
        const root = document.documentElement;
        
        // Supprimer les classes de thème existantes
        root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
        
        // Ajouter la nouvelle classe de thème
        root.classList.add(`theme-${this.currentTheme}`);

        // Mettre à jour les propriétés CSS personnalisées
        this.updateCustomProperties();
    }

    private updateCustomProperties(): void {
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

    public getCurrentTheme(): string {
        return this.currentTheme;
    }

    public isDarkTheme(): boolean {
        return this.currentTheme === 'dark';
    }

    public isHighContrastTheme(): boolean {
        return this.currentTheme === 'high-contrast';
    }

    // Utilitaire pour obtenir une couleur adaptée au thème
    public getThemedColor(
        darkColor: string,
        lightColor: string,
        highContrastColor?: string
    ): string {
        if (this.isHighContrastTheme() && highContrastColor) {
            return highContrastColor;
        }
        return this.isDarkTheme() ? darkColor : lightColor;
    }

    // Utilitaire pour obtenir une opacité adaptée au thème
    public getThemedOpacity(
        darkOpacity: number,
        lightOpacity: number,
        highContrastOpacity?: number
    ): number {
        if (this.isHighContrastTheme() && highContrastOpacity !== undefined) {
            return highContrastOpacity;
        }
        return this.isDarkTheme() ? darkOpacity : lightOpacity;
    }
}

// Exporter une instance unique
export const themeManager = ThemeManager.getInstance();
