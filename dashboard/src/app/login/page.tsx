"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Button, Form, Input, Alert, Card, Typography } from "antd";
import { auth } from "@/lib/firebase";
import { usernameToEmail } from "@/lib/auth";

interface LoginValues {
  username: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginValues) => {
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, usernameToEmail(values.username), values.password);
      router.replace("/products");
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Card style={{ width: 360 }}>
        <Typography.Title level={3}>Kirana Store — Staff Login</Typography.Title>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="Username" rules={[{ required: true, message: "Enter your username" }]}>
            <Input autoComplete="username" autoCorrect="off" autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Log in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
