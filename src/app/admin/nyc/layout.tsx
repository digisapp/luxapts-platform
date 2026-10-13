import { NycTabs } from "@/components/admin/nyc/NycTabs";

export default function NycLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <NycTabs />
      {children}
    </div>
  );
}
