"use client";

import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Item = {
  id: string;
  label: string;
  percentage?: number;
  value?: number;
  color?: string;
};

export function DragList({
  items,
  onReorder,
  showPercentage = true,
}: {
  items: Item[];
  onReorder: (next: Item[]) => void;
  showPercentage?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, 
      },
    })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-2">
          {items.map((i) => (
          <Row key={i.id} item={i} showPercentage={showPercentage} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Row({ item, showPercentage }: { item: Item; showPercentage: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        "flex items-center justify-between rounded-md border px-3 py-2 bg-black/20 text-white select-none " +
        (isDragging ? " opacity-70" : "")
      }
    >
      <div className="flex items-center gap-3">
        {/* ✅ El drag SOLO se activa desde el handle */}
        <span
          className="cursor-grab select-none"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </span>

        <span
          className="inline-block h-3 w-3 rounded"
          style={{ background: item.color ?? "#9d9d9c" }}
        />

        <span className="text-sm">{item.label}</span>
      </div>

      {showPercentage && typeof item.percentage === "number" && (
        <span className="text-sm">{item.percentage}%</span>
      )}
    </li>
  );
}
