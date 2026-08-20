"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Layout, Menu, Spin, Typography, Button, Alert, Badge } from "antd";
import {
  ShoppingOutlined,
  DatabaseOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api";

const { Header, Sider, Content } = Layout;

const DASHBOARD_ROLES = ["OWNER", "STAFF"];
const PENDING_POLL_MS = 20000;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading, error } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

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

    // Settings and Analytics are business-sensitive / configuration —
    // Owner only, Staff gets bounced to the product catalog.
    if (
      (pathname.startsWith("/settings") || pathname.startsWith("/analytics")) &&
      profile?.role !== "OWNER"
    ) {
      router.replace("/products");
    }
  }, [loading, firebaseUser, profile, pathname, router]);

  // Polling, not push — fine for a 30-40 customer single-shop MVP (see
  // PROJECT_PROMPT.md). Badge shows PENDING orders regardless of which page
  // is open, so it's driven from the layout, not the Orders page itself.
  useEffect(() => {
    if (!profile || !DASHBOARD_ROLES.includes(profile.role)) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const orders = await authFetch("/orders?status=PENDING");
        if (!cancelled) setPendingCount(Array.isArray(orders) ? orders.length : 0);
      } catch {
        // Transient network errors shouldn't spam the UI — just skip this tick.
      }
    };

    poll();
    const interval = setInterval(poll, PENDING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [profile]);

  if (loading || !firebaseUser || !profile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <Spin size="large" />
        {error && <Alert type="error" message={error} />}
      </div>
    );
  }

  const items = [
    { key: "/products", icon: <ShoppingOutlined />, label: "Products" },
    { key: "/inventory", icon: <DatabaseOutlined />, label: "Inventory" },
    {
      key: "/orders",
      icon: <UnorderedListOutlined />,
      label: (
        <span>
          Orders{" "}
          {pendingCount > 0 && (
            <Badge count={pendingCount} size="small" style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
    },
    ...(profile.role === "OWNER"
      ? [
          { key: "/analytics", icon: <BarChartOutlined />, label: "Analytics" },
          { key: "/settings", icon: <SettingOutlined />, label: "Shop Settings" },
        ]
      : []),
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="dark" width={220}>
        <Typography.Title level={4} style={{ color: "#fff", margin: 16, whiteSpace: "nowrap" }}>
          Kirana Store
        </Typography.Title>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={items}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16 }}>
          <span style={{ color: "#fff", whiteSpace: "nowrap" }}>
            {profile.name} ({profile.role})
          </span>
          <Button onClick={() => signOut(auth)}>Log out</Button>
        </Header>
        <Content style={{ padding: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
