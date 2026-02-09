import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white m-0 p-0">
        {children}
      </body>
    </html>
  );
}