"use client";

import { useEffect, useState } from "react";
import { Table, Button, Modal, Input, Space, Typography, message, Popconfirm } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Customer {
  id: string;
  name: string;
  username: string | null;
  mobile: string | null;
  houseNo: string | null;
  floorNo: string | null;
  area: string | null;
  isActive: boolean;
  createdAt: string;
}

function formatAddress(c: Customer): string {
  const parts = [c.houseNo, c.floorNo && `Floor ${c.floorNo}`, c.area].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export default function CustomersPage() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState<Customer | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await authFetch("/customers");
      setCustomers(data);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.mobile ?? "").toLowerCase().includes(q) ||
      (c.username ?? "").toLowerCase().includes(q)
    );
  });

  const resetValid = newPassword.length >= 6 && newPassword === confirmPassword;

  const submitReset = async () => {
    if (!resetTarget || !resetValid) return;
    setResetting(true);
    try {
      await authFetch(`/customers/${resetTarget.id}/reset-password`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      });
      message.success(`Password reset for ${resetTarget.name}`);
      setResetTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setResetting(false);
    }
  };

  const deleteCustomer = async (c: Customer) => {
    setDeletingId(c.id);
    try {
      await authFetch(`/customers/${c.id}`, { method: "DELETE" });
      message.success(`${c.name} deleted permanently`);
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const columns = [
    { title: "Name", dataIndex: "name" },
    { title: "Mobile", render: (_: unknown, c: Customer) => c.mobile ?? "—" },
    { title: "Username", render: (_: unknown, c: Customer) => c.username ?? "—" },
    { title: "Address", render: (_: unknown, c: Customer) => formatAddress(c) },
    {
      title: "Joined",
      dataIndex: "createdAt",
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: "Actions",
      render: (_: unknown, c: Customer) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setResetTarget(c);
              setNewPassword("");
              setConfirmPassword("");
            }}
          >
            Reset password
          </Button>
          {profile?.role === "OWNER" && (
            <Popconfirm
              title="Delete this customer permanently?"
              description={
                <span>
                  This cannot be undone. {c.name}&apos;s account and profile will be
                  permanently deleted.
                  <br />
                  (Blocked if they have any past orders, to protect order history.)
                </span>
              }
              okText="Delete permanently"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteCustomer(c)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={deletingId === c.id} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Customers
        </Typography.Title>
        <Input.Search
          allowClear
          placeholder="Search by name, mobile, or username"
          style={{ width: 280 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={filtered}
        locale={{ emptyText: "No customers yet." }}
      />

      <Modal
        title={resetTarget ? `Reset password — ${resetTarget.name}` : ""}
        open={!!resetTarget}
        onCancel={() => {
          setResetTarget(null);
          setNewPassword("");
          setConfirmPassword("");
        }}
        onOk={submitReset}
        okButtonProps={{ disabled: !resetValid, loading: resetting }}
        okText="Set new password"
      >
        <Typography.Paragraph type="secondary">
          There&apos;s no self-service &quot;forgot password&quot; for customers — this is the
          recovery path. The customer&apos;s <em>existing</em> password can never be viewed by
          anyone (it&apos;s never stored anywhere in readable form, by design). Set a new one
          here and let them know it in person or over a call.
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.Password
            placeholder="New password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            visibilityToggle
            autoComplete="new-password"
            name="reset-customer-password"
            data-lpignore="true"
            data-1p-ignore
          />
          <Input.Password
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            visibilityToggle
            autoComplete="new-password"
            name="reset-customer-password-confirm"
            data-lpignore="true"
            data-1p-ignore
            status={confirmPassword && newPassword !== confirmPassword ? "error" : undefined}
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <Typography.Text type="danger">Passwords don&apos;t match.</Typography.Text>
          )}
        </Space>
      </Modal>
    </div>
  );
}
