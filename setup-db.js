const fs = require('fs');
const dbModule = require('./db');
const db = dbModule.pool || dbModule;

async function setupDatabase() {
    try {
        const sql = fs.readFileSync('./schema.sql', 'utf8');

        await db.query(sql);

        console.log('Database tables created successfully!');
    } catch (error) {
        console.error('Database setup failed:', error);
    } finally {
        await db.end();
    }
}

setupDatabase();