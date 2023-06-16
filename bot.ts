import { Bot, Context, webhookCallback } from "grammy";
import dotenv from "dotenv";
import { Octokit } from "@octokit/core";
import fs from "fs";

type MyContext = Context;

dotenv.config();

const bot = new Bot<MyContext>(process.env.BOT_TOKEN || "");
const octokit = new Octokit({ auth: process.env.GH_TOKEN });
const channelId = process.env.CHANNEL_ID || "";

const getCommitsSinceDate = async (date: string) => {
  let response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
    owner: "DefiLlama",
    repo: "DefiLlama-Adapters",
    since: date,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return response.data;
};

const escapeMarkdown = (text: string) => {
  const specialCharacters = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escapedText = text;
  for (let character of specialCharacters) {
    const escapedChar = `\\${character}`;
    const regex = new RegExp(escapedChar, "g");
    escapedText = escapedText.replace(regex, escapedChar);
  }
  return escapedText;
};

const getLastCommitDate = () => {
  try {
    const data = fs.readFileSync("last_commit_date.txt", "utf8");
    return data.trim();
  } catch (err) {
    console.error("Error reading last commit date:", err);
    return "";
  }
};

const setLastCommitDate = (date: string) => {
  try {
    fs.writeFileSync("last_commit_date.txt", date);
  } catch (err) {
    console.error("Error writing last commit date:", err);
  }
};

const checkCommits = async () => {
  let lastCommitDate = getLastCommitDate() || new Date(Date.now() - 1000 * 60 * 60).toISOString();
  let date = new Date(new Date(lastCommitDate).getTime() + 1000).toISOString();
  console.log(`[${new Date().toLocaleString()}]: Getting since date: ${date}`);
  let commits = await getCommitsSinceDate(date);
  if (commits.length > 0) {
    commits.sort((a: any, b: any) => {
      return new Date(a.commit.committer.date).getTime() - new Date(b.commit.committer.date).getTime();
    });
    let message = "",
      i = 0;
    for (let commit of commits) {
      const escapedMessage = escapeMarkdown(commit.commit.message);
      const escapedUrl = escapeMarkdown(commit.html_url);
      message += `*${++i}\\)* [${escapedMessage}](${escapedUrl}) \n\n`;
      if (i === 10) {
        await bot.api.sendMessage(channelId, message, { parse_mode: "MarkdownV2" });
        message = "";
      }
    }
    await bot.api.sendMessage(channelId, message, { parse_mode: "MarkdownV2" });
    const lastCommitDate = commits[commits.length - 1].commit.committer?.date || "";
    setLastCommitDate(lastCommitDate);
  }
  await bot.api.sendMessage(channelId, "test");
  // Commit and push the updated last_commit_date.txt file
  const fileContent = getLastCommitDate();
  const commitMessage = `Update last_commit_date.txt: ${fileContent}`;

  try {
    const owner = "0xCaso";
    const repo = "defillama-adapters-notifications";
    const branch = "main";

    const response = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const sha = response.data.object.sha;

    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: "last_commit_date.txt",
      message: commitMessage,
      content: Buffer.from(fileContent).toString("base64"),
      branch,
      sha,
    });

    console.log("last_commit_date.txt committed and pushed successfully.");
  } catch (err) {
    console.error("Error committing and pushing last_commit_date.txt:", err);
  }
};

checkCommits();

bot.catch((err) => {
  console.log("Ooops", err);
});
