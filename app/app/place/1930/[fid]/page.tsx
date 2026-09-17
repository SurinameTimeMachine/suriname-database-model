import LinkedDataResourcePage, {
  generateMetadata as generateResourceMetadata,
} from '@/app/[...resource]/page';
import type { Metadata } from 'next';

type RouteParameters = { params: Promise<{ fid: string }> };

export async function generateMetadata({
  params,
}: RouteParameters): Promise<Metadata> {
  const { fid } = await params;
  return generateResourceMetadata({
    params: Promise.resolve({ resource: ['place', '1930', fid] }),
  });
}

export default async function MappedPlacePage({ params }: RouteParameters) {
  const { fid } = await params;
  return LinkedDataResourcePage({
    params: Promise.resolve({ resource: ['place', '1930', fid] }),
  });
}
