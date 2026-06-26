import { Skeleton } from "../ui/Skeleton";

export default function PageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton.Title className="w-48" />
      <Skeleton.Text className="w-72" />
      <Skeleton.Card />
      <Skeleton.Card />
    </div>
  );
}
