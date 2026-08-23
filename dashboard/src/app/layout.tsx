import type { Metadata, Viewport } from "next";
import "antd/dist/reset.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "Kirana Store Dashboard",
};

// Without this, mobile browsers render the page at a fake ~980px desktop
// canvas and zoom it out to fit the screen, so JS breakpoint checks
// (antd's Grid.useBreakpoint, used for the mobile sidebar/table switch)
// never see a "mobile" width at all.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
