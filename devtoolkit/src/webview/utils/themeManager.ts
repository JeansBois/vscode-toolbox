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
        // Detect the initial theme
        const bodyClasses = document.body.className.split(' ');
        if (bodyClasses.includes('vscode-dark')) {
            this.currentTheme = 'dark';
        } else if (bodyClasses.includes('vscode-light')) {
            this.currentTheme = 'light';
        } else if (bodyClasses.includes('vscode-high-contrast')) {
            this.currentTheme = 'high-contrast';
        }

        // Apply theme classes
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

        // Trigger a custom event for components that need to react
        const event = new CustomEvent('vscode-theme-change', {
            detail: { theme: newTheme }
        });
        document.dispatchEvent(event);
    }

    private applyThemeClasses(): void {
        const root = document.documentElement;
        
        // Remove existing theme classes
        root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
        
        // Add the new theme class
        root.classList.add(`theme-${this.currentTheme}`);

        // Update custom CSS properties
        this.updateCustomProperties();
    }

    private updateCustomProperties(): void {
        const style = getComputedStyle(document.documentElement);
        const customProperties = {
            // Base colors
            '--app-background': style.getPropertyValue('--vscode-editor-background'),
            '--app-foreground': style.getPropertyValue('--vscode-editor-foreground'),
            
            // Accent colors
            '--accent-color': style.getPropertyValue('--vscode-focusBorder'),
            
            // State colors
            '--hover-color': this.currentTheme === 'high-contrast'
                ? style.getPropertyValue('--vscode-contrastActiveBorder')
                : style.getPropertyValue('--vscode-list-hoverBackground'),
            
            // Opacities
            '--overlay-opacity': this.currentTheme === 'high-contrast' ? '0.9' : '0.8'
        };

        // Apply custom properties
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

    // Utility to get a theme-adapted color
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

    // Utility to get a theme-adapted opacity
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

// Export a singleton instance
export const themeManager = ThemeManager.getInstance();
