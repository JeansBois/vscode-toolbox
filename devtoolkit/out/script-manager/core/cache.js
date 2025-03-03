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
exports.ScriptCache = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ScriptCache {
    constructor(storagePath) {
        this.cache = new Map();
        this.cacheFile = path.join(storagePath, 'script_cache.json');
        this.loadCache();
    }
    static getInstance(storagePath) {
        if (!ScriptCache.instance) {
            ScriptCache.instance = new ScriptCache(storagePath);
        }
        return ScriptCache.instance;
    }
    async get(scriptId) {
        return this.cache.get(scriptId);
    }
    async set(scriptId, scriptInfo, manifest, filePath) {
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
    async invalidate(scriptId) {
        this.cache.delete(scriptId);
        await this.saveCache();
    }
    async clear() {
        this.cache.clear();
        await this.saveCache();
    }
    async isValid(scriptId, filePath) {
        const entry = this.cache.get(scriptId);
        if (!entry) {
            return false;
        }
        try {
            const stats = await fs.promises.stat(filePath);
            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            const currentHash = this.calculateHash(fileContent);
            return entry.lastModified === stats.mtimeMs && entry.hash === currentHash;
        }
        catch (error) {
            console.error(`Erreur lors de la validation du cache pour ${scriptId}:`, error);
            return false;
        }
    }
    async loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = await fs.promises.readFile(this.cacheFile, 'utf-8');
                const parsed = JSON.parse(data);
                this.cache = new Map(Object.entries(parsed));
            }
        }
        catch (error) {
            console.error('Erreur lors du chargement du cache:', error);
            this.cache = new Map();
        }
    }
    async saveCache() {
        try {
            const data = JSON.stringify(Object.fromEntries(this.cache), null, 2);
            await fs.promises.writeFile(this.cacheFile, data, 'utf-8');
        }
        catch (error) {
            console.error('Erreur lors de la sauvegarde du cache:', error);
        }
    }
    calculateHash(content) {
        const crypto = require('crypto');
        return crypto
            .createHash('sha256')
            .update(content)
            .digest('hex');
    }
    async getMetadata(scriptId) {
        const entry = this.cache.get(scriptId);
        if (entry) {
            return {
                lastModified: entry.lastModified,
                hash: entry.hash
            };
        }
        return undefined;
    }
    async getAllCachedScripts() {
        return Array.from(this.cache.keys());
    }
    async getCacheStats() {
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
exports.ScriptCache = ScriptCache;
//# sourceMappingURL=cache.js.map