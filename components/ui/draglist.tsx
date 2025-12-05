"use client";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Item = { id: string; label: string; percentage?: number; value?: number; color?: string };
export function DragList({
  items,
  onReorder,
}: {
  items: Item[];
  onReorder: (next: Item[]) => void;
}) {
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {items.map(i => <Row key={i.id} item={i} />)}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Row({ item }: { item: Item }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style}
        className={"flex items-center justify-between rounded-md border px-3 py-2 bg-black/20 text-white" + (isDragging ? " opacity-70" : "")}>
      <div className="flex items-center gap-3">
        <span className="cursor-grab select-none" {...attributes} {...listeners}>⋮⋮</span>
        <span className="inline-block h-3 w-3 rounded" style={{ background: item.color ?? "#9d9d9c" }} />
        <span className="text-sm">{item.label}</span>
      </div>
      {typeof item.percentage === "number" && <span className="text-sm">{item.percentage}%</span>}
    </li>
  );
} 
