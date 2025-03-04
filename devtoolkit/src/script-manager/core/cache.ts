import * as fs from 'fs';
import * as path from 'path';
import { ScriptInfo, ScriptManifest } from '../types';

interface CacheEntry {
    scriptInfo: ScriptInfo;
    manifest: ScriptManifest;
    lastModified: number;
    hash: string;
}

export class ScriptCache {
    private cache: Map<string, CacheEntry>;
    private cacheFile: string;
    private static instance: ScriptCache;

    private constructor(storagePath: string) {
        this.cache = new Map();
        this.cacheFile = path.join(storagePath, 'script_cache.json');
        this.loadCache();
    }

    public static getInstance(storagePath: string): ScriptCache {
        if (!ScriptCache.instance) {
            ScriptCache.instance = new ScriptCache(storagePath);
        }
        return ScriptCache.instance;
    }

    public async get(scriptId: string): Promise<CacheEntry | undefined> {
        return this.cache.get(scriptId);
    }

    public async set(
        scriptId: string,
        scriptInfo: ScriptInfo,
        manifest: ScriptManifest,
        filePath: string
    ): Promise<void> {
        const stats = await fs.promises.stat(filePath);
        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
        const hash = this.calculateHash(fileContent);

        this.cache.set(scriptId, {
            scriptInfo,
            manifest,
            lastModified: stats.mtimeMs,
            hash
        });

        await this.saveCache();
    }

    public async invalidate(scriptId: string): Promise<void> {
        this.cache.delete(scriptId);
        await this.saveCache();
    }

    public async clear(): Promise<void> {
        this.cache.clear();
        await this.saveCache();
    }

    public async isValid(scriptId: string, filePath: string): Promise<boolean> {
        const entry = this.cache.get(scriptId);
        if (!entry) {
            return false;
        }

        try {
            const stats = await fs.promises.stat(filePath);
            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            const currentHash = this.calculateHash(fileContent);

            return entry.lastModified === stats.mtimeMs && entry.hash === currentHash;
        } catch (error) {
            console.error(`Error validating cache for ${scriptId}:`, error);
            return false;
        }
    }

    private async loadCache(): Promise<void> {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = await fs.promises.readFile(this.cacheFile, 'utf-8');
                const parsed = JSON.parse(data);
                this.cache = new Map(Object.entries(parsed));
            }
        } catch (error) {
            console.error('Error loading cache:', error);
            this.cache = new Map();
        }
    }

    private async saveCache(): Promise<void> {
        try {
            const data = JSON.stringify(Object.fromEntries(this.cache), null, 2);
            await fs.promises.writeFile(this.cacheFile, data, 'utf-8');
        } catch (error) {
            console.error('Error saving cache:', error);
        }
    }

    private calculateHash(content: string): string {
        const crypto = require('crypto');
        return crypto
            .createHash('sha256')
            .update(content)
            .digest('hex');
    }

    public async getMetadata(scriptId: string): Promise<{
        lastModified: number;
        hash: string;
    } | undefined> {
        const entry = this.cache.get(scriptId);
        if (entry) {
            return {
                lastModified: entry.lastModified,
                hash: entry.hash
            };
        }
        return undefined;
    }

    public async getAllCachedScripts(): Promise<string[]> {
        return Array.from(this.cache.keys());
    }

    public async getCacheStats(): Promise<{
        totalScripts: number;
        cacheSize: number;
        lastUpdated: number;
    }> {
        const cacheSize = fs.existsSync(this.cacheFile)
            ? (await fs.promises.stat(this.cacheFile)).size
            : 0;

        return {
            totalScripts: this.cache.size,
            cacheSize,
            lastUpdated: Date.now()
        };
    }
}
