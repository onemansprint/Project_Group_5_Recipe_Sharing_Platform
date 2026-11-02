require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.query('SELECT NOW()')
    .then(result => console.log('Connected!', result.rows))
    .catch(error => console.error('Connection failed:', error.message))
    .finally(() => pool.end());