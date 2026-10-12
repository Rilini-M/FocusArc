/*
  The only place FocusArc talks to the public AniList GraphQL API (https://docs.anilist.co/).
  The frontend never calls AniList directly: it calls our admin routes, which call this service.
*/

const { detectTraits } = require('./characterQuotes.service');

const ANILIST_URL = process.env.ANILIST_API_URL || 'https://graphql.anilist.co';
const TIMEOUT_MS = 15000;
const MAX_LIMIT = 50; // AniList's largest page size

// One page of characters: AniList id, full name, image and description.
const CHARACTERS_QUERY = `
  query ($page: Int, $perPage: Int, $search: String, $sort: [CharacterSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage lastPage hasNextPage }
      characters(search: $search, sort: $sort) {
        id
        name { full }
        image { large medium }
        description(asHtml: false)
      }
    }
  }
`;

// Specific characters by AniList id (used to add quotes to characters imported earlier).
const CHARACTERS_BY_ID_QUERY = `
  query ($ids: [Int], $perPage: Int) {
    Page(page: 1, perPage: $perPage) {
      characters(id_in: $ids) {
        id
        name { full }
        image { large medium }
        description(asHtml: false)
      }
    }
  }
`;

// Errors thrown here carry an HTTP status (and, for 429, how long to wait) so the controller can
// pass a clear message to the admin. Raw AniList or database details are never sent to the browser.
function aniListError(message, status, retryAfterSeconds) {
  const err = new Error(message);
  err.status = status;
  if (retryAfterSeconds) err.retryAfterSeconds = retryAfterSeconds;
  return err;
}

async function requestAniList(query, variables) {
  let response;
  try {
    // AbortSignal.timeout stops the request if AniList does not answer, so the server never hangs.
    response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw aniListError('AniList took too long to respond. Please try again later.', 504);
    }
    throw aniListError('AniList could not be reached. Please try again later.', 502);
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after')) || 60;
    const wait = `${retryAfter} second${retryAfter === 1 ? '' : 's'}`;
    throw aniListError(`AniList is limiting requests right now. Wait about ${wait} and try again.`, 429, retryAfter);
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw aniListError('AniList sent an unreadable response. Please try again later.', 502);
  }

  // GraphQL reports problems in an "errors" array, sometimes with HTTP 200.
  if (!response.ok || (body.errors && body.errors.length) || !body.data || !body.data.Page) {
    if (body && body.errors) console.error('AniList error:', JSON.stringify(body.errors).slice(0, 500));
    if (response.status >= 500 || response.ok) {
      throw aniListError('AniList is unavailable right now. Please try again later.', 502);
    }
    throw aniListError('AniList could not handle that page or search. Try page 1 or a different search.', 400);
  }

  return body.data.Page;
}

// AniList uses a "default.jpg" placeholder when a character has no picture; treat that as no image.
function imageUrlOf(character) {
  const image = character.image || {};
  const url = image.large || image.medium;
  if (!url || /\/default\.(jpg|png)$/i.test(url)) return null;
  return url;
}

// AniList descriptions are Markdown with spoiler tags (~!...!~) and info lines such as
// "__Height:__ 190 cm". Keep the first real sentence as a short description; the admin can
// edit it after importing.
function shortDescription(raw) {
  if (!raw) return '';
  const plain = raw
    .replace(/~!([\s\S]*?)!~/g, '') // spoilers
    .replace(/<[^>]*>/g, ' ') // stray HTML such as <br>
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [link text](url) -> link text
    .replace(/__|\*\*|~~/g, ''); // bold and strikethrough markers

  const lines = plain.split(/\n+/).map((line) => line.trim());
  const paragraph = lines.find((line) => line && !/^[^.]{1,40}:/.test(line)) || '';
  // A sentence ends at . ! or ? after two lowercase letters/digits, so initials like "D." in
  // "Monkey D. Luffy" or "Mr." do not cut it short.
  const sentence = (paragraph.match(/^.*?[a-z0-9]{2}[.!?](\s|$)/) || [paragraph])[0].trim();
  return sentence.length > 200 ? `${sentence.slice(0, 197).trimEnd()}...` : sentence;
}

// Keep only the fields FocusArc needs instead of the whole AniList response. `traits` are
// personality traits read from the full description, used to choose motivational quotes.
function simplify(character) {
  return {
    externalApiId: character.id,
    name: ((character.name && character.name.full) || '').trim(),
    imageUrl: imageUrlOf(character),
    description: shortDescription(character.description),
    traits: detectTraits(character.description),
  };
}

// One page of characters: most popular first, or best match first when searching.
async function fetchCharacters({ page, limit, search }) {
  const variables = {
    page,
    perPage: Math.min(limit, MAX_LIMIT),
    sort: search ? ['SEARCH_MATCH'] : ['FAVOURITES_DESC'],
  };
  if (search) variables.search = search;

  const result = await requestAniList(CHARACTERS_QUERY, variables);
  const pageInfo = result.pageInfo || {};

  return {
    characters: (result.characters || []).map(simplify),
    pagination: {
      currentPage: pageInfo.currentPage || page,
      lastPage: pageInfo.lastPage || page,
      hasNextPage: Boolean(pageInfo.hasNextPage),
    },
  };
}

// Up to 50 characters by AniList id, in one request.
async function fetchCharactersByIds(ids) {
  const result = await requestAniList(CHARACTERS_BY_ID_QUERY, { ids, perPage: Math.min(ids.length, MAX_LIMIT) });
  return (result.characters || []).map(simplify);
}

module.exports = { fetchCharacters, fetchCharactersByIds, MAX_LIMIT };
