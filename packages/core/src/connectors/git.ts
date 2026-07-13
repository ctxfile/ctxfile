import { existsSync } from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import { truncateToTokens } from "../engine/tokens.js";
import type { GitState } from "../engine/types.js";
import { redactContent } from "../redact.js";
import type { Connector, SnapshotInput } from "./types.js";

const COMMIT_LIMIT = 15;
// Cap the diff summary so a huge working tree can't blow up the snapshot.
const DIFF_SUMMARY_MAX_TOKENS = 2_000;

function redact(text: string): string {
  return redactContent(text).text;
}

export const gitConnector: Connector = {
  name: "git",

  isEnabled(config): boolean {
    return existsSync(path.join(config.root, ".git"));
  },

  async snapshot({ config }: SnapshotInput) {
    const git = simpleGit({ baseDir: config.root });

    const [status, log, diffSummary] = await Promise.all([
      git.status(),
      git.log({ maxCount: COMMIT_LIMIT }),
      git.diff(["--stat"]),
    ]);

    const gitState: GitState = {
      branch: status.current ?? "(detached)",
      staged: status.staged,
      modified: status.modified.filter((f) => !status.staged.includes(f)),
      untracked: status.not_added,
      ahead: status.ahead,
      behind: status.behind,
      commits: log.all.map((c) => ({
        hash: c.hash,
        date: c.date,
        // Commit messages and author names are ingested content — redact them.
        message: redact(c.message),
        author: redact(c.author_name),
      })),
      diffSummary: redact(truncateToTokens(diffSummary.trim(), DIFF_SUMMARY_MAX_TOKENS).text),
    };

    return { gitState };
  },
};
