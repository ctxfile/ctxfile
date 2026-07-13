"use client";

import { useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context). The command is selectable text either way.
    }
  }

  return (
    <div className="install">
      <span className="install-prompt" aria-hidden="true">
        $
      </span>
      <code className="install-cmd">{command}</code>
      <button className="install-copy" onClick={copy} data-copied={copied} aria-label="Copy install command">
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
