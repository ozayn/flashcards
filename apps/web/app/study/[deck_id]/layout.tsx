export default function DeckStudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-study
      className="h-full min-h-0 overflow-hidden flex flex-col w-full landscape-mobile:h-[100dvh] landscape-mobile:max-h-[100dvh]"
    >
      {children}
    </div>
  );
}
