export default function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
