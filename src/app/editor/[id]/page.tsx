import { NovelEditorWorkspace } from "@/components/novel-editor";

export default async function EditorByNovelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <NovelEditorWorkspace key={id} novelId={id} />
    </div>
  );
}
