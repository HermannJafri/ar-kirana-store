import type { Metadata } from "next";
import "antd/dist/reset.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "Kirana Store Dashboard",
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
