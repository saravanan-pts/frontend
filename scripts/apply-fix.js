const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables from .env.local
try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf-8');
    envConfig.split(/\r?\n/).forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) process.env[key.trim()] = val.trim().replace(/"/g, ''); // Simple parse
    });
} catch (e) {
    console.warn("[WARN] Could not read .env.local");
}

const { Surreal } = require("surrealdb.js");

async function run() {
    console.log("[INFO] Applying Schema Fix...");
    
    const db = new Surreal();
    const url = process.env.NEXT_PUBLIC_SURREALDB_URL;
    const token = process.env.NEXT_PUBLIC_SURREALDB_TOKEN;

    if (!url || !token) {
        console.error("[ERROR] Missing URL or TOKEN in .env.local");
        return;
    }

    try {
        await db.connect(url);
        await db.authenticate(token);
        await db.use({ 
            ns: process.env.NEXT_PUBLIC_SURREALDB_NAMESPACE || 'test', 
            db: process.env.NEXT_PUBLIC_SURREALDB_DATABASE || 'test' 
        });

        // THE FIX COMMANDS
        await db.query(`DEFINE FIELD processedAt ON TABLE document TYPE string`);
        await db.query(`DEFINE FIELD createdAt ON TABLE document TYPE string`);
        await db.query(`DEFINE FIELD createdAt ON TABLE entity TYPE string`);
        await db.query(`DEFINE FIELD updatedAt ON TABLE entity TYPE string`);
        await db.query(`DEFINE FIELD createdAt ON TABLE relationship TYPE string`);

        console.log("[SUCCESS] Schema successfully updated!");
    } catch (e) {
        console.error("[ERROR] Failed:", e.message);
    } finally {
        db.close();
    }
}

run();