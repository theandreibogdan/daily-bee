import { ProjectTag } from '@dailybee/ui';
import { useStore } from '../store';

/** ProjectTag resolved from the project id (kit: ProjectTag({ id })). */
export function ProjectRef({ id }: { id: string }) {
  const p = useStore((s) => s.projects.find((x) => x.id === id));
  return <ProjectTag name={p?.name ?? id} color={p?.color ?? 'var(--hive-400)'} />;
}
