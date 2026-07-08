"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FolderLite, ProjectCardData } from "@/lib/types";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS } from "@/lib/constants";

const DT_PROJECT = "text/project-id";
const DT_FOLDER = "text/folder-id";

type ViewMode = "tree" | "icons" | "list";

export default function ProjectsIndex({
  folders,
  projects,
  canEdit = true,
}: {
  folders: FolderLite[];
  projects: ProjectCardData[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [view, setViewState] = useState<ViewMode>("tree");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [archiveCurrentId, setArchiveCurrentId] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(0);
  const [query, setQuery] = useState("");
  const [navigating, setNavigating] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 変更系の共通ラッパー：fetch 中＋refresh 完了までローディング表示
  async function withBusy(fn: () => Promise<void>) {
    setBusy((b) => b + 1);
    try {
      await fn();
      startTransition(() => router.refresh());
    } finally {
      setBusy((b) => b - 1);
    }
  }

  useEffect(() => {
    const v = window.localStorage.getItem("ptm-projects-view");
    if (v === "tree" || v === "icons" || v === "list") setViewState(v);
  }, []);

  function setView(v: ViewMode) {
    setViewState(v);
    window.localStorage.setItem("ptm-projects-view", v);
  }

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const activeFolders = folders.filter((f) => !f.archived);
  const childrenOf = (parentId: string | null) =>
    activeFolders.filter((f) => (f.parentId ?? null) === parentId);
  const projectsIn = (folderId: string | null) =>
    active.filter((p) => p.folderId === folderId);
  // アーカイブ側
  const archivedFolderRoots = folders.filter(
    (f) =>
      f.archived &&
      (!f.parentId || !folders.find((x) => x.id === f.parentId)?.archived)
  );
  const archivedChildrenOf = (parentId: string) =>
    folders.filter((f) => f.archived && f.parentId === parentId);
  const looseArchived = archived.filter(
    (p) => !p.folderId || !folders.find((f) => f.id === p.folderId)?.archived
  );
  // アーカイブ内ナビ（アイコン/リスト表示用）
  const archivedKidsOf = (parentId: string | null) =>
    parentId === null ? archivedFolderRoots : archivedChildrenOf(parentId);
  const archivedProjectsIn = (folderId: string | null) =>
    folderId === null
      ? looseArchived
      : archived.filter((p) => p.folderId === folderId);

  async function patchProject(
    id: string,
    data: { folderId?: string | null; archived?: boolean }
  ) {
    setMenuId(null);
    await withBusy(async () => {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    });
  }

  async function moveFolder(id: string, parentId: string | null) {
    if (id === parentId) return;
    // クライアント側の循環ガード
    let cur = parentId;
    while (cur) {
      if (cur === id) return;
      cur = folders.find((f) => f.id === cur)?.parentId ?? null;
    }
    await withBusy(async () => {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "移動に失敗しました");
      }
    });
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    await withBusy(async () => {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          // アイコンビューでは現在のフォルダ内に作成
          parentId: view === "icons" ? currentId : null,
        }),
      });
      if (res.ok) {
        setFolderName("");
        setAddingFolder(false);
      } else {
        alert("フォルダの作成に失敗しました");
      }
    });
  }

  async function renameFolder(f: FolderLite) {
    const name = prompt("フォルダ名", f.name);
    if (!name?.trim() || name === f.name) return;
    await withBusy(async () => {
      await fetch(`/api/folders/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    });
  }

  async function archiveFolder(f: FolderLite) {
    if (!confirm(`フォルダ「${f.name}」を中身ごとアーカイブしますか？`))
      return;
    await withBusy(async () => {
      let res = await fetch(`/api/folders/${f.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 409) {
        if (
          !confirm(
            `アーカイブに同名のフォルダ「${f.name}」があります。中身を統合してもいいですか？`
          )
        )
          return;
        res = await fetch(`/api/folders/${f.id}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merge: true }),
        });
      }
      if (!res.ok) alert("アーカイブに失敗しました");
    });
  }

  async function createArchivedFolder(parentId: string | null) {
    const name = prompt("アーカイブ内に作成するフォルダ名");
    if (!name?.trim()) return;
    await withBusy(async () => {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentId, archived: true }),
      });
      if (!res.ok) alert("フォルダの作成に失敗しました");
    });
  }

  async function restoreFolder(f: FolderLite) {
    await withBusy(async () => {
      const res = await fetch(`/api/folders/${f.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) alert("復元に失敗しました");
    });
  }

  async function deleteFolder(f: FolderLite) {
    if (
      !confirm(
        `フォルダ「${f.name}」を削除しますか？（中のプロジェクトは未分類、サブフォルダは最上位に戻ります）`
      )
    )
      return;
    await withBusy(async () => {
      await fetch(`/api/folders/${f.id}`, { method: "DELETE" });
    });
  }

  // ---------- Drag & Drop ----------
  function hasOurData(e: React.DragEvent) {
    return (
      e.dataTransfer.types.includes(DT_PROJECT) ||
      e.dataTransfer.types.includes(DT_FOLDER)
    );
  }

  function dragOver(e: React.DragEvent, targetKey: string) {
    if (!canEdit || !hasOurData(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== targetKey) setDropTarget(targetKey);
  }

  function drop(
    e: React.DragEvent,
    target:
      | { folderId: string | null; toArchived?: boolean }
      | { archive: true }
  ) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const projectId = e.dataTransfer.getData(DT_PROJECT);
    const folderId = e.dataTransfer.getData(DT_FOLDER);
    if (projectId) {
      if ("archive" in target) {
        patchProject(projectId, { archived: true });
      } else {
        patchProject(projectId, {
          folderId: target.folderId,
          archived: target.toArchived ?? false,
        });
      }
    } else if (folderId) {
      const f = folders.find((x) => x.id === folderId);
      if ("archive" in target) {
        if (f) archiveFolder(f);
      } else if (!("toArchived" in target) || !target.toArchived) {
        moveFolder(folderId, target.folderId);
      } else if (f?.archived) {
        // アーカイブ内でのフォルダ移動
        moveFolder(folderId, target.folderId);
      }
    }
  }

  const dropHighlight = (key: string) =>
    dropTarget === key ? "bg-neutral-100 ring-1 ring-neutral-400" : "";

  // ステータス別タスク数（0件のステータスは省略）
  function TaskBreakdown({ p }: { p: ProjectCardData }) {
    if (p._count.tasks === 0) {
      return <span>タスク 0</span>;
    }
    return (
      <span className="flex items-center gap-2">
        <span>タスク {p._count.tasks}</span>
        <span className="flex items-center gap-1.5">
          {STATUS_ORDER.map((s) => {
            const n = p.statusCounts?.[s] ?? 0;
            if (n === 0) return null;
            return (
              <span
                key={s}
                className="flex items-center gap-0.5"
                title={STATUS_LABELS[s]}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: STATUS_COLORS[s] }}
                />
                {n}
              </span>
            );
          })}
        </span>
      </span>
    );
  }

  // ---------- パーツ ----------
  function Card({ p }: { p: ProjectCardData }) {
    return (
      <div
        className="group relative"
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.setData(DT_PROJECT, p.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <Link
          href={`/projects/${p.id}`}
          onClick={() => setNavigating(true)}
          className="block overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:border-neutral-400"
        >
          {p.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.thumbnailUrl}
              alt=""
              className="aspect-[16/7] w-full border-b border-neutral-100 object-cover"
            />
          )}
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2 pr-6">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <h2 className="truncate font-medium text-neutral-900">
                {p.name}
              </h2>
            </div>
            {p.description && (
              <p className="mb-3 line-clamp-2 text-sm text-neutral-500">
                {p.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
              <TaskBreakdown p={p} />
              <span>メンバー {p._count.members}</span>
            </div>
          </div>
        </Link>

        {canEdit && (
          <button
            onClick={() => setMenuId(menuId === p.id ? null : p.id)}
            className="absolute right-3 top-4 rounded-md px-1.5 py-0.5 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-600"
            title="メニュー"
          >
            ⋯
          </button>
        )}

        {menuId === p.id && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setMenuId(null)}
            />
            <div className="absolute right-2 top-10 z-30 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                フォルダへ移動
              </p>
              {p.folderId && (
                <button
                  onClick={() => patchProject(p.id, { folderId: null })}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  未分類に戻す
                </button>
              )}
              {activeFolders
                .filter((f) => f.id !== p.folderId)
                .map((f) => (
                  <button
                    key={f.id}
                    onClick={() => patchProject(p.id, { folderId: f.id })}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    📁 {f.name}
                  </button>
                ))}
              <div className="my-1 border-t border-neutral-100" />
              {p.archived ? (
                <button
                  onClick={() => patchProject(p.id, { archived: false })}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  アーカイブから戻す
                </button>
              ) : (
                <button
                  onClick={() =>
                    patchProject(p.id, { archived: true, folderId: null })
                  }
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  アーカイブへ移動
                </button>
              )}
              {folders.filter((f) => f.archived).length > 0 && (
                <>
                  <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                    アーカイブ内のフォルダへ
                  </p>
                  {folders
                    .filter((f) => f.archived && f.id !== p.folderId)
                    .map((f) => (
                      <button
                        key={f.id}
                        onClick={() =>
                          patchProject(p.id, {
                            archived: true,
                            folderId: f.id,
                          })
                        }
                        className="block w-full truncate px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        📦 📁 {f.name}
                      </button>
                    ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  function Grid({ list }: { list: ProjectCardData[] }) {
    if (list.length === 0)
      return (
        <p className="rounded-lg border border-dashed border-neutral-200 p-4 text-sm text-neutral-400">
          プロジェクトがありません
        </p>
      );
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Card key={p.id} p={p} />
        ))}
      </div>
    );
  }

  function FolderSection({ f, depth }: { f: FolderLite; depth: number }) {
    const list = projectsIn(f.id);
    const kids = childrenOf(f.id);
    return (
      <section
        onDragOver={(e) => dragOver(e, `folder:${f.id}`)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, { folderId: f.id })}
        className={`rounded-lg transition ${
          depth > 0 ? "ml-5 border-l border-neutral-100 pl-4" : ""
        } ${dropHighlight(`folder:${f.id}`)}`}
      >
        <div
          draggable={canEdit}
          onDragStart={(e) => {
            e.dataTransfer.setData(DT_FOLDER, f.id);
            e.dataTransfer.effectAllowed = "move";
            e.stopPropagation();
          }}
          className={`mb-3 flex items-center gap-2 rounded-md px-1.5 py-1 ${
            canEdit ? "cursor-grab" : ""
          }`}
        >
          <h2 className="text-sm font-semibold tracking-wide text-neutral-700">
            📁 {f.name}
          </h2>
          <span className="text-xs text-neutral-400">{list.length}</span>
          {canEdit && (
            <>
              <button
                onClick={() => renameFolder(f)}
                className="text-xs text-neutral-300 hover:text-neutral-600"
                title="名前を変更"
              >
                ✎
              </button>
              <button
                onClick={() => archiveFolder(f)}
                className="text-xs text-neutral-300 hover:text-neutral-600"
                title="フォルダごとアーカイブ"
              >
                📦
              </button>
              <button
                onClick={() => deleteFolder(f)}
                className="text-xs text-neutral-300 hover:text-red-500"
                title="フォルダを削除"
              >
                ✕
              </button>
            </>
          )}
        </div>
        <Grid list={list} />
        {kids.length > 0 && (
          <div className="mt-4 space-y-6">
            {kids.map((k) => (
              <FolderSection key={k.id} f={k} depth={depth + 1} />
            ))}
          </div>
        )}
      </section>
    );
  }

  function ArchivedFolderSection({
    f,
    depth,
  }: {
    f: FolderLite;
    depth: number;
  }) {
    const list = archived.filter((p) => p.folderId === f.id);
    const kids = archivedChildrenOf(f.id);
    return (
      <section
        onDragOver={(e) => dragOver(e, `folder:${f.id}`)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, { folderId: f.id, toArchived: true })}
        className={`rounded-lg transition ${
          depth > 0 ? "ml-5 border-l border-neutral-100 pl-4" : ""
        } ${dropHighlight(`folder:${f.id}`)}`}
      >
        <div className="mb-3 flex items-center gap-2 rounded-md px-1.5 py-1">
          <h3 className="text-sm font-semibold tracking-wide text-neutral-500">
            📁 {f.name}
          </h3>
          <span className="text-xs text-neutral-400">{list.length}</span>
          {canEdit && (
            <>
              <button
                onClick={() => restoreFolder(f)}
                className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 transition hover:border-neutral-400"
              >
                復元
              </button>
              <button
                onClick={() => renameFolder(f)}
                className="text-xs text-neutral-300 hover:text-neutral-600"
                title="名前を変更"
              >
                ✎
              </button>
              <button
                onClick={() => createArchivedFolder(f.id)}
                className="text-xs text-neutral-300 hover:text-neutral-600"
                title="サブフォルダを作成"
              >
                ＋
              </button>
              <button
                onClick={() => deleteFolder(f)}
                className="text-xs text-neutral-300 hover:text-red-500"
                title="フォルダを削除"
              >
                ✕
              </button>
            </>
          )}
        </div>
        <Grid list={list} />
        {kids.length > 0 && (
          <div className="mt-4 space-y-6">
            {kids.map((k) => (
              <ArchivedFolderSection key={k.id} f={k} depth={depth + 1} />
            ))}
          </div>
        )}
      </section>
    );
  }

  function FolderTile({ f }: { f: FolderLite }) {
    const count = projectsIn(f.id).length + childrenOf(f.id).length;
    return (
      <div
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.setData(DT_FOLDER, f.id);
          e.dataTransfer.effectAllowed = "move";
          e.stopPropagation();
        }}
        onDragOver={(e) => dragOver(e, `folder:${f.id}`)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, { folderId: f.id })}
        onClick={() => setCurrentId(f.id)}
        className={`group flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border border-transparent p-3 text-center transition hover:bg-neutral-50 ${dropHighlight(
          `folder:${f.id}`
        )}`}
        title={f.name}
      >
        <span className="text-4xl leading-none">📁</span>
        <span className="w-full truncate text-sm text-neutral-700">
          {f.name}
        </span>
        <span className="text-[11px] text-neutral-400">{count}件</span>
        {canEdit && (
          <span className="invisible flex gap-2 group-hover:visible">
            <button
              onClick={(e) => {
                e.stopPropagation();
                renameFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-neutral-600"
              title="名前を変更"
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                archiveFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-neutral-600"
              title="フォルダごとアーカイブ"
            >
              📦
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-red-500"
              title="フォルダを削除"
            >
              ✕
            </button>
          </span>
        )}
      </div>
    );
  }

  function FolderRow({ f }: { f: FolderLite }) {
    const count = projectsIn(f.id).length + childrenOf(f.id).length;
    return (
      <div
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.setData(DT_FOLDER, f.id);
          e.dataTransfer.effectAllowed = "move";
          e.stopPropagation();
        }}
        onDragOver={(e) => dragOver(e, `folder:${f.id}`)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, { folderId: f.id })}
        onClick={() => setCurrentId(f.id)}
        className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-neutral-50 ${dropHighlight(
          `folder:${f.id}`
        )}`}
      >
        <span className="text-lg leading-none">📁</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
          {f.name}
        </span>
        <span className="shrink-0 text-xs text-neutral-400">{count}件</span>
        {canEdit && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                renameFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-neutral-600"
              title="名前を変更"
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                archiveFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-neutral-600"
              title="フォルダごとアーカイブ"
            >
              📦
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-red-500"
              title="フォルダを削除"
            >
              ✕
            </button>
          </>
        )}
        <span className="text-neutral-300">›</span>
      </div>
    );
  }

  function ProjectRow({ p }: { p: ProjectCardData }) {
    return (
      <div
        className="relative"
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.setData(DT_PROJECT, p.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <Link
          href={`/projects/${p.id}`}
          onClick={() => setNavigating(true)}
          className="flex items-center gap-3 py-2.5 pl-4 pr-10 transition hover:bg-neutral-50"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
          <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">
            {p.name}
          </span>
          {p.description && (
            <span className="hidden max-w-64 shrink-0 truncate text-xs text-neutral-400 md:block">
              {p.description}
            </span>
          )}
          <span className="shrink-0 text-xs text-neutral-400">
            <TaskBreakdown p={p} />
          </span>
          <span className="w-20 shrink-0 text-right text-xs text-neutral-400">
            メンバー {p._count.members}
          </span>
        </Link>

        {canEdit && (
          <button
            onClick={() => setMenuId(menuId === p.id ? null : p.id)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-600"
            title="メニュー"
          >
            ⋯
          </button>
        )}

        {menuId === p.id && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setMenuId(null)}
            />
            <div className="absolute right-2 top-9 z-30 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
              <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                フォルダへ移動
              </p>
              {p.folderId && (
                <button
                  onClick={() => patchProject(p.id, { folderId: null })}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  未分類に戻す
                </button>
              )}
              {activeFolders
                .filter((f) => f.id !== p.folderId)
                .map((f) => (
                  <button
                    key={f.id}
                    onClick={() => patchProject(p.id, { folderId: f.id })}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    📁 {f.name}
                  </button>
                ))}
              <div className="my-1 border-t border-neutral-100" />
              {p.archived ? (
                <button
                  onClick={() => patchProject(p.id, { archived: false })}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  アーカイブから戻す
                </button>
              ) : (
                <button
                  onClick={() =>
                    patchProject(p.id, { archived: true, folderId: null })
                  }
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  アーカイブへ移動
                </button>
              )}
              {folders.filter((f) => f.archived).length > 0 && (
                <>
                  <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                    アーカイブ内のフォルダへ
                  </p>
                  {folders
                    .filter((f) => f.archived && f.id !== p.folderId)
                    .map((f) => (
                      <button
                        key={f.id}
                        onClick={() =>
                          patchProject(p.id, {
                            archived: true,
                            folderId: f.id,
                          })
                        }
                        className="block w-full truncate px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        📦 📁 {f.name}
                      </button>
                    ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  function ArchFolderTile({ f }: { f: FolderLite }) {
    const count =
      archivedProjectsIn(f.id).length + archivedChildrenOf(f.id).length;
    return (
      <div
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.setData(DT_FOLDER, f.id);
          e.dataTransfer.effectAllowed = "move";
          e.stopPropagation();
        }}
        onDragOver={(e) => dragOver(e, `folder:${f.id}`)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, { folderId: f.id, toArchived: true })}
        onClick={() => setArchiveCurrentId(f.id)}
        className={`group flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border border-transparent p-3 text-center transition hover:bg-neutral-50 ${dropHighlight(
          `folder:${f.id}`
        )}`}
        title={f.name}
      >
        <span className="text-4xl leading-none">📁</span>
        <span className="w-full truncate text-sm text-neutral-700">
          {f.name}
        </span>
        <span className="text-[11px] text-neutral-400">{count}件</span>
        {canEdit && (
          <span className="invisible flex items-center gap-2 group-hover:visible">
            <button
              onClick={(e) => {
                e.stopPropagation();
                restoreFolder(f);
              }}
              className="text-[11px] text-neutral-400 hover:text-neutral-700"
            >
              復元
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                renameFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-neutral-600"
              title="名前を変更"
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-red-500"
              title="フォルダを削除"
            >
              ✕
            </button>
          </span>
        )}
      </div>
    );
  }

  function ArchFolderRow({ f }: { f: FolderLite }) {
    const count =
      archivedProjectsIn(f.id).length + archivedChildrenOf(f.id).length;
    return (
      <div
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.setData(DT_FOLDER, f.id);
          e.dataTransfer.effectAllowed = "move";
          e.stopPropagation();
        }}
        onDragOver={(e) => dragOver(e, `folder:${f.id}`)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => drop(e, { folderId: f.id, toArchived: true })}
        onClick={() => setArchiveCurrentId(f.id)}
        className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-neutral-50 ${dropHighlight(
          `folder:${f.id}`
        )}`}
      >
        <span className="text-lg leading-none">📁</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
          {f.name}
        </span>
        <span className="shrink-0 text-xs text-neutral-400">{count}件</span>
        {canEdit && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                restoreFolder(f);
              }}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              復元
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                renameFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-neutral-600"
              title="名前を変更"
            >
              ✎
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(f);
              }}
              className="text-xs text-neutral-300 hover:text-red-500"
              title="フォルダを削除"
            >
              ✕
            </button>
          </>
        )}
        <span className="text-neutral-300">›</span>
      </div>
    );
  }

  const rootFolders = childrenOf(null);
  const unfiled = projectsIn(null);

  // アーカイブ内の現在フォルダ（アイコン/リスト表示用）
  const effArchId = folders.some(
    (f) => f.id === archiveCurrentId && f.archived
  )
    ? archiveCurrentId
    : null;
  const archCrumbs: FolderLite[] = [];
  {
    let c = effArchId;
    while (c) {
      const f = folders.find((x) => x.id === c);
      if (!f) break;
      archCrumbs.unshift(f);
      c = f.parentId;
    }
  }

  // アイコンビューの現在フォルダ（削除済みなら最上位へ）
  const effectiveId = folders.some((f) => f.id === currentId)
    ? currentId
    : null;
  const crumbs: FolderLite[] = [];
  {
    let c = effectiveId;
    while (c) {
      const f = folders.find((x) => x.id === c);
      if (!f) break;
      crumbs.unshift(f);
      c = f.parentId;
    }
  }

  const showLoading = busy > 0 || isPending || navigating;

  // 名前検索（フォルダ横断）
  const q = query.trim().toLowerCase();
  const searchActive = active.filter((p) => p.name.toLowerCase().includes(q));
  const searchArchived = archived.filter((p) =>
    p.name.toLowerCase().includes(q)
  );

  return (
    <div className="space-y-8">
      {/* ローディング表示（変更の反映中／ページ遷移中） */}
      {showLoading && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600 shadow-lg">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-900" />
            {navigating ? "開いています…" : "反映中…"}
          </div>
        </div>
      )}

      {/* toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="プロジェクトを検索"
            className="w-48 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
          <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
            <button
              onClick={() => setView("tree")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                view === "tree"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              ツリー
            </button>
            <button
              onClick={() => setView("icons")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                view === "icons"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              アイコン
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                view === "list"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              リスト
            </button>
          </div>
          {canEdit && (
            <p className="hidden text-xs text-neutral-400 md:block">
              カードやフォルダをドラッグして、フォルダ
              {view === "tree" ? "見出し／未分類" : "・パンくず"}
              ／アーカイブへドロップで移動できます。
            </p>
          )}
        </div>
        {canEdit &&
          (addingFolder ? (
            <div className="flex shrink-0 gap-2">
              <input
                autoFocus
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing)
                    createFolder();
                  if (e.key === "Escape") setAddingFolder(false);
                }}
                placeholder="フォルダ名"
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
              />
              <button
                onClick={createFolder}
                disabled={!folderName.trim()}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                作成
              </button>
              <button
                onClick={() => setAddingFolder(false)}
                className="rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingFolder(true)}
              className="shrink-0 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-neutral-400"
            >
              + フォルダ
            </button>
          ))}
      </div>

      {q ? (
        /* 検索結果（フォルダ横断） */
        <section>
          <p className="mb-3 text-sm text-neutral-500">
            「{query.trim()}」の検索結果 {searchActive.length}
            {searchArchived.length > 0 && `＋アーカイブ ${searchArchived.length}`}
            件
          </p>
          <Grid list={searchActive} />
          {searchArchived.length > 0 && (
            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold tracking-wide text-neutral-400">
                アーカイブ
              </p>
              <div className="opacity-70">
                <Grid list={searchArchived} />
              </div>
            </div>
          )}
        </section>
      ) : view === "tree" ? (
        <>
          {/* folders (tree) */}
          {rootFolders.map((f) => (
            <FolderSection key={f.id} f={f} depth={0} />
          ))}

          {/* 未分類 */}
          <section>
            {activeFolders.length > 0 && (
              <div
                onDragOver={(e) => dragOver(e, "root")}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => drop(e, { folderId: null })}
                className={`mb-3 flex items-center gap-2 rounded-md px-1.5 py-1 transition ${dropHighlight("root")}`}
              >
                <h2 className="text-sm font-semibold tracking-wide text-neutral-700">
                  未分類
                </h2>
                <span className="text-xs text-neutral-400">
                  {unfiled.length}
                </span>
              </div>
            )}
            <Grid list={unfiled} />
          </section>
        </>
      ) : (
        /* icons view */
        <section>
          {/* パンくず（ドロップで階層移動） */}
          <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <button
              onClick={() => setCurrentId(null)}
              onDragOver={(e) => dragOver(e, "root")}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => drop(e, { folderId: null })}
              className={`rounded-md px-1.5 py-0.5 transition ${
                effectiveId === null
                  ? "font-semibold text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900"
              } ${dropHighlight("root")}`}
            >
              すべて
            </button>
            {crumbs.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <span className="text-neutral-300">/</span>
                <button
                  onClick={() => setCurrentId(f.id)}
                  onDragOver={(e) => dragOver(e, `crumb:${f.id}`)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => drop(e, { folderId: f.id })}
                  className={`rounded-md px-1.5 py-0.5 transition ${
                    f.id === effectiveId
                      ? "font-semibold text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900"
                  } ${dropHighlight(`crumb:${f.id}`)}`}
                >
                  📁 {f.name}
                </button>
              </span>
            ))}
          </div>

          {view === "icons" ? (
            <>
              {/* フォルダタイル */}
              {childrenOf(effectiveId).length > 0 && (
                <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {childrenOf(effectiveId).map((f) => (
                    <FolderTile key={f.id} f={f} />
                  ))}
                </div>
              )}

              {/* プロジェクトカード */}
              <Grid list={projectsIn(effectiveId)} />
            </>
          ) : (
            /* リスト表示 */
            <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
              {childrenOf(effectiveId).length === 0 &&
                projectsIn(effectiveId).length === 0 && (
                  <p className="p-4 text-sm text-neutral-400">
                    プロジェクトがありません
                  </p>
                )}
              {childrenOf(effectiveId).map((f) => (
                <FolderRow key={f.id} f={f} />
              ))}
              {projectsIn(effectiveId).map((p) => (
                <ProjectRow key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* アーカイブ */}
      {!q &&
        (archived.length > 0 ||
          archivedFolderRoots.length > 0 ||
          dropTarget === "archive") && (
        <details className="group">
          <summary
            onDragOver={(e) => dragOver(e, "archive")}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => drop(e, { archive: true })}
            className={`mb-3 cursor-pointer list-none rounded-md px-1.5 py-1 transition ${dropHighlight("archive")}`}
          >
            <span className="text-sm font-semibold tracking-wide text-neutral-400">
              <span className="inline-block transition group-open:rotate-90">
                ▸
              </span>{" "}
              アーカイブ（
              {archivedFolderRoots.length > 0 &&
                `フォルダ ${archivedFolderRoots.length}・`}
              {archived.length}件）
            </span>
            <span className="ml-2 text-xs text-neutral-400">
              スケジュール系ビューには表示されません
            </span>
          </summary>
          <div className="space-y-6 opacity-80">
            {view === "tree" ? (
              <>
                {canEdit && (
                  <button
                    onClick={() => createArchivedFolder(null)}
                    className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-500 transition hover:border-neutral-400"
                  >
                    + アーカイブ内にフォルダ
                  </button>
                )}
                {archivedFolderRoots.map((f) => (
                  <ArchivedFolderSection key={f.id} f={f} depth={0} />
                ))}
                {looseArchived.length > 0 && <Grid list={looseArchived} />}
              </>
            ) : (
              <>
                {/* アーカイブ内パンくず */}
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  <button
                    onClick={() => setArchiveCurrentId(null)}
                    onDragOver={(e) => dragOver(e, "arch-root")}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) =>
                      drop(e, { folderId: null, toArchived: true })
                    }
                    className={`rounded-md px-1.5 py-0.5 transition ${
                      effArchId === null
                        ? "font-semibold text-neutral-700"
                        : "text-neutral-500 hover:text-neutral-900"
                    } ${dropHighlight("arch-root")}`}
                  >
                    アーカイブ
                  </button>
                  {archCrumbs.map((f) => (
                    <span key={f.id} className="flex items-center gap-1">
                      <span className="text-neutral-300">/</span>
                      <button
                        onClick={() => setArchiveCurrentId(f.id)}
                        onDragOver={(e) => dragOver(e, `crumb:${f.id}`)}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) =>
                          drop(e, { folderId: f.id, toArchived: true })
                        }
                        className={`rounded-md px-1.5 py-0.5 transition ${
                          f.id === effArchId
                            ? "font-semibold text-neutral-700"
                            : "text-neutral-500 hover:text-neutral-900"
                        } ${dropHighlight(`crumb:${f.id}`)}`}
                      >
                        📁 {f.name}
                      </button>
                    </span>
                  ))}
                  {canEdit && (
                    <button
                      onClick={() => createArchivedFolder(effArchId)}
                      className="ml-auto rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 transition hover:border-neutral-400"
                    >
                      + フォルダ
                    </button>
                  )}
                </div>

                {view === "icons" ? (
                  <>
                    {archivedKidsOf(effArchId).length > 0 && (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {archivedKidsOf(effArchId).map((f) => (
                          <ArchFolderTile key={f.id} f={f} />
                        ))}
                      </div>
                    )}
                    <Grid list={archivedProjectsIn(effArchId)} />
                  </>
                ) : (
                  <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
                    {archivedKidsOf(effArchId).length === 0 &&
                      archivedProjectsIn(effArchId).length === 0 && (
                        <p className="p-4 text-sm text-neutral-400">
                          プロジェクトがありません
                        </p>
                      )}
                    {archivedKidsOf(effArchId).map((f) => (
                      <ArchFolderRow key={f.id} f={f} />
                    ))}
                    {archivedProjectsIn(effArchId).map((p) => (
                      <ProjectRow key={p.id} p={p} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
