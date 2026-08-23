"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Upload,
  message,
  Popconfirm,
  Space,
  Tabs,
  List,
  Card,
  Typography,
} from "antd";
import { UploadOutlined, TagsOutlined, DeleteOutlined, EditOutlined, CheckOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import { authFetch, API_BASE } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useIsMobile } from "@/lib/responsive";

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  unit: string | null;
  quantityAvailable: number;
  isAvailable: boolean;
  categoryId: string | null;
  category: Category | null;
}

interface ProductFormValues {
  name: string;
  description?: string;
  price: number;
  unit?: string;
  quantityAvailable: number;
  isAvailable: boolean;
  categoryId?: string;
}

export default function ProductsPage() {
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ProductFormValues>();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Tracks the most recent load() call so a slower, superseded request
  // (e.g. from React Strict Mode's double effect invocation in dev, or an
  // earlier reload overlapping a newer one) can't clobber fresher state
  // when it resolves late.
  const requestIdRef = useRef(0);

  const loadProducts = async () => {
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

  const loadCategories = async () => {
    try {
      const data = await authFetch("/categories");
      setCategories(data);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      await Promise.all([loadProducts(), loadCategories()]);
      if (ignore) return;
    })();
    return () => {
      ignore = true;
    };
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
      categoryId: product.categoryId ?? undefined,
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
      const payload = { ...values, imageUrl, categoryId: values.categoryId ?? null };
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
      loadProducts();
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
      loadProducts();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCategorySaving(true);
    try {
      await authFetch("/categories", { method: "POST", body: JSON.stringify({ name: newCategoryName.trim() }) });
      setNewCategoryName("");
      loadCategories();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setCategorySaving(false);
    }
  };

  const startRename = (c: Category) => {
    setRenamingId(c.id);
    setRenameValue(c.name);
  };

  const saveRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await authFetch(`/categories/${id}`, { method: "PATCH", body: JSON.stringify({ name: renameValue.trim() }) });
      setRenamingId(null);
      loadCategories();
      loadProducts(); // product rows embed the category name, refresh it
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await authFetch(`/categories/${id}`, { method: "DELETE" });
      message.success("Category deleted");
      loadCategories();
      loadProducts(); // products that had this category now show uncategorized
      if (activeCategory === id) setActiveCategory("all");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesCategory =
        activeCategory === "all" ||
        (activeCategory === "uncategorized" ? !p.categoryId : p.categoryId === activeCategory);
      return matchesSearch && matchesCategory;
    });
  }, [products, search, activeCategory]);

  const categoryTabs = [
    { key: "all", label: "All" },
    ...categories.map((c) => ({ key: c.id, label: c.name })),
    { key: "uncategorized", label: "Uncategorized" },
  ];

  const columns = [
    { title: "Name", dataIndex: "name" },
    {
      title: "Category",
      dataIndex: "category",
      render: (c: Category | null) => c?.name ?? <span style={{ color: "#999" }}>—</span>,
    },
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
      <Space style={{ marginBottom: 16, width: "100%", flexWrap: "wrap" }}>
        <Button type="primary" onClick={openCreate} block={isMobile}>
          Add product
        </Button>
        <Button icon={<TagsOutlined />} onClick={() => setCategoryModalOpen(true)} block={isMobile}>
          Manage categories
        </Button>
        <Input.Search
          placeholder="Search products by name"
          allowClear
          style={{ width: isMobile ? "100%" : 280 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Space>

      <Tabs
        activeKey={activeCategory}
        onChange={setActiveCategory}
        items={categoryTabs.map((t) => ({ key: t.key, label: t.label }))}
      />

      {isMobile ? (
        <List
          loading={loading}
          dataSource={filteredProducts}
          locale={{ emptyText: "No products match." }}
          renderItem={(record) => (
            <Card size="small" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <Typography.Text strong>{record.name}</Typography.Text>
                <Typography.Text type={record.isAvailable ? "success" : "secondary"}>
                  {record.isAvailable ? "Available" : "Unavailable"}
                </Typography.Text>
              </div>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                {record.category?.name ?? "Uncategorized"}
              </Typography.Text>
              <Typography.Text style={{ display: "block", marginBottom: 12 }}>
                ₹{Number(record.price).toFixed(2)}
                {record.unit ? ` / ${record.unit}` : ""} · Stock: {record.quantityAvailable}
              </Typography.Text>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button block onClick={() => openEdit(record)}>
                  Edit
                </Button>
                {record.isAvailable && (
                  <Popconfirm title="Deactivate this product?" onConfirm={() => deactivate(record.id)}>
                    <Button block danger>
                      Deactivate
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
          dataSource={filteredProducts}
          locale={{ emptyText: "No products match." }}
        />
      )}

      <Modal
        title={editing ? "Edit product" : "Add product"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        okText="Save"
        confirmLoading={saving}
        width={isMobile ? "92%" : 520}
      >
        <Form form={form} layout="vertical" size={isMobile ? "large" : "middle"}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="categoryId" label="Category">
            <Select
              allowClear
              placeholder="Uncategorized"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
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

      <Modal
        title="Manage categories"
        open={categoryModalOpen}
        onCancel={() => setCategoryModalOpen(false)}
        footer={null}
        width={isMobile ? "92%" : 520}
      >
        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Input
            size={isMobile ? "large" : "middle"}
            placeholder="New category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onPressEnter={addCategory}
          />
          <Button type="primary" size={isMobile ? "large" : "middle"} loading={categorySaving} onClick={addCategory}>
            Add
          </Button>
        </Space.Compact>
        <List
          dataSource={categories}
          locale={{ emptyText: "No categories yet." }}
          renderItem={(c) =>
            renamingId === c.id ? (
              <List.Item key={c.id}>
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    size={isMobile ? "large" : "middle"}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onPressEnter={() => saveRename(c.id)}
                    autoFocus
                  />
                  <Button
                    size={isMobile ? "large" : "middle"}
                    icon={<CheckOutlined />}
                    onClick={() => saveRename(c.id)}
                  />
                </Space.Compact>
              </List.Item>
            ) : (
              <List.Item
                key={c.id}
                actions={[
                  <Button
                    key="edit"
                    size={isMobile ? "middle" : "small"}
                    icon={<EditOutlined />}
                    onClick={() => startRename(c)}
                  />,
                  <Popconfirm
                    key="delete"
                    title="Delete this category?"
                    description="Products in it become uncategorized, not deleted."
                    onConfirm={() => deleteCategory(c.id)}
                  >
                    <Button size={isMobile ? "middle" : "small"} danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                {c.name}
              </List.Item>
            )
          }
        />
      </Modal>
    </div>
  );
}
