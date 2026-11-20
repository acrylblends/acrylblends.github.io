# ACRYL ADE

**ACRYL ADE**, the Agent Development Environment: the ACRYL IDE (<https://github.com/acryldev/acryl>) as one Blend. Registry id `acryl.ade`. Home: <https://github.com/acrylblends/05-acryl-ade> (releases). Source: <https://github.com/acryldev/acryl/tree/main/apps/acryl-ade> (the ACRYL monorepo). Page: <https://acrylblends.github.io/blends/ai/ade/acryl.ade>.

It opens the IDE's workbench, ported into the Blends framework as `@acrylblends/workspace`:

- **left:** your projects, each with its git branches and worktrees, and the chats and terminals open on each;
- **centre:** tabs: the agent's chat (DeepSeek Harness), terminals, files, diffs;
- **right:** what the agent changed, the review of a turn, and the project's files.

The chat is the same agent ACRYL IDE runs, with its shell, file tools and jobs. Claude Code, Codex or any other terminal agent runs in a terminal tab beside it.

## Start

```bash
npm create acrylblends@latest my-ade -- --from acryl.ade
cd my-ade && npm run dev
```

The app, ready to install, is on the release page, <https://github.com/acrylblends/05-acryl-ade/releases/latest>: `ACRYL-ADE-mac-arm64.dmg`, `ACRYL-ADE-mac-x64.dmg`, `ACRYL-ADE-win-x64.exe`, `ACRYL-ADE-win-arm64.exe`, `ACRYL-ADE-linux-x64.deb`, `ACRYL-ADE-linux-arm64.deb`.

Its source is `apps/acryl-ade` in <https://github.com/acryldev/acryl>.
