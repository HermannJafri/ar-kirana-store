"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Col, DatePicker, message, Row, Segmented, Spin, Statistic, Typography } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { authFetch } from "@/lib/api";
import SalesByItemChart, { ProductSales } from "./SalesByItemChart";

const { RangePicker } = DatePicker;

interface SalesResponse {
  summary: { totalRevenue: number; orderCount: number; avgOrderValue: number };
  byProduct: ProductSales[];
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, "day"), dayjs()]);
  const [metric, setMetric] = useState<"revenue" | "quantity">("revenue");
  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const from = range[0].format("YYYY-MM-DD");
    const to = range[1].format("YYYY-MM-DD");
    authFetch(`/analytics/sales?from=${from}&to=${to}`)
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setData(res);
      })
      .catch((e) => {
        if (requestId !== requestIdRef.current) return;
        message.error((e as Error).message);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [range]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Sales Analytics
        </Typography.Title>
        <RangePicker
          value={range}
          allowClear={false}
          onChange={(values) => {
            if (values && values[0] && values[1]) setRange([values[0], values[1]]);
          }}
        />
      </div>

      <Spin spinning={loading}>
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card>
              <Statistic
                title="Total revenue"
                value={data?.summary.totalRevenue ?? 0}
                precision={2}
                prefix="₹"
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic title="Orders" value={data?.summary.orderCount ?? 0} />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="Average order value"
                value={data?.summary.avgOrderValue ?? 0}
                precision={2}
                prefix="₹"
              />
            </Card>
          </Col>
        </Row>

        <Card
          title="Sales by item"
          extra={
            <Segmented
              value={metric}
              onChange={(v) => setMetric(v as "revenue" | "quantity")}
              options={[
                { label: "By Revenue", value: "revenue" },
                { label: "By Quantity", value: "quantity" },
              ]}
            />
          }
        >
          <SalesByItemChart data={data?.byProduct ?? []} metric={metric} />
        </Card>
      </Spin>
    </div>
  );
}
