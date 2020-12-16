#!/usr/bin/env node

const process = require("process");

const { Command } = require("commander");
const { readJson } = require("fs-extra");

async function main() {
  let config = {};

  const program = new Command();
  program.arguments("<files...>");
  program.action((files) => (config = { files }));
  program.parse(process.argv);

  const objs = [];
  for (const file of config.files) {
    objs.push(await readJson(file));
  }

  generateMarkdownTable(objs);
}

function generateMarkdownTable(objs) {
  for (obj of objs) {
    const { repository, data } = obj;
    if (!data.pr || data.pr < 1) {
      continue;
    }

    console.log(`# ${repository}`);
    console.log(`- Pull requests: ${data.pr}`);
    console.log(`- Approvals total: ${data["pr.review.approval"]}`);
    for (const [user, count] of approvals(data)) {
      console.log(`- Approvals ${user}: ${count}`);
    }
    console.log();
  }
}

function approvals(data) {
  return Object.keys(data)
    .filter((key) => key.startsWith("pr.review.approval."))
    .map((key) => [key.substr(19), data[key]])
    .sort((a, b) => b[1] - a[1]);
}

if (require.main === module) {
  main().catch((err) => {
    process.exitCode = 1;
    console.error(err);
  });
}
