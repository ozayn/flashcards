export default function PageContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="py-8">
      <div className="max-w-2xl mx-auto w-full px-10 md:px-12 space-y-6">
        {children}
      </div>
    </main>
  );
}
