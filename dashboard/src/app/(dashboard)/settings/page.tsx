"use client";

import { useEffect, useState } from "react";
import { Form, Input, Button, Card, message, Switch } from "antd";
import { authFetch } from "@/lib/api";

interface Shop {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
}

interface ShopFormValues {
  name: string;
  address?: string;
  isActive: boolean;
}

export default function SettingsPage() {
  const [form] = Form.useForm<ShopFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Guards against React Strict Mode's double effect invocation in dev:
    // without `ignore`, a second in-flight GET can resolve after the user
    // has already started editing and silently overwrite their input.
    let ignore = false;
    authFetch("/shop")
      .then((shop: Shop) => {
        if (ignore) return;
        form.setFieldsValue({
          name: shop.name,
          address: shop.address ?? undefined,
          isActive: shop.isActive,
        });
      })
      .catch((e) => {
        if (!ignore) message.error((e as Error).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFinish = async (values: ShopFormValues) => {
    setSaving(true);
    try {
      await authFetch("/shop", { method: "PATCH", body: JSON.stringify(values) });
      message.success("Shop settings saved");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Shop settings" style={{ maxWidth: 480 }}>
      <Form form={form} layout="vertical" onFinish={onFinish} disabled={loading}>
        <Form.Item name="name" label="Shop name" rules={[{ required: true, message: "Shop name is required" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="address" label="Address">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="isActive" label="Shop active" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>
          Save
        </Button>
      </Form>
    </Card>
  );
}
