import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiBase = (import.meta.env.VITE_API_BASE_URL || 'https://nau-web-ii-production.up.railway.app').replace(/\/$/, '');
const sessionKey = 'nau-recipe-session';
const dietaryOptions = ['Vegetarian', 'Vegan', 'Gluten Free', 'High Protein', 'Dairy Free'];

async function api(path, { body, token, signal } = {}) {
  const response = await fetch(apiBase + '/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: 'Bearer ' + token }),
    },
    body: body && JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(response.status === 401 && token
      ? 'Your session expired. Sign in again to submit a recipe.'
      : data?.error || 'The recipe service could not complete your request.');
  }
  if (!data) throw new Error('The recipe service returned an empty response.');
  return data;
}

function useRecipeData(path) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    api(path, { signal: controller.signal }).then(
      data => setResult({ data }),
      error => {
        if (!controller.signal.aborted) setResult({ error: error.message });
      },
    );
    return () => controller.abort();
  }, [path]);
  return result || {};
}

function Feedback({ error, children }) {
  return error ? <p role="alert" className="error">{error}</p> : <p role="status">{children}</p>;
}

function RecipePhoto({ recipe }) {
  const [failed, setFailed] = useState(false);
  const url = recipe.image_url;
  if (url && /^(https?:\/\/|data:image\/jpeg;base64,)/i.test(url) && !failed) {
    return <img className="recipe-photo" src={url} alt={recipe.title} onError={() => setFailed(true)} />;
  }
  return <div className="recipe-photo photo-placeholder">No photo</div>;
}

function RecipeMeta({ recipe }) {
  const items = [
    recipe.cooking_time_minutes != null ? recipe.cooking_time_minutes + ' min' : null,
    recipe.difficulty, recipe.cuisine, recipe.meal_category,
    ...(recipe.dietary_tags || []),
  ].filter(Boolean);
  return <div className="tags">{items.map((item, index) => <span key={index}>{item}</span>)}</div>;
}

function RecipeGrid({ recipes, empty }) {
  if (!recipes.length) return <p>{empty}</p>;
  return <div className="recipe-grid">{recipes.map(recipe => (
    <article className="recipe-card" key={recipe.id}>
      <a href={'#/recipes/' + recipe.id}>
        <RecipePhoto recipe={recipe} />
        <div className="card-copy">
          <h2>{recipe.title}</h2>
          <RecipeMeta recipe={recipe} />
        </div>
      </a>
    </article>
  ))}</div>;
}

function Feed({ browse }) {
  const { data, error } = useRecipeData('/recipes');
  return <>
    <div className="page-heading">
      <h1>{browse ? 'Recipes' : 'Recipe feed'}</h1>
      <a className="button" href="#/new-recipe">Create a recipe</a>
    </div>
    {data ? <RecipeGrid recipes={data} empty="No recipes have been shared yet." />
      : <Feedback error={error}>Loading recipes…</Feedback>}
  </>;
}

function Interactions() {
  return <section className="panel interactions">
    <h2>Ratings and comments</h2>
    <p>Ratings, comments, and saved recipes will be available when the service supports them.</p>
    <fieldset disabled>
      <legend>Rate this recipe</legend>
      <div className="choices">{[1, 2, 3, 4, 5].map(value => (
        <label key={value}><input type="radio" name="rating" value={value} /> {value} ★</label>
      ))}</div>
      <label>Comment<textarea rows="3" /></label>
      <div className="actions">
        <button type="button">Post comment</button>
        <button type="button" className="secondary">Save recipe</button>
      </div>
    </fieldset>
  </section>;
}

function RecipeDetail({ id, session, editing }) {
  const { data: recipe, error } = useRecipeData('/recipes/' + id);
  if (!recipe) return <Feedback error={error}>Loading recipe…</Feedback>;
  const owner = session && String(session.user.id) === String(recipe.user_id);
  if (editing) return owner
    ? <RecipeForm recipe={recipe} session={session} />
    : <p role="alert">Sign in as the recipe author to open the edit form.</p>;
  return <>
    <article className="panel detail">
      <div>
        <RecipePhoto recipe={recipe} />
        <h2>Ingredients</h2>
        <ul>{recipe.ingredients.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </div>
      <div>
        <h1>{recipe.title}</h1>
        {recipe.username && <p>By {recipe.username}</p>}
        <RecipeMeta recipe={recipe} />
        {recipe.description && <p>{recipe.description}</p>}
        <h2>Instructions</h2>
        <ol>{lines(recipe.instructions).map((step, index) => <li key={index}>{step.replace(/^\d+[.)]\s+/, '')}</li>)}</ol>
        {owner && <a className="button secondary" href={'#/recipes/' + id + '/edit'}>Edit recipe</a>}
      </div>
    </article>
    <Interactions />
  </>;
}

