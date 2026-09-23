import type { Metadata } from "next";
import { NeighborhoodView, neighborhoodMetadata } from "../../neighborhood-view";

// Internal target of the `/neighborhoods/:slug?city=:city` rewrite in
// next.config.ts. Public URLs keep the query form (and so do canonicals).
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, city } = await params;
  return neighborhoodMetadata(slug, city);
}

export default async function NeighborhoodInCityPage({ params }: Props) {
  const { slug, city } = await params;
  return <NeighborhoodView slug={slug} citySlugParam={city} />;
}
