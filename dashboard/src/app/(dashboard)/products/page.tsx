"use client";

import { useEffect, useRef, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Upload,
  message,
  Popconfirm,
  Space,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { authFetch, API_BASE } from "@/lib/api";
import { auth } from "@/lib/firebase";

interface Product {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  unit: string | null;
  quantityAvailable: number;
  isAvailable: boolean;
}

interface ProductFormValues {
  name: string;
  description?: string;
  price: number;
  unit?: string;
  quantityAvailable: number;
  isAvailable: boolean;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ProductFormValues>();

  // Tracks the most recent load() call so a slower, superseded request
  // (e.g. from React Strict Mode's double effect invocation in dev, or an
  // earlier reload overlapping a newer one) can't clobber fresher state
  // when it resolves late.
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

  const openCreate = () => {
    setEditing(null);
    setImageUrl(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setImageUrl(product.imageUrl);
    form.setFieldsValue({
      name: product.name,
      description: product.description ?? undefined,
      price: Number(product.price),
      unit: product.unit ?? undefined,
      quantityAvailable: product.quantityAvailable,
      isAvailable: product.isAvailable,
    });
    setModalOpen(true);
  };

  const handleUpload: UploadProps["customRequest"] = async (options) => {
    const { file, onSuccess, onError } = options;
    setUploading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append("image", file as File);
      const res = await fetch(`${API_BASE}/uploads/product-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Image upload failed");
      const data = await res.json();
      setImageUrl(data.url);
      onSuccess?.(data);
    } catch (e) {
      message.error((e as Error).message);
      onError?.(e as Error);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = { ...values, imageUrl };
      if (editing) {
        await authFetch(`/products/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        message.success("Product updated");
      } else {
        await authFetch("/products", { method: "POST", body: JSON.stringify(payload) });
        message.success("Product created");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: string) => {
    try {
      await authFetch(`/products/${id}`, { method: "DELETE" });
      message.success("Product deactivated");
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns = [
    { title: "Name", dataIndex: "name" },
    {
      title: "Price",
      dataIndex: "price",
      render: (p: string) => `₹${Number(p).toFixed(2)}`,
    },
    { title: "Unit", dataIndex: "unit" },
    { title: "Stock", dataIndex: "quantityAvailable" },
    {
      title: "Available",
      dataIndex: "isAvailable",
      render: (v: boolean) => (v ? "Yes" : "No"),
    },
    {
      title: "Actions",
      render: (_: unknown, record: Product) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
          {record.isAvailable && (
            <Popconfirm title="Deactivate this product?" onConfirm={() => deactivate(record.id)}>
              <Button size="small" danger>
                Deactivate
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          Add product
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={products}
        locale={{ emptyText: "No products yet — add your first one." }}
      />
      <Modal
        title={editing ? "Edit product" : "Add product"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        okText="Save"
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Image">
            <Upload customRequest={handleUpload} showUploadList={false} accept="image/*">
              <Button icon={<UploadOutlined />} loading={uploading}>
                Upload image
              </Button>
            </Upload>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Product"
                style={{ marginTop: 8, maxWidth: "100%", maxHeight: 120 }}
              />
            )}
          </Form.Item>
          <Form.Item name="price" label="Price (₹)" rules={[{ required: true, message: "Price is required" }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="unit" label="Unit (e.g. kg, pack, pc)">
            <Input />
          </Form.Item>
          <Form.Item
            name="quantityAvailable"
            label="Quantity available"
            rules={[{ required: true, message: "Quantity is required" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="isAvailable" label="Available for order" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