function lines(value) {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function readPhoto(file) {
  if (!file?.size) return Promise.resolve(null);
  if (file.type !== 'image/jpeg' || file.size > 60_000) {
    throw new Error('Choose a JPEG photo no larger than 60 KB.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The photo could not be opened.'));
    reader.readAsDataURL(file);
  });
}

function RecipeForm({ recipe, session }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!session) return <section className="panel narrow">
    <h1>Create a new recipe</h1>
    <p>Sign in to share a recipe.</p>
    <a className="button" href="#/login?next=/new-recipe">Sign in</a>
  </section>;
  async function submit(event) {
    event.preventDefault();
    if (recipe || busy) return;
    const form = new FormData(event.currentTarget);
    const ingredients = lines(form.get('ingredients'));
    const title = form.get('title').trim();
    const instructions = form.get('instructions').trim();
    if (!title || !instructions || !ingredients.length) {
      setError('Enter a title, at least one ingredient, and cooking instructions.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const { recipe: created } = await api('/recipes', {
        token: session.token,
        body: {
          title, instructions, ingredients,
          dietary_tags: form.getAll('dietary_tags'),
          meal_category: form.get('meal_category').trim() || null,
          cuisine: form.get('cuisine').trim() || null,
          cooking_time_minutes: form.get('cooking_time_minutes') ? Number(form.get('cooking_time_minutes')) : null,
          difficulty: form.get('difficulty') || null,
          image_url: await readPhoto(form.get('photo')),
        },
      });
      location.hash = '/recipes/' + created.id;
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const tags = [...new Set([...dietaryOptions, ...(recipe?.dietary_tags || [])])];
  return <section className="panel">
    <h1>{recipe ? 'Edit recipe' : 'Create a new recipe'}</h1>
    {recipe && <p>Saving edits will be available when the recipe service supports updates.</p>}
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>Recipe title <input name="title" required maxLength="200" defaultValue={recipe?.title} /></label>
        <div className="form-columns">
          <div>
            <fieldset>
              <legend>Dietary tags</legend>
              <div className="choices">{tags.map(tag => (
                <label key={tag}><input type="checkbox" name="dietary_tags" value={tag}
                  defaultChecked={recipe?.dietary_tags?.includes(tag)} /> {tag}</label>
              ))}</div>
            </fieldset>
            <label>Meal category <input name="meal_category" defaultValue={recipe?.meal_category ?? ''} /></label>
            <label>Cuisine <input name="cuisine" defaultValue={recipe?.cuisine ?? ''} /></label>
            <label>Recipe photo (JPEG, up to 60 KB) <input type="file" name="photo" accept="image/jpeg" /></label>
            <label>Cooking time in minutes <input name="cooking_time_minutes" type="number" min="1" max="2147483647"
              defaultValue={recipe?.cooking_time_minutes ?? ''} /></label>
            <label>Difficulty <select name="difficulty" defaultValue={recipe?.difficulty ?? ''}>
              <option value="">Select difficulty</option>
              {Array.from(new Set(['Easy', 'Medium', 'Hard', recipe?.difficulty].filter(Boolean)))
                .map(value => <option key={value}>{value}</option>)}
            </select></label>
          </div>
          <div>
            <label>Ingredients (one per line) <textarea name="ingredients" rows="7" required
              defaultValue={recipe?.ingredients?.join('\n')} /></label>
            <label>Instructions (one step per line) <textarea name="instructions" rows="7" required
              defaultValue={recipe?.instructions} /></label>
          </div>
        </div>
        <div className="actions">
          <button type={recipe ? 'button' : 'submit'} disabled={Boolean(recipe)}>
            {recipe ? 'Save changes' : busy ? 'Creating…' : 'Create recipe'}
          </button>
          <a href={recipe ? '#/recipes/' + recipe.id : '#/'}>Cancel</a>
        </div>
      </fieldset>
      {error && <Feedback error={error} />}
    </form>
  </section>;
}

