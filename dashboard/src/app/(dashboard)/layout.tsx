"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Menu, Spin, Typography, Button, Alert } from "antd";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const { Header, Content } = Layout;

const DASHBOARD_ROLES = ["OWNER", "STAFF"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading, error } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.replace("/login");
      return;
    }

    // Dashboard is Owner/Staff only — Customer/Delivery accounts use the mobile app.
    if (profile && !DASHBOARD_ROLES.includes(profile.role)) {
      signOut(auth);
      router.replace("/login");
      return;
    }

    if (pathname.startsWith("/settings") && profile?.role !== "OWNER") {
      router.replace("/products");
    }
  }, [loading, firebaseUser, profile, pathname, router]);

  if (loading || !firebaseUser || !profile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <Spin size="large" />
        {error && <Alert type="error" message={error} />}
      </div>
    );
  }

  const items = [
    { key: "/products", label: "Products" },
    ...(profile.role === "OWNER" ? [{ key: "/settings", label: "Shop Settings" }] : []),
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Typography.Title level={4} style={{ color: "#fff", margin: 0, whiteSpace: "nowrap" }}>
          Kirana Store
        </Typography.Title>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[pathname]}
          items={items}
          onClick={({ key }) => router.push(key)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <span style={{ color: "#fff", whiteSpace: "nowrap" }}>
          {profile.name} ({profile.role})
        </span>
        <Button onClick={() => signOut(auth)}>Log out</Button>
      </Header>
      <Content style={{ padding: 24 }}>{children}</Content>
    </Layout>
  );
}
