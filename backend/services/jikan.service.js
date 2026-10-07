/*
  The only place FocusArc talks to the public Jikan API (https://docs.jikan.moe/).
  The frontend never calls Jikan directly: it calls our admin routes, which call this service.
*/

const JIKAN_BASE_URL = process.env.JIKAN_API_URL || 'https://api.jikan.moe/v4';
const TIMEOUT_MS = 10000;
const MAX_LIMIT = 25; // Jikan's maximum page size

// Errors thrown here carry an HTTP status so the controller can pass a clear message to the admin.
function jikanError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function requestJikan(path) {
  let response;
  try {
    // AbortSignal.timeout stops the request if Jikan does not answer, so the server never hangs.
    response = await fetch(`${JIKAN_BASE_URL}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw jikanError('The Jikan API took too long to respond. Please try again.', 504);
    }
    throw jikanError('Could not reach the Jikan API. Check your internet connection and try again.', 502);
  }

  if (response.status === 429) {
    throw jikanError('Jikan is limiting requests right now. Wait a few seconds and try again.', 429);
  }
  if (response.status === 400) {
    throw jikanError('Jikan could not handle that page or search. Try page 1 or a different search.', 400);
  }
  if (!response.ok) {
    throw jikanError('The Jikan API is unavailable right now. Please try again later.', 502);
  }

  try {
    return await response.json();
  } catch (err) {
    throw jikanError('The Jikan API sent an unreadable response. Please try again.', 502);
  }
}

// Jikan shows a "question mark" placeholder when a character has no picture; treat that as no image.
function imageUrlOf(character) {
  const url = character.images && character.images.jpg && character.images.jpg.image_url;
  if (!url || url.includes('questionmark')) return null;
  return url;
}

// Jikan's "about" text is long (often starting with "Age: ..." lines), so keep its first real
// sentence as a short description. The admin can edit it after importing.
function shortDescription(about) {
  if (!about) return '';
  const lines = about.split(/\n+/).map((line) => line.trim());
  const paragraph = lines.find((line) => line && !/^[^.]{1,40}:/.test(line)) || '';
  // A sentence ends at . ! or ? after two lowercase letters/digits, so initials like "D." in
  // "Monkey D. Luffy" or "Mr." do not cut it short.
  const sentence = (paragraph.match(/^.*?[a-z0-9]{2}[.!?](\s|$)/) || [paragraph])[0].trim();
  return sentence.length > 200 ? `${sentence.slice(0, 197).trimEnd()}...` : sentence;
}

// Keep only the fields FocusArc needs instead of the whole Jikan response.
function simplify(character) {
  return {
    externalApiId: character.mal_id,
    name: character.name,
    imageUrl: imageUrlOf(character),
    description: shortDescription(character.about),
  };
}

// One page of characters, most popular first. `search` is optional.
async function fetchCharacters({ page, limit, search }) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(Math.min(limit, MAX_LIMIT)),
    order_by: 'favorites',
    sort: 'desc',
  });
  if (search) params.set('q', search);

  const body = await requestJikan(`/characters?${params}`);
  const pagination = body.pagination || {};

  return {
    characters: (body.data || []).map(simplify),
    pagination: {
      currentPage: pagination.current_page || page,
      lastPage: pagination.last_visible_page || page,
      hasNextPage: Boolean(pagination.has_next_page),
    },
  };
}

module.exports = { fetchCharacters, MAX_LIMIT };
