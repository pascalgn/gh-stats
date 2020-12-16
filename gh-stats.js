#!/usr/bin/env node

const process = require("process");

const { Command } = require("commander");
const { DateTime } = require("luxon");
const fetch = require("node-fetch");
const { stat, readJson, writeJson } = require("fs-extra");
require("dotenv").config();

async function main() {
  let config = {};

  const program = new Command();
  program.arguments("<repository> <from> <to>");
  program.action(
    (repository, from, to) =>
      (config = {
        repository,
        from: DateTime.fromISO(from),
        to: DateTime.fromISO(to),
      })
  );
  program.parse(process.argv);

  return pullRequestInfo(config);
}

class Stats {
  constructor() {
    this._stats = new Map();
  }

  increment(...keys) {
    const incr = (keys) => {
      const key = keys.join(".");
      if (this._stats.has(key)) {
        this._stats.set(key, this._stats.get(key) + 1);
      } else {
        this._stats.set(key, 1);
      }
    };
    incr(keys);
    if (keys.length > 1) {
      incr(keys.slice(0, -1));
    }
  }

  stats() {
    return new Map([...this._stats.entries()].sort());
  }

  object() {
    const obj = {};
    for (let [key, value] of this.stats()) {
      obj[key] = value;
    }
    return obj;
  }
}

async function pullRequestInfo({ repository, from, to }) {
  const stats = new Stats();

  const root = `/repos/${repository}`;

  const list = await get(
    `${root}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
    false
  );

  for (const pr of list) {
    const { number, title, user, created_at, updated_at, merged_at } = pr;
    if (merged_at == null) {
      continue;
    }

    const merged = DateTime.fromISO(merged_at);
    if (merged < from || merged > to) {
      continue;
    }

    console.error(number, merged_at, user.login, title);

    stats.increment("pr");

    const approved = [];

    const reviews = await pullRequestReviews(root, number);
    for (const review of reviews) {
      stats.increment("pr.review", review.state);

      if (review.state === "APPROVED") {
        if (addIfMissing(approved, review.user.login)) {
          stats.increment("pr.review.approval", review.user.login);
        }
      }

      const comments = await get(
        `${root}/pulls/${number}/reviews/${review.id}/comments`
      );
      for (const comment of comments) {
        if (comment.in_reply_to_id == null) {
          stats.increment("pr.review.comment", comment.user.login);
        } else {
          stats.increment("pr.review.reply", comment.user.login);
        }
      }
    }

    const commits = await get(`${root}/pulls/${number}/commits`);
    for (const commit of commits) {
      if (commit.author) {
        stats.increment("pr.commit", commit.author.login);
      }
    }
  }

  console.log(JSON.stringify({ repository, data: stats.object() }, null, 2));
}

async function pullRequestReviews(root, number) {
  let reviews = [];
  for (let page = 1; page < 10; page++) {
    const p = page === 1 ? "" : `?page=${page}`;
    const arr = await get(`${root}/pulls/${number}/reviews${p}`).catch((e) =>
      e.status === 404 ? null : Promise.reject(e)
    );
    if (arr == null) {
      break;
    } else {
      reviews = reviews.concat(arr);
      if (arr.length < 30) {
        break;
      }
    }
  }
  return reviews;
}

function addIfMissing(arr, obj) {
  return arr.includes(obj) ? false : arr.push(obj) || true;
}

async function get(path, useCache = true) {
  const { GITHUB_TOKEN: token, CACHE: cache } = process.env;
  if (!token) {
    throw new Error("Missing environment variable: GITHUB_TOKEN");
  }

  const url = `https://api.github.com${path}`;
  const headers = { authorization: `token ${token}` };

  const doFetch = async () => {
    console.error(`Fetching ${url} ...`);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  };

  if (useCache && cache) {
    const stats = await stat(cache);
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${cache}`);
    }

    const key = path.replace(/[^A-Za-z0-9]/g, "_");
    const file = `${cache}/${key}.json`;

    const cached = await readJson(file).catch((e) =>
      e.code === "ENOENT" ? null : Promise.reject(e)
    );

    if (cached == null) {
      const obj = await doFetch();
      await writeJson(file, obj);
      return obj;
    } else {
      return cached;
    }
  } else {
    return doFetch();
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.exitCode = 1;
    console.error(err);
  });
}
