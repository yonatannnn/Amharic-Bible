import { createServer } from 'http';
import { canon, editions, names } from './canon.js';
import { booksIn, getChapter, getVerses, loadBook, editionMeta, hasEdition, editionIds } from './bible.js';
import { parseRefs } from './ref.js';

const DEFAULT_EDITION = process.env.BIBLE_EDITION ?? 'am-2000';
const PORT = Number(process.env.PORT ?? 4000);

const available = editionIds.filter(hasEdition);

const json = (res, code, body) => {
  const buf = Buffer.from(JSON.stringify(body, null, 2));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
    'access-control-allow-origin': '*',
  });
  res.end(buf);
};

const pickEdition = (url) => {
  const e = url.searchParams.get('edition') ?? DEFAULT_EDITION;
  return available.includes(e) ? e : null;
};

/** Human-readable label: "GAL 4:4-13", "ACT 2:13-40", "PSA 77:43,44", "MRK 2". */
function label(r, got) {
  const head = `${r.book} ${r.chapter}`;
  if (r.list?.length) return `${head}:${r.list.join(',')}`;
  if (r.toEnd) {
    const last = got.verses.at(-1)?.n;
    return `${head}:${r.start}${last && last !== r.start ? `-${last}` : ''}`;
  }
  if (r.start == null) return head;
  return `${head}:${r.start}${r.end && r.end !== r.start ? `-${r.end}` : ''}`;
}

/** Attach verse text to each parsed reference. */
function resolve(edition, refs) {
  return refs.map((r) => {
    if (r.error) return r;
    const got = getVerses(edition, r);
    if (!got) return { ...r, error: `not found in ${edition}` };
    return {
      ...r,
      reference: label(r, got),
      headings: got.headings,
      verses: got.verses.map((v) => ({ n: v.n, alt: v.alt, t: v.t })),
      text: got.verses.map((v) => v.t).join(' '),
    };
  });
}

const routes = [
  [/^\/health$/, () => ({ ok: true, editions: available, default: DEFAULT_EDITION })],

  [/^\/editions$/, () =>
    editions.map((e) => ({ ...e, available: available.includes(e.id) }))],

  [/^\/canon$/, () => canon],

  [/^\/names\/([a-z]+)$/, (m) => names(m[1])],
];

const server = createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return json(res, 400, { error: 'bad url' });
  }
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';

  try {
    for (const [re, handler] of routes) {
      const m = path.match(re);
      if (m) return json(res, 200, handler(m, url));
    }

    const edition = pickEdition(url);
    if (!edition) return json(res, 400, { error: 'unknown edition', available });

    if (path === '/') {
      return json(res, 200, {
        name: 'bible81 — EOTC 81-book Bible, local API',
        edition,
        endpoints: ['/health', '/editions', '/canon', '/names/:lang', '/books',
                    '/books/:bookId', '/books/:bookId/:chapter', '/ref?q=Gal 4:4-13'],
      });
    }

    if (path === '/books') return json(res, 200, booksIn(edition));

    if (path === '/ref') {
      const q = url.searchParams.get('q');
      if (!q) return json(res, 400, { error: 'missing ?q=' });
      return json(res, 200, { edition, query: q, refs: resolve(edition, parseRefs(q)) });
    }

    let m = path.match(/^\/books\/([^/]+)\/(\d+)$/);
    if (m) {
      const [refOne] = parseRefs(`${m[1]} ${m[2]}`);
      if (!refOne || refOne.error) return json(res, 404, { error: `unknown book: ${m[1]}` });
      const ch = getChapter(edition, refOne.book, m[2]);
      if (!ch) return json(res, 404, { error: `chapter not found` });
      return json(res, 200, { edition, book: refOne.book, ...ch });
    }

    m = path.match(/^\/books\/([^/]+)$/);
    if (m) {
      const [refOne] = parseRefs(`${m[1]} 1`);
      if (!refOne || refOne.error) return json(res, 404, { error: `unknown book: ${m[1]}` });
      const book = loadBook(edition, refOne.book);
      if (!book) return json(res, 404, { error: `book not in ${edition}` });
      const meta = editionMeta(edition);
      return json(res, 200, {
        edition, book: book.book,
        name: meta.names?.[book.book]?.name ?? refOne.book_name_en,
        chapters: book.chapters.map((c) => ({ n: c.n, verses: c.verses.length })),
      });
    }

    return json(res, 404, { error: 'no such route', path });
  } catch (err) {
    return json(res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(PORT, () => {
  console.log(`bible81 listening on http://localhost:${PORT}  (editions: ${available.join(', ')})`);
});
