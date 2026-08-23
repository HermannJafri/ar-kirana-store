"use client";

import { useEffect, useRef, useState } from "react";
import { Table, InputNumber, Tag, message, Typography, List, Card, Space } from "antd";
import { authFetch } from "@/lib/api";
import { useIsMobile } from "@/lib/responsive";

const LOW_STOCK_THRESHOLD = 5;

interface Product {
  id: string;
  name: string;
  unit: string | null;
  quantityAvailable: number;
  isAvailable: boolean;
  category: { id: string; name: string } | null;
}

function statusTag(record: Product) {
  if (!record.isAvailable) return <Tag>Deactivated</Tag>;
  if (record.quantityAvailable === 0) return <Tag color="red">Out of stock</Tag>;
  if (record.quantityAvailable <= LOW_STOCK_THRESHOLD) return <Tag color="orange">Low stock</Tag>;
  return <Tag color="green">In stock</Tag>;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const requestIdRef = useRef(0);

  const load = async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const data = await authFetch("/products");
      if (requestId !== requestIdRef.current) return;
      setProducts(data);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      message.error((e as Error).message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateQuantity = async (id: string, quantityAvailable: number) => {
    setSavingId(id);
    // Optimistic update so the input doesn't visually snap back while saving.
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, quantityAvailable } : p)));
    try {
      await authFetch(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantityAvailable }),
      });
    } catch (e) {
      message.error((e as Error).message);
      load(); // revert to server truth on failure
    } finally {
      setSavingId(null);
    }
  };

  const columns = [
    { title: "Name", dataIndex: "name" },
    {
      title: "Category",
      dataIndex: "category",
      render: (c: Product["category"]) => c?.name ?? <span style={{ color: "#999" }}>—</span>,
    },
    { title: "Unit", dataIndex: "unit" },
    {
      title: "Stock",
      dataIndex: "quantityAvailable",
      render: (qty: number, record: Product) => (
        <InputNumber
          min={0}
          value={qty}
          disabled={savingId === record.id}
          onChange={(value) => {
            if (value !== null) updateQuantity(record.id, value);
          }}
          style={{ width: 90 }}
        />
      ),
    },
    {
      title: "Status",
      render: (_: unknown, record: Product) => statusTag(record),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>Inventory</Typography.Title>
      <Typography.Paragraph type="secondary">
        Edit stock quantities directly — changes save as you type.
      </Typography.Paragraph>

      {isMobile ? (
        <List
          loading={loading}
          dataSource={products}
          locale={{ emptyText: "No products yet." }}
          renderItem={(record) => (
            <Card size="small" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <Typography.Text strong>{record.name}</Typography.Text>
                {statusTag(record)}
              </div>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                {record.category?.name ?? "Uncategorized"}
                {record.unit ? ` · ${record.unit}` : ""}
              </Typography.Text>
              <Space align="center">
                <Typography.Text>Stock:</Typography.Text>
                <InputNumber
                  size="large"
                  min={0}
                  value={record.quantityAvailable}
                  disabled={savingId === record.id}
                  onChange={(value) => {
                    if (value !== null) updateQuantity(record.id, value);
                  }}
                  style={{ width: 120 }}
                />
              </Space>
            </Card>
          )}
        />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={products}
          locale={{ emptyText: "No products yet." }}
          scroll={{ x: "max-content" }}
        />
      )}
    </div>
  );
}
