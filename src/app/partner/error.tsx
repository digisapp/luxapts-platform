"use client";

import { PortalError } from "@/components/admin/layout/PortalError";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <PortalError error={error} retry={retry} homeHref="/partner" />;
}
