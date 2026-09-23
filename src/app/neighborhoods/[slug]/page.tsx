import type { Metadata } from "next";
import { NeighborhoodView, neighborhoodMetadata } from "./neighborhood-view";

export const revalidate = 3600;

// Rendered on first request, then cached (ISR) like the building pages
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return neighborhoodMetadata(slug);
}

export default async function NeighborhoodPage({ params }: Props) {
  const { slug } = await params;
  return <NeighborhoodView slug={slug} />;
}
