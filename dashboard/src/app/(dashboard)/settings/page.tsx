"use client";

import { useEffect, useState } from "react";
import { Form, Input, InputNumber, Button, Card, message, Switch, Space, Typography } from "antd";
import { AimOutlined } from "@ant-design/icons";
import { authFetch } from "@/lib/api";

interface Shop {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  latitude: number | null;
  longitude: number | null;
  deliveryRadiusKm: number;
}

interface ShopFormValues {
  name: string;
  address?: string;
  isActive: boolean;
  latitude?: number;
  longitude?: number;
  deliveryRadiusKm: number;
}

export default function SettingsPage() {
  const [form] = Form.useForm<ShopFormValues>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

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
          latitude: shop.latitude ?? undefined,
          longitude: shop.longitude ?? undefined,
          deliveryRadiusKm: shop.deliveryRadiusKm,
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

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      message.error("Geolocation isn't available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.setFieldsValue({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        message.success("Location captured");
        setLocating(false);
      },
      (err) => {
        message.error(`Could not get location: ${err.message}`);
        setLocating(false);
      }
    );
  };

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

        <Typography.Title level={5} style={{ marginTop: 8 }}>
          Delivery service area
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
          Used to check whether a customer&apos;s address is within delivery range —
          set this once from the shop, or enter coordinates manually.
        </Typography.Paragraph>

        <Space style={{ marginBottom: 16 }}>
          <Button icon={<AimOutlined />} onClick={useCurrentLocation} loading={locating}>
            Use current location
          </Button>
        </Space>

        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Form.Item name="latitude" label="Latitude" style={{ width: "50%" }}>
            <InputNumber style={{ width: "100%" }} step={0.0001} placeholder="e.g. 12.9716" />
          </Form.Item>
          <Form.Item name="longitude" label="Longitude" style={{ width: "50%" }}>
            <InputNumber style={{ width: "100%" }} step={0.0001} placeholder="e.g. 77.5946" />
          </Form.Item>
        </Space.Compact>

        <Form.Item
          name="deliveryRadiusKm"
          label="Delivery radius (km)"
          rules={[{ required: true, message: "Delivery radius is required" }]}
        >
          <InputNumber min={0.1} step={0.5} style={{ width: "100%" }} />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={saving}>
          Save
        </Button>
      </Form>
    </Card>
  );
}
