const db = require('./db');

db.query('SELECT NOW()')
    .then(result => console.log('Connected!', result.rows))
    .catch(error => console.error('Connection failed:', error.message))
    .finally(() => db.end());