"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Modal,
  Select,
  Space,
  Typography,
  message,
  Descriptions,
  Input,
  InputNumber,
  Popconfirm,
  List,
  Card,
} from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useIsMobile } from "@/lib/responsive";

const POLL_MS = 20000;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "gold",
  CONFIRMED: "blue",
  OUT_FOR_DELIVERY: "cyan",
  DELIVERED: "green",
  CANCELLED: "red",
};

const PAYMENT_COLORS: Record<string, string> = {
  PENDING: "default",
  PARTIAL: "orange",
  COLLECTED: "green",
};

// Mirrors backend/src/routes/orders.ts's NEXT_STATUS map — what the
// dashboard is allowed to move an order to next. There's no separate
// delivery role/login in this app, so DELIVERED is a plain Staff/Owner
// action here too, same as every other status.
const NEXT_STATUS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirm",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Mark delivered",
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
  amountPaid: string;
  paymentStatus: string;
  createdAt: string;
  customer: Customer;
  items: OrderItem[];
}

function formatAddress(c: Customer): string {
  const parts = [c.houseNo, c.floorNo && `Floor ${c.floorNo}`, c.area].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export default function OrdersPage() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (paymentStatusFilter) params.set("paymentStatus", paymentStatusFilter);
      const query = params.toString();
      const data = await authFetch(query ? `/orders?${query}` : "/orders");
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
  }, [statusFilter, paymentStatusFilter]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.customer.name.toLowerCase().includes(q) ||
        (o.customer.mobile ?? "").toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
    );
  }, [orders, search]);

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

  const recordPayment = async () => {
    if (!detail || !paymentAmount || paymentAmount <= 0) return;
    setUpdating(true);
    try {
      const updated = await authFetch(`/orders/${detail.id}/payment`, {
        method: "PATCH",
        body: JSON.stringify({ amount: paymentAmount }),
      });
      message.success(`Recorded ₹${paymentAmount.toFixed(2)} received`);
      setDetail(updated);
      setPaymentAmount(null);
      load(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  const deleteOrder = async (order: Order) => {
    setDeletingId(order.id);
    try {
      await authFetch(`/orders/${order.id}`, { method: "DELETE" });
      message.success(`Order #${order.id.slice(0, 8)} deleted permanently`);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      if (detail?.id === order.id) setDetail(null);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setDeletingId(null);
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
      title: "Payment",
      render: (_: unknown, o: Order) => (
        <Tag color={PAYMENT_COLORS[o.paymentStatus]}>{o.paymentStatus}</Tag>
      ),
    },
    {
      title: "Placed at",
      dataIndex: "createdAt",
      render: (d: string) => new Date(d).toLocaleString(),
    },
    {
      title: "Actions",
      render: (_: unknown, o: Order) => (
        <Space>
          <Button size="small" onClick={() => setDetail(o)}>
            View
          </Button>
          {profile?.role === "OWNER" && (
            <Popconfirm
              title="Delete this order permanently?"
              description={
                <span>
                  This cannot be undone. Order #{o.id.slice(0, 8)} and its items will
                  be permanently deleted.
                  <br />
                  This does not restore stock quantity.
                </span>
              }
              okText="Delete permanently"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteOrder(o)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={deletingId === o.id} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const remaining = detail ? Number(detail.totalAmount) - Number(detail.amountPaid) : 0;

  return (
    <div>
      <Space
        style={{ marginBottom: 16, justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          Orders
        </Typography.Title>
        <Space wrap style={{ width: isMobile ? "100%" : undefined }}>
          <Input.Search
            allowClear
            placeholder="Search by customer, phone, or order ID"
            style={{ width: isMobile ? "100%" : 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            allowClear
            placeholder="Filter by status"
            style={{ width: isMobile ? "100%" : 200 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={Object.keys(STATUS_COLORS).map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
          />
          <Select
            allowClear
            placeholder="Filter by payment"
            style={{ width: isMobile ? "100%" : 180 }}
            value={paymentStatusFilter}
            onChange={setPaymentStatusFilter}
            options={Object.keys(PAYMENT_COLORS).map((s) => ({ value: s, label: s }))}
          />
        </Space>
      </Space>

      {isMobile ? (
        <List
          loading={loading}
          dataSource={filteredOrders}
          locale={{ emptyText: "No orders yet." }}
          renderItem={(o) => (
            <Card size="small" style={{ marginBottom: 8 }} onClick={() => setDetail(o)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <Typography.Text strong>{o.customer.name}</Typography.Text>
                <Tag color={STATUS_COLORS[o.status]}>{o.status.replace(/_/g, " ")}</Tag>
              </div>
              <Typography.Text type="secondary" style={{ display: "block" }}>
                {o.items.length} item{o.items.length === 1 ? "" : "s"} · {new Date(o.createdAt).toLocaleString()}
              </Typography.Text>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <Typography.Text strong>₹{Number(o.totalAmount).toFixed(2)}</Typography.Text>
                <Tag color={PAYMENT_COLORS[o.paymentStatus]}>{o.paymentStatus}</Tag>
              </div>
              <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
                <Button
                  block
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetail(o);
                  }}
                >
                  View details
                </Button>
                {profile?.role === "OWNER" && (
                  <Popconfirm
                    title="Delete this order permanently?"
                    description={
                      <span>
                        This cannot be undone. Order #{o.id.slice(0, 8)} and its items will
                        be permanently deleted.
                        <br />
                        This does not restore stock quantity.
                      </span>
                    }
                    okText="Delete permanently"
                    okButtonProps={{ danger: true }}
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      deleteOrder(o);
                    }}
                  >
                    <Button
                      block
                      danger
                      icon={<DeleteOutlined />}
                      loading={deletingId === o.id}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Delete
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </Card>
          )}
        />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredOrders}
          locale={{ emptyText: "No orders yet." }}
        />
      )}

      <Modal
        title={detail ? `Order #${detail.id.slice(0, 8)}` : ""}
        open={!!detail}
        onCancel={() => {
          setDetail(null);
          setPaymentAmount(null);
        }}
        width={isMobile ? "92%" : 520}
        footer={
          detail && (
            <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }}>
              {(NEXT_STATUS[detail.status] ?? []).map((next) => (
                <Button
                  key={next}
                  danger={next === "CANCELLED"}
                  type={next === "CANCELLED" ? "default" : "primary"}
                  loading={updating}
                  block={isMobile}
                  onClick={() => updateStatus(detail.id, next)}
                >
                  {STATUS_LABELS[next] ?? next}
                </Button>
              ))}
              {profile?.role === "OWNER" && (
                <Popconfirm
                  title="Delete this order permanently?"
                  description="This cannot be undone. It does not restore stock quantity."
                  okText="Delete permanently"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => deleteOrder(detail)}
                >
                  <Button danger icon={<DeleteOutlined />} loading={deletingId === detail.id} block={isMobile}>
                    Delete
                  </Button>
                </Popconfirm>
              )}
              <Button onClick={() => setDetail(null)} block={isMobile}>
                Close
              </Button>
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

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0f0f0" }}>
              <Typography.Text strong>Payment</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Tag color={PAYMENT_COLORS[detail.paymentStatus]}>{detail.paymentStatus}</Tag>
                <Typography.Text style={{ marginLeft: 8 }}>
                  Received: ₹{Number(detail.amountPaid).toFixed(2)} &nbsp;·&nbsp; Remaining: ₹
                  {remaining.toFixed(2)}
                </Typography.Text>
              </div>
              {remaining > 0 && (
                <Space
                  direction={isMobile ? "vertical" : "horizontal"}
                  style={{ marginTop: 12, width: isMobile ? "100%" : undefined }}
                >
                  <InputNumber
                    size={isMobile ? "large" : "middle"}
                    style={{ width: isMobile ? "100%" : undefined }}
                    min={0.01}
                    max={remaining}
                    step={1}
                    precision={2}
                    placeholder="Amount received"
                    value={paymentAmount}
                    onChange={setPaymentAmount}
                  />
                  <Button loading={updating} disabled={!paymentAmount} onClick={recordPayment} block={isMobile}>
                    Record payment
                  </Button>
                </Space>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
