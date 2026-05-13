import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getDraftFilePath } from "@/lib/draft-path";
import { parseLeadingJsonValue } from "@/lib/parse-leading-json";

type NovelMetaLite = {
  id: string;
  authorId: string;
  title: string;
};

type AuthorNovelsIndex = {
  authorId: string;
  novels: NovelMetaLite[];
};

export type WorkVersionMeta = {
  workId: string;
  ownerId: string;
  defaultBranchId: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkBranch = {
  id: string;
  workId: string;
  ownerId: string;
  name: string;
  displayName: string;
  description: string;
  branchType:
    | "main"
    | "draft"
    | "alternate_timeline"
    | "translation"
    | "fanfic"
    | "adaptation"
    | "audiobook"
    | "ai_variant";
  parentBranchId: string | null;
  baseCommitId: string | null;
  headCommitId: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type WorkCommit = {
  id: string;
  workId: string;
  branchId: string;
  authorId: string;
  parentCommitId: string | null;
  message: string;
  commitType: "manual" | "auto_save" | "ai_reflow" | "translation" | "import" | "merge" | "publish";
  createdAt: string;
};

export type WorkSnapshot = {
  version: 1;
  workId: string;
  authorId: string;
  structure: unknown | null;
  draft: unknown | null;
};

function safeAuthorId(id: string) {
  return id.toLowerCase();
}

function safeWorkId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function safeBranchId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function authorIndexPath(authorId: string) {
  return path.join(process.cwd(), ".data", "novels", "authors", `${safeAuthorId(authorId)}.json`);
}

function structurePath(authorId: string, docId: string) {
  const safeDoc = docId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(process.cwd(), ".data", "structure", `${safeAuthorId(authorId)}_${safeDoc}.json`);
}

function workRootPath(workId: string) {
  return path.join(process.cwd(), ".data", "versioning", "works", safeWorkId(workId));
}

function workMetaPath(workId: string) {
  return path.join(workRootPath(workId), "meta.json");
}

function workBranchesDir(workId: string) {
  return path.join(workRootPath(workId), "branches");
}

function workCommitsDir(workId: string) {
  return path.join(workRootPath(workId), "commits");
}

function workSnapshotsDir(workId: string) {
  return path.join(workRootPath(workId), "snapshots");
}

function branchFilePath(workId: string, branchId: string) {
  return path.join(workBranchesDir(workId), `${safeBranchId(branchId)}.json`);
}

function commitFilePath(workId: string, commitId: string) {
  return path.join(workCommitsDir(workId), `${commitId}.json`);
}

function snapshotFilePath(workId: string, commitId: string) {
  return path.join(workSnapshotsDir(workId), `${commitId}.json`);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

async function readJsonFile<T>(fp: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(fp, "utf8");
    return parseLeadingJsonValue(raw) as T;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return null;
    throw e;
  }
}

async function writeJsonFile(fp: string, value: unknown) {
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(value, null, 2), "utf8");
}

export async function readOwnedNovel(authorId: string, workId: string): Promise<NovelMetaLite | null> {
  const idx = (await readJsonFile<AuthorNovelsIndex>(authorIndexPath(authorId))) ?? {
    authorId: safeAuthorId(authorId),
    novels: [],
  };
  return idx.novels.find((n) => n.id === workId) ?? null;
}

async function readWorkMeta(workId: string): Promise<WorkVersionMeta | null> {
  return readJsonFile<WorkVersionMeta>(workMetaPath(workId));
}

async function writeWorkMeta(meta: WorkVersionMeta) {
  await writeJsonFile(workMetaPath(meta.workId), meta);
}

export async function readBranch(workId: string, branchId: string): Promise<WorkBranch | null> {
  return readJsonFile<WorkBranch>(branchFilePath(workId, branchId));
}

export async function listBranches(workId: string): Promise<WorkBranch[]> {
  try {
    const dir = workBranchesDir(workId);
    const names = await fs.readdir(dir);
    const branches: WorkBranch[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const b = await readJsonFile<WorkBranch>(path.join(dir, name));
      if (b) branches.push(b);
    }
    branches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return branches;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
}

export async function ensureVersioningRoot(workId: string, ownerId: string) {
  const now = new Date().toISOString();
  let meta = await readWorkMeta(workId);
  if (!meta) {
    meta = {
      workId,
      ownerId: safeAuthorId(ownerId),
      defaultBranchId: "main",
      createdAt: now,
      updatedAt: now,
    };
    await writeWorkMeta(meta);
  }
  const maybeMain = await readBranch(workId, "main");
  if (!maybeMain) {
    const main: WorkBranch = {
      id: "main",
      workId,
      ownerId: safeAuthorId(ownerId),
      name: "main",
      displayName: "main",
      description: "官方主线",
      branchType: "main",
      parentBranchId: null,
      baseCommitId: null,
      headCommitId: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await writeJsonFile(branchFilePath(workId, main.id), main);
  }
}

export async function createBranch(params: {
  workId: string;
  ownerId: string;
  name: string;
  displayName?: string;
  description?: string;
  sourceBranchId?: string;
  branchType?: WorkBranch["branchType"];
}): Promise<WorkBranch> {
  const now = new Date().toISOString();
  const sourceId = params.sourceBranchId?.trim() || "main";
  const source = await readBranch(params.workId, sourceId);
  if (!source) throw new Error("source_branch_not_found");
  const existed = await readBranch(params.workId, params.name);
  if (existed) throw new Error("branch_name_exists");
  const branch: WorkBranch = {
    id: params.name,
    workId: params.workId,
    ownerId: safeAuthorId(params.ownerId),
    name: params.name,
    displayName: (params.displayName?.trim() || params.name).slice(0, 80),
    description: (params.description?.trim() || "").slice(0, 400),
    branchType: params.branchType ?? "alternate_timeline",
    parentBranchId: source.id,
    baseCommitId: source.headCommitId,
    headCommitId: source.headCommitId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(branchFilePath(params.workId, branch.id), branch);
  const meta = await readWorkMeta(params.workId);
  if (meta) {
    meta.updatedAt = now;
    await writeWorkMeta(meta);
  }
  return branch;
}

export async function listCommits(workId: string, branchId: string): Promise<WorkCommit[]> {
  try {
    const names = await fs.readdir(workCommitsDir(workId));
    const commits: WorkCommit[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const c = await readJsonFile<WorkCommit>(path.join(workCommitsDir(workId), name));
      if (c && c.branchId === branchId) commits.push(c);
    }
    commits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return commits;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
}

async function captureLiveSnapshot(authorId: string, workId: string): Promise<WorkSnapshot> {
  const structure = await readJsonFile<unknown>(structurePath(authorId, workId));
  const draft = await readJsonFile<unknown>(getDraftFilePath(process.cwd(), authorId, workId));
  return {
    version: 1,
    workId,
    authorId: safeAuthorId(authorId),
    structure,
    draft,
  };
}

async function writeSnapshotToLive(snapshot: WorkSnapshot) {
  const structureFp = structurePath(snapshot.authorId, snapshot.workId);
  const draftFp = getDraftFilePath(process.cwd(), snapshot.authorId, snapshot.workId);
  if (snapshot.structure == null) {
    await fs.rm(structureFp, { force: true });
  } else {
    await writeJsonFile(structureFp, snapshot.structure);
  }
  if (snapshot.draft == null) {
    await fs.rm(draftFp, { force: true });
  } else {
    await writeJsonFile(draftFp, snapshot.draft);
  }
}

export async function createCommitFromLive(params: {
  workId: string;
  branchId: string;
  authorId: string;
  message: string;
  commitType?: WorkCommit["commitType"];
}) {
  const branch = await readBranch(params.workId, params.branchId);
  if (!branch) throw new Error("branch_not_found");
  const now = new Date().toISOString();
  const id = newId("cmt");
  const commit: WorkCommit = {
    id,
    workId: params.workId,
    branchId: params.branchId,
    authorId: safeAuthorId(params.authorId),
    parentCommitId: branch.headCommitId,
    message: params.message.trim().slice(0, 200),
    commitType: params.commitType ?? "manual",
    createdAt: now,
  };
  const snapshot = await captureLiveSnapshot(params.authorId, params.workId);
  await writeJsonFile(commitFilePath(params.workId, id), commit);
  await writeJsonFile(snapshotFilePath(params.workId, id), snapshot);
  const nextBranch: WorkBranch = {
    ...branch,
    headCommitId: id,
    baseCommitId: branch.baseCommitId ?? id,
    updatedAt: now,
  };
  await writeJsonFile(branchFilePath(params.workId, params.branchId), nextBranch);
  return commit;
}

export async function getCommit(workId: string, commitId: string): Promise<WorkCommit | null> {
  return readJsonFile<WorkCommit>(commitFilePath(workId, commitId));
}

export async function restoreBranchToCommit(params: {
  workId: string;
  branchId: string;
  commitId: string;
  authorId: string;
  updateHead?: boolean;
}) {
  const branch = await readBranch(params.workId, params.branchId);
  if (!branch) throw new Error("branch_not_found");
  const commit = await getCommit(params.workId, params.commitId);
  if (!commit || commit.branchId !== params.branchId) throw new Error("commit_not_found");
  const snapshot = await readJsonFile<WorkSnapshot>(snapshotFilePath(params.workId, params.commitId));
  if (!snapshot) throw new Error("snapshot_not_found");
  await writeSnapshotToLive(snapshot);
  if (params.updateHead !== false) {
    const now = new Date().toISOString();
    const next: WorkBranch = {
      ...branch,
      headCommitId: commit.id,
      updatedAt: now,
    };
    await writeJsonFile(branchFilePath(params.workId, params.branchId), next);
  }
  return commit;
}

