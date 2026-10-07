// Real font family names for canvas drawing (next/font renames families).
export function ToolFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- only the tools need these, for canvas text */}
      <link rel="stylesheet" precedence="default"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&display=swap" />
    </>
  );
}
