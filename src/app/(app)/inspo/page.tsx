import { readFile } from "node:fs/promises";
import path from "node:path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { InspoPage } from "./inspo-view";

// The media playbook lives in the repo. Edit docs/media-playbook.md and redeploy to update it here.
const PLAYBOOK = path.join(process.cwd(), "docs", "media-playbook.md");

async function readPlaybook() {
  try {
    const text = await readFile(PLAYBOOK, "utf8");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

export default async function Page() {
  const text = await readPlaybook();
  const playbook = text ? (
    <article className="doc-prose max-w-[760px]">
      <Markdown remarkPlugins={[remarkGfm]} components={{
        table: ({ children }) => <div className="doc-scroll"><table>{children}</table></div>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
      }}>{text}</Markdown>
    </article>
  ) : (
    <div className="card px-5 py-10 text-center max-w-[760px]">
      <div className="text-[15px]">No playbook yet</div>
      <div className="text-[13.5px] muted mt-1">It appears here once docs/media-playbook.md is in the repo and the app is redeployed.</div>
    </div>
  );
  return <InspoPage playbook={playbook} />;
}
