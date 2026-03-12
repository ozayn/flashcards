export default function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={`pt-6 pb-8 ${className ?? ""}`.trim()}>
      <div className="max-w-2xl mx-auto w-full px-10 md:px-12 space-y-6">
        {children}
      </div>
    </main>
  );
}
