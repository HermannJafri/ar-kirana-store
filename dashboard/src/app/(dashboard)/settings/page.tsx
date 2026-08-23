"use client";

import { useEffect, useState } from "react";
import { Form, Input, InputNumber, Button, Card, message, Switch, Space, Typography, Row, Col } from "antd";
import { AimOutlined } from "@ant-design/icons";
import { authFetch } from "@/lib/api";
import { useIsMobile } from "@/lib/responsive";

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
  const isMobile = useIsMobile();

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
    <Card title="Shop settings" style={{ maxWidth: isMobile ? "100%" : 480 }}>
      <Form form={form} layout="vertical" onFinish={onFinish} disabled={loading} size={isMobile ? "large" : "middle"}>
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

        <Space style={{ marginBottom: 16, width: "100%" }}>
          <Button icon={<AimOutlined />} onClick={useCurrentLocation} loading={locating} block={isMobile}>
            Use current location
          </Button>
        </Space>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="latitude" label="Latitude">
              <InputNumber style={{ width: "100%" }} step={0.0001} placeholder="e.g. 12.9716" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="longitude" label="Longitude">
              <InputNumber style={{ width: "100%" }} step={0.0001} placeholder="e.g. 77.5946" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="deliveryRadiusKm"
          label="Delivery radius (km)"
          rules={[{ required: true, message: "Delivery radius is required" }]}
        >
          <InputNumber min={0.1} step={0.5} style={{ width: "100%" }} />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={saving} block={isMobile}>
          Save
        </Button>
      </Form>
    </Card>
  );
}
