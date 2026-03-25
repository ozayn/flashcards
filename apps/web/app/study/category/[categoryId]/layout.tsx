export default function CategoryStudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-study className="h-full min-h-0 overflow-hidden flex flex-col w-full">
      {children}
    </div>
  );
}
