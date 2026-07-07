import { notFound, redirect } from 'next/navigation';

const PLACE_ID = /^stm-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fragmentFor(parts: string[]): string {
  const [first, second] = parts;
  if (first === 'feature') return 'feature';
  if (first === 'location' && second === 'geometry') return 'geometry-centroid';
  if (first === 'location') return 'location';
  if (first === 'name' && second) return `name-${second}`;
  if (first === 'assertion' && second) {
    return parts.includes('time-span')
      ? `assertion-${second}-time-span`
      : `assertion-${second}`;
  }
  if (first === 'source' && second === 'dikland' && parts[2]) {
    return `source-dikland-${parts[2]}`;
  }
  return parts.join('-');
}

export default async function PlaceEntityRedirect({
  params,
}: {
  params: Promise<{ id: string; entity: string[] }>;
}) {
  const { id, entity } = await params;
  if (!PLACE_ID.test(id) || entity.length === 0) notFound();
  redirect(`/place/${id}#${fragmentFor(entity)}`);
}
