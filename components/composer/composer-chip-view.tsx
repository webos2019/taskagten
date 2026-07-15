import { NodeViewProps } from '@tiptap/react';

export default function InlineComposerChipNodeView({ node }: NodeViewProps) {
  const isCommandChip = node.type.name === 'commandChip';
  const label = (node.attrs as Record<string, string>).label || '';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        isCommandChip
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
          : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
      }`}
      contentEditable={false}
    >
      <span className="font-semibold">{isCommandChip ? '⚡' : '📎'}</span>
      <span>{label}</span>
    </span>
  );
}
