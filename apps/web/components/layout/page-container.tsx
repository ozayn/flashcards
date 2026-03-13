export default function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={`space-y-6 ${className ?? ""}`.trim()}>
      {children}
    </main>
  );
}
