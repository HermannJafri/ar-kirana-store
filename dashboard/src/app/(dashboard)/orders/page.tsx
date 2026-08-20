"use client";

import { useEffect, useRef, useState } from "react";
import { Table, Tag, Button, Modal, Select, Space, Typography, message, Descriptions } from "antd";
import { authFetch } from "@/lib/api";

const POLL_MS = 20000;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "gold",
  CONFIRMED: "blue",
  PICKING: "geekblue",
  PACKED: "purple",
  OUT_FOR_DELIVERY: "cyan",
  DELIVERED: "green",
  CANCELLED: "red",
};

// Mirrors backend/src/routes/orders.ts's NEXT_STATUS map — what the dashboard
// is allowed to move an order to next. DELIVERED isn't here: that's the
// Delivery role's "payment collected" action (Phase 5), not a plain status
// button.
const NEXT_STATUS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PICKING", "CANCELLED"],
  PICKING: ["PACKED", "CANCELLED"],
  PACKED: ["OUT_FOR_DELIVERY", "CANCELLED"],
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirm",
  PICKING: "Start picking",
  PACKED: "Mark packed",
  OUT_FOR_DELIVERY: "Out for delivery",
  CANCELLED: "Cancel order",
};

interface OrderItem {
  id: string;
  quantity: number;
  priceAtOrder: string;
  product: { id: string; name: string };
}

interface Customer {
  id: string;
  name: string;
  mobile: string | null;
  houseNo: string | null;
  floorNo: string | null;
  area: string | null;
}

interface Order {
  id: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  customer: Customer;
  items: OrderItem[];
}

function formatAddress(c: Customer): string {
  const parts = [c.houseNo, c.floorNo && `Floor ${c.floorNo}`, c.area].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const requestIdRef = useRef(0);

  const load = async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    try {
      const path = statusFilter ? `/orders?status=${statusFilter}` : "/orders";
      const data = await authFetch(path);
      if (requestId !== requestIdRef.current) return;
      setOrders(data);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      if (!silent) message.error((e as Error).message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const updateStatus = async (orderId: string, status: string) => {
    setUpdating(true);
    try {
      const updated = await authFetch(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      message.success(`Order moved to ${status}`);
      setDetail(updated);
      load(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const columns = [
    {
      title: "Status",
      dataIndex: "status",
      render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s.replace(/_/g, " ")}</Tag>,
    },
    { title: "Customer", dataIndex: ["customer", "name"] },
    { title: "Address", render: (_: unknown, o: Order) => formatAddress(o.customer) },
    { title: "Items", render: (_: unknown, o: Order) => o.items.length },
    {
      title: "Total",
      dataIndex: "totalAmount",
      render: (t: string) => `₹${Number(t).toFixed(2)}`,
    },
    {
      title: "Placed at",
      dataIndex: "createdAt",
      render: (d: string) => new Date(d).toLocaleString(),
    },
    {
      title: "Actions",
      render: (_: unknown, o: Order) => (
        <Button size="small" onClick={() => setDetail(o)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Orders
        </Typography.Title>
        <Select
          allowClear
          placeholder="Filter by status"
          style={{ width: 200 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={Object.keys(STATUS_COLORS).map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={orders}
        locale={{ emptyText: "No orders yet." }}
      />

      <Modal
        title={detail ? `Order #${detail.id.slice(0, 8)}` : ""}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={
          detail && (
            <Space>
              {(NEXT_STATUS[detail.status] ?? []).map((next) => (
                <Button
                  key={next}
                  danger={next === "CANCELLED"}
                  type={next === "CANCELLED" ? "default" : "primary"}
                  loading={updating}
                  onClick={() => updateStatus(detail.id, next)}
                >
                  {STATUS_LABELS[next] ?? next}
                </Button>
              ))}
              <Button onClick={() => setDetail(null)}>Close</Button>
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[detail.status]}>{detail.status.replace(/_/g, " ")}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">{detail.customer.name}</Descriptions.Item>
              <Descriptions.Item label="Mobile">{detail.customer.mobile ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Address">{formatAddress(detail.customer)}</Descriptions.Item>
              <Descriptions.Item label="Placed at">
                {new Date(detail.createdAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Text strong>Items</Typography.Text>
            <ul style={{ marginTop: 8 }}>
              {detail.items.map((item) => (
                <li key={item.id}>
                  {item.product.name} — {item.quantity} × ₹{Number(item.priceAtOrder).toFixed(2)}
                </li>
              ))}
            </ul>
            <Typography.Text strong>Total: ₹{Number(detail.totalAmount).toFixed(2)}</Typography.Text>
          </>
        )}
      </Modal>
    </div>
  );
}
