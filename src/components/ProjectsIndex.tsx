"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FolderLite, ProjectCardData } from "@/lib/types";

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

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const unfiled = active.filter((p) => !p.folderId);

  async function patchProject(
    id: string,
    data: { folderId?: string | null; archived?: boolean }
  ) {
    setMenuId(null);
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.refresh();
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setFolderName("");
      setAddingFolder(false);
      router.refresh();
    }
  }

  async function renameFolder(f: FolderLite) {
    const name = prompt("フォルダ名", f.name);
    if (!name?.trim() || name === f.name) return;
    await fetch(`/api/folders/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    router.refresh();
  }

  async function deleteFolder(f: FolderLite) {
    if (
      !confirm(
        `フォルダ「${f.name}」を削除しますか？（中のプロジェクトは未分類に戻ります）`
      )
    )
      return;
    await fetch(`/api/folders/${f.id}`, { method: "DELETE" });
    router.refresh();
  }

  function Card({ p }: { p: ProjectCardData }) {
    return (
      <div className="group relative">
        <Link
          href={`/projects/${p.id}`}
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
            <h2 className="truncate font-medium text-neutral-900">{p.name}</h2>
          </div>
          {p.description && (
            <p className="mb-3 line-clamp-2 text-sm text-neutral-500">
              {p.description}
            </p>
          )}
          <div className="flex gap-4 text-xs text-neutral-400">
            <span>タスク {p._count.tasks}</span>
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
              {folders
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
                  onClick={() => patchProject(p.id, { archived: true })}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  アーカイブへ移動
                </button>
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

  return (
    <div className="space-y-8">
      {/* folder toolbar */}
      {canEdit && (
      <div className="flex justify-end">
        {addingFolder ? (
          <div className="flex gap-2">
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
            className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-neutral-400"
          >
            + フォルダ
          </button>
        )}
      </div>
      )}

      {/* folders */}
      {folders.map((f) => {
        const list = active.filter((p) => p.folderId === f.id);
        return (
          <section key={f.id}>
            <div className="mb-3 flex items-center gap-2">
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
          </section>
        );
      })}

      {/* 未分類 */}
      <section>
        {folders.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-700">
              未分類
            </h2>
            <span className="text-xs text-neutral-400">{unfiled.length}</span>
          </div>
        )}
        <Grid list={unfiled} />
      </section>

      {/* アーカイブ */}
      {archived.length > 0 && (
        <details className="group">
          <summary className="mb-3 cursor-pointer list-none">
            <span className="text-sm font-semibold tracking-wide text-neutral-400">
              <span className="inline-block transition group-open:rotate-90">
                ▸
              </span>{" "}
              アーカイブ（{archived.length}）
            </span>
            <span className="ml-2 text-xs text-neutral-400">
              スケジュール系ビューには表示されません
            </span>
          </summary>
          <div className="opacity-70">
            <Grid list={archived} />
          </div>
        </details>
      )}
    </div>
  );
}
