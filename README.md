Recipe Sharing Platform Backend API
Local Development Instructions and API Endpoints listed

Base URL:
https://nau-web-ii-production.up.railway.app

1. Clone the Repository
Clone the GitHub repository to your computer and open a terminal at the project directory (where package.json is).
2. Install Dependencies
Run:
npm install
3. Frontend Development
The backend is already deployed and accessible at:
https://nau-web-ii-production.up.railway.app
Frontend developers can communicate directly with this API without running a local database or backend server.
For example, retrieve all recipes with:
const response = await fetch(
    "https://nau-web-ii-production.up.railway.app/api/recipes"
);
const recipes = await response.json();

4. Backend Development (Only If Needed)
Developers who need to run the Express backend locally must create a .env file in the project root.
The file should contain:
DATABASE_URL=your_database_connection_string
JWT_SECRET=your_jwt_secret
DATABASE_URL: PostgreSQL connection string. For local development against Railway, use an externally accessible connection URL, not the internal Railway hostname.
JWT_SECRET: A secret used to sign and verify authentication tokens. Generate a separate secret for local development.
Database credentials should be obtained privately from the backend developer (Adam). Do not commit them to GitHub.

5. Database Initialization
The PostgreSQL tables have already been created in the Railway database.
Do not run database initialization against the shared database unless instructed.
When setting up a new, empty development database, run:
node setup-db.js
This executes schema.sql and creates the required tables.

6. Start the Local Backend
Run:
npm start
By default, the Express backend runs at:
http://localhost:3000
There is no homepage at this address. Verify that it works by visiting:
http://localhost:3000/api/health
A successful response indicates that the server is running.

7. Important Notes
Never commit .env files or database credentials.
Do not share production JWT secrets.
The deployed Railway API is available for frontend development and testing.
Database initialization is unnecessary when using the existing shared database.
Frontend and backend development can proceed independently.


All API responses use JSON.
API Endpoints
Method	Endpoint	Description	Authentication
GET	/api/health	Check server status	No
POST	/api/register	Register a new user	No
POST	/api/login	Authenticate an existing user	No
GET	/api/recipes	Retrieve and search recipes	No
GET	/api/recipes/:id	Retrieve a specific recipe	No
POST	/api/recipes	Submit a new recipe	JWT required

User Registration
POST /api/register
Request body:
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "testpass123"
}
Passwords must contain at least 8 characters.
Successful registration returns HTTP 201 with the newly created user's information.

User Login
POST /api/login
Request body:
{
  "email": "test@example.com",
  "password": "testpass123"
}
Successful login returns a JWT authentication token and user information.
The token must be included when submitting recipes:
Authorization: Bearer YOUR_JWT_TOKEN
Tokens expire after 24 hours.

Recipe Submission
POST /api/recipes
Requires authentication.
Example request:
{
  "title": "Scrambled Eggs",
  "description": "Quick breakfast recipe",
  "ingredients": [
    "2 eggs",
    "1 tbsp butter"
  ],
  "instructions": "Whisk eggs and cook in butter.",
  "cuisine": "American",
  "dietary_tags": ["Vegetarian"],
  "meal_category": "Breakfast",
  "cooking_time_minutes": 10,
  "difficulty": "Easy",
  "image_url": null
}
Required fields:
title - String
ingredients - Nonempty array of strings
instructions - String
All other recipe fields are optional.
A successful submission returns HTTP 201 with the newly created recipe.

Recipe Retrieval
GET /api/recipes
Returns an array of recipes stored in PostgreSQL.
Each recipe includes its database ID, author ID, author username, recipe information, and creation timestamp.
GET /api/recipes/:id
Returns a single recipe identified by its database ID.
Example:
/api/recipes/1
Returns HTTP 404 if the recipe does not exist.

Searching and Filtering
The /api/recipes endpoint supports optional query parameters.
Parameter	Description	Example
search	Search recipe text	?search=eggs
ingredient	Search ingredients	?ingredient=butter
cuisine	Filter by cuisine	?cuisine=American
diet	Filter dietary tags	?diet=Vegetarian
maxTime	Maximum cooking time in minutes	?maxTime=30
difficulty	Filter difficulty	?difficulty=Easy

Multiple filters can be combined.
Example:
/api/recipes?cuisine=American&maxTime=15

Searching and filtering are handled by PostgreSQL through the Express backend.

Frontend Integration
The React frontend can retrieve recipes using JavaScript's fetch() API.
Example:
const response = await fetch(
  'https://nau-web-ii-production.up.railway.app/api/recipes'
);

const recipes = await response.json();
Recipe retrieval and searching do not require authentication.
Submitting recipes requires a valid JWT in the Authorization header.

End of README.md