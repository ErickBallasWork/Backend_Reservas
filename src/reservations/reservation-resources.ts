import type { CatalogLookupService } from '../catalog/catalog-lookup.service';
import type { Db } from '../common/db.types';

interface DescribableResource {
  type: string;
  name: string;
  parent: { name: string } | null;
}

export function describeResource(resource: DescribableResource): string {
  if (resource.type === 'LAPTOP') {
    return `la laptop ${resource.name} (${resource.parent?.name ?? 'laboratorio'})`;
  }
  if (resource.type === 'AI_LAB') return `${resource.name} (completo)`;
  return resource.name;
}

export async function blockedResourceIds(
  lookup: CatalogLookupService,
  resource: { id: string; type: string },
  db?: Db,
): Promise<string[]> {
  if (resource.type !== 'AI_LAB') return [resource.id];
  return [resource.id, ...(await lookup.activeLaptopIds(resource.id, db))];
}
