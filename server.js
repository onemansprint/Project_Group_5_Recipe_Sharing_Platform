require('dotenv').config();

const bcrypt = require('bcryptjs');
const dbModule = require('./db');
const db = dbModule.pool || dbModule;
const jwt = require('jsonwebtoken');

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// test endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Recipe API is running!' });
});

// register a new user
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    // validate input
    if (
        typeof username !== 'string' ||
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !username.trim() ||
        !email.trim() ||
        password.length < 8
    ) {
        return res.status(400).json({
            error: 'Valid username, email, and password (8+ characters) required'
        });
    }

    try {
        // hash the password
        const passwordHash = await bcrypt.hash(password, 12);

        // insert user into PostgreSQL
        const result = await db.query(
            `INSERT INTO users (username, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, username, email, created_at`,
            [username.trim(), email.trim().toLowerCase(), passwordHash]
        );

        res.status(201).json({
            message: 'User registered successfully',
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                error: 'Username or email already exists'
            });
        }

        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// login existing user
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            error: 'Email and password are required'
        });
    }

    try {
        // find user by email
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email.trim().toLowerCase()]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // verify password
        const validPassword = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // generate authentication token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);

        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// verify authentication token
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256']
        });

        req.userId = decoded.userId;
        next();

    } catch (error) {
        return res.status(401).json({
            error: 'Invalid or expired token'
        });
    }
}

// submit a new recipe
app.post('/api/recipes', requireAuth, async (req, res) => {
    const {
        title,
        description = null,
        ingredients,
        instructions,
        cuisine = null,
        dietary_tags = [],
        meal_category = null,
        cooking_time_minutes = null,
        difficulty = null,
        image_url = null
    } = req.body;

    // validate required fields
    if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.length > 200 ||
        !Array.isArray(ingredients) ||
        ingredients.length === 0 ||
        !ingredients.every(item =>
            typeof item === 'string' && item.trim()
        ) ||
        !Array.isArray(dietary_tags) ||
        !dietary_tags.every(tag => typeof tag === 'string') ||
        typeof instructions !== 'string' ||
        !instructions.trim()
    ) {
        return res.status(400).json({
            error: 'Invalid or missing recipe information'
        });
    }

    try {
        const result = await db.query(
            `INSERT INTO recipes (
                user_id, title, description, ingredients,
                instructions, cuisine, dietary_tags,
                meal_category, cooking_time_minutes,
                difficulty, image_url
            )
            VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11
            )
            RETURNING *`,
            [
                req.userId,
                title.trim(),
                description,
                ingredients,
                instructions.trim(),
                cuisine,
                dietary_tags,
                meal_category,
                cooking_time_minutes,
                difficulty,
                image_url
            ]
        );

        res.status(201).json({
            message: 'Recipe created successfully',
            recipe: result.rows[0]
        });

    } catch (error) {
        console.error('Recipe creation error:', error);

        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// retrieve recipes with searching and filtering
app.get('/api/recipes', async (req, res) => {
    const { search, ingredient, cuisine, diet, maxTime, difficulty } = req.query;

    const conditions = [];
    const params = [];

    // keyword search
    if (search) {
        params.push(`%${search}%`);
        const p = `$${params.length}`;

        conditions.push(
            `(r.title ILIKE ${p} OR r.description ILIKE ${p} 
              OR r.instructions ILIKE ${p})`
        );
    }

    // ingredient search
    if (ingredient) {
        params.push(`%${ingredient}%`);
        const p = `$${params.length}`;

        conditions.push(`
            EXISTS (
                SELECT 1 FROM unnest(r.ingredients) AS i(value)
                WHERE i.value ILIKE ${p}
            )
        `);
    }

    // cuisine filter
    if (cuisine) {
        params.push(cuisine);
        conditions.push(`r.cuisine ILIKE $${params.length}`);
    }

    // dietary filter
    if (diet) {
        params.push(diet);
        const p = `$${params.length}`;

        conditions.push(`
            EXISTS (
                SELECT 1 FROM unnest(r.dietary_tags) AS d(value)
                WHERE d.value ILIKE ${p}
            )
        `);
    }

    // maximum cooking time
    if (maxTime !== undefined) {
        const minutes = Number(maxTime);

        if (!Number.isInteger(minutes) || minutes < 0) {
            return res.status(400).json({
                error: 'maxTime must be a nonnegative integer'
            });
        }

        params.push(minutes);
        conditions.push(`r.cooking_time_minutes <= $${params.length}`);
    }

    // difficulty filter
    if (difficulty) {
        params.push(difficulty);
        conditions.push(`r.difficulty ILIKE $${params.length}`);
    }

    try {
        let sql = `
            SELECT r.*, u.username AS author
            FROM recipes r
            JOIN users u ON r.user_id = u.id
        `;

        if (conditions.length > 0) {
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        sql += ' ORDER BY r.created_at DESC';

        const result = await db.query(sql, params);

        res.json(result.rows);

    } catch (error) {
        console.error('Recipe search error:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// retrieve a recipe by ID
app.get('/api/recipes/:id', async (req, res) => {
    const { id } = req.params;

    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({
            error: 'Invalid recipe ID'
        });
    }

    try {
        const result = await db.query(`
            SELECT recipes.*, users.username AS author
            FROM recipes
            JOIN users ON recipes.user_id = users.id
            WHERE recipes.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Recipe not found'
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error('Recipe retrieval error:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

// start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});