function AccountForm({ register, next, onLogin }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (register) body.username = body.username.trim();
    body.email = body.email.trim();
    if (register && !body.username) {
      setError('Enter a username.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (register) {
        await api('/register', { body });
        location.hash = '/login?' + new URLSearchParams({ created: '1', ...(next && { next }) });
      } else {
        onLogin(await api('/login', { body }));
        location.hash = next || '/profile';
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const suffix = next ? '?' + new URLSearchParams({ next }) : '';
  return <section className="panel narrow">
    <h1>{register ? 'Create an account' : 'Sign in'}</h1>
    {!register && location.hash.includes('created=1') && <p role="status">Account created. Sign in to continue.</p>}
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        {register && <label>Username <input name="username" autoComplete="username" maxLength="50" required /></label>}
        <label>Email <input name="email" type="email" autoComplete={register ? 'email' : 'username'} required /></label>
        <label>Password <input name="password" type="password" minLength={register ? 8 : undefined}
          autoComplete={register ? 'new-password' : 'current-password'} required /></label>
        <button>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      </fieldset>
    </form>
    {error && <Feedback error={error} />}
    <p><a href={(register ? '#/login' : '#/new-user') + suffix}>
      {register ? 'Already have an account? Sign in' : 'New user? Create an account'}
    </a></p>
  </section>;
}

function Profile({ session }) {
  const [saved, setSaved] = useState(false);
  const { data, error } = useRecipeData('/recipes');
  const owned = data?.filter(recipe => String(recipe.user_id) === String(session.user.id));
  return <>
    <section className="panel profile">
      <div className="avatar" aria-hidden="true">{session.user.username.slice(0, 1).toUpperCase()}</div>
      <div>
        <h1>{session.user.username}</h1>
        {owned && <p>{owned.length} {owned.length === 1 ? 'recipe' : 'recipes'}</p>}
        {session.user.bio && <p>{session.user.bio}</p>}
      </div>
    </section>
    <div className="actions profile-actions" aria-label="Recipe collection">
      <button aria-pressed={!saved} className={saved ? 'secondary' : ''} onClick={() => setSaved(false)}>My recipes</button>
      <button aria-pressed={saved} className={saved ? '' : 'secondary'} onClick={() => setSaved(true)}>Saved recipes</button>
      <a href="#/new-recipe">Create a recipe</a>
    </div>
    {saved ? <p>Saved recipes will appear here when bookmarking is available.</p>
      : owned ? <RecipeGrid recipes={owned} empty="You have not shared any recipes yet." />
      : <Feedback error={error}>Loading your recipes…</Feedback>}
  </>;
}

function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(sessionKey));
    return session?.token && session?.user?.username && session.expires > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  const [session, setSession] = useState(readSession);
  useEffect(() => {
    const navigate = () => {
      setRoute(location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  function updateSession(data) {
    const value = data && { token: data.token, user: data.user, expires: Date.now() + 86400000 };
    try {
      if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
      else sessionStorage.removeItem(sessionKey);
    } catch {}
    setSession(value);
  }
  const [path, search] = route.split('?');
  const requestedNext = new URLSearchParams(search).get('next');
  const next = requestedNext === '/new-recipe' ? requestedNext : null;
  const match = /^\/recipes\/(\d+)(\/edit)?$/.exec(path);
  let page;
  if (path === '/' || path === '/recipes') page = <Feed browse={path === '/recipes'} />;
  else if (match) page = <RecipeDetail id={match[1]} editing={Boolean(match[2])} session={session} />;
  else if (path === '/new-recipe') page = <RecipeForm session={session} />;
  else if (path === '/login' || path === '/new-user') {
    page = <AccountForm register={path === '/new-user'} next={next} onLogin={updateSession} />;
  } else if (path === '/profile') {
    page = session ? <Profile session={session} /> : <AccountForm onLogin={updateSession} />;
  } else page = <section><h1>Page not found</h1><a href="#/">Back to home</a></section>;

  return <>
    <header>
      <a className="brand" href="#/">Recipe Sharing Platform</a>
      <nav aria-label="Main navigation">
        <a href="#/" aria-current={path === '/' ? 'page' : undefined}>Home</a>
        <a href="#/recipes" aria-current={path.startsWith('/recipes') ? 'page' : undefined}>Recipes</a>
        <a href="#/profile" aria-current={path === '/profile' ? 'page' : undefined}>My recipes</a>
        {session ? <button className="secondary" onClick={() => { updateSession(null); location.hash = '/'; }}>Sign out</button>
          : <a href="#/login" aria-current={path === '/login' ? 'page' : undefined}>Sign in</a>}
      </nav>
    </header>
    <main key={route}>{page}</main>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
