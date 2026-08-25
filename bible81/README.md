# bible81 — local EOTC 81-book Bible API

Replaces the 66-book dataset behind `amharic-bible-api` (the one deployed on
Koyeb). Runs entirely from local JSON — no network call at request time.

```sh
cd bible81
npm start                 # http://localhost:4000
PORT=4123 npm start       # or pick a port
```

## Endpoints

| Route | What |
| --- | --- |
| `GET /health` | editions loaded |
| `GET /editions` | all nine editions in the upstream set, flagged by what is vendored here |
| `GET /canon` | the 99-entry book registry (ids, slugs, order, testament) |
| `GET /names/:lang` | UI book names — `am`, `gez`, `ti`, `om`, `en` |
| `GET /books` | books present in an edition, with chapter counts |
| `GET /books/:book` | one book's chapter list — `:book` accepts a slug, canon id, or abbreviation |
| `GET /books/:book/:chapter` | one chapter, with section headings |
| `GET /ref?q=...` | **parse and resolve free-form references** |

Every route takes `?edition=` (default `am-2000`).

### `/ref` — the one that matters

Built for the ግጻዌ lectionary tables, which are not written in any single
citation standard. It handles en-dashes, Ethiopic `፥`, spaces inside numbers,
discrete verse lists, semicolon-separated groups, and the trailing `f`
("to the end of the chapter"):

```sh
curl -G localhost:4000/ref --data-urlencode \
  "q=Gal 4 : 4 – 13; 1Pt 1 : 8- 13; Act 2 : 13 – f; Ps 77 : 43, 44; Mat 2 : 10 – 17"
```

Each returned ref carries `verses[]` (with `n`, Ge'ez numeral `alt`, and text
`t`) plus a flattened `text` string ready to post.

Measured against every reference in the twelve `gitsawe/pdfs/` month tables:
**2711 / 2835 = 95.6%** resolve to Amharic text. See *Known gaps* below for
what the remainder is.

## Data

`data/` is vendored from **[Nehemiah Open Source / 80-weahadu](https://github.com/EOTCOpenSource/80-weahadu)**
— the same project that runs <https://nehemiah-osc.org>. Upstream commit is
recorded in `data/SOURCE-COMMIT.txt`.

Vendored here: `am-2000` (89 books, official 2000 EC Amharic — the default)
and `gez-1980` (93 books, Ge'ez). Upstream also has `am-1980`, `am-1962`,
`am-nasv-2001`, `gez-2014`, `ti-1997`, `om-kitaaba`, `en-kjv`; filenames are
canon-stable, so adding one is dropping in a folder.

Why this and not the scrape: the same team publishes the data as clean JSON —
with cross-references, footnotes, section headings and Ge'ez verse numerals —
so cloning beats scraping the rendered site on quality, effort, and clarity of
provenance. Their `robots.txt` also disallows `/api/`.

### Licence — read before shipping

The data is **CC BY-NC-ND 4.0** (`LICENSE-DATA`). Three consequences:

* **BY** — the app must credit Nehemiah Open Source / 80-weahadu.
* **NC** — no commercial use. A free app is fine; ads, subscriptions or paid
  tiers are not, without written permission.
* **ND** — share the text verbatim. Reformatting JSON into SQLite or Postgres
  is a format change and is allowed; editing, "modernising" or paraphrasing
  the text is not.

`eotcopensource@gmail.com` is the contact, and the project is built for this
same community — worth an email before launch rather than after.

## Known gaps

* **Proverbs is split differently.** The EOTC canon runs Proverbs to 24
  chapters and puts Proverbs 25-29 + 31:10-31 in a separate book,
  መጽሐፈ ተግሣጽ (Book of Admonition). The lectionary PDFs cite Protestant
  numbering, so `src/ref.js` remaps `Pro 25-29, 31` automatically. **Proverbs
  30 and 31:1-9 have no chapter of their own** — that material sits inside the
  81-verse Proverbs 24 — so `Pro 30:x` does not resolve and would need a
  verse-level table.
* **The lectionary PDFs contain typos.** `Gal 7`, `Eph 7`, `Rom 17`, `Mrk 17`,
  `Heb 14` and `Mat 15:40-42` cite chapters and verses that do not exist in any
  canon. About 30 references across the year. They need a manual pass.
* **134 verses in `am-2000` are empty** (0.3%, mostly Esther). Upstream has a
  `corrections/` pipeline for exactly this; fixes belong there, not here.
