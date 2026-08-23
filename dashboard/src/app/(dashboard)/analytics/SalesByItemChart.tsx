"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

export interface ProductSales {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
}

interface Props {
  data: ProductSales[];
  metric: "quantity" | "revenue";
}

const MARGIN_DESKTOP = { top: 16, right: 16, bottom: 48, left: 64 };
const MARGIN_MOBILE = { top: 16, right: 8, bottom: 64, left: 40 };
const MOBILE_BREAKPOINT = 480;
const HEIGHT = 360;

export default function SalesByItemChart({ data, metric }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    const draw = () => {
      const width = container.clientWidth || 600;
      const isNarrow = width < MOBILE_BREAKPOINT;
      const MARGIN = isNarrow ? MARGIN_MOBILE : MARGIN_DESKTOP;
      const fontSize = isNarrow ? "10px" : "12px";
      const labelRotation = isNarrow ? -45 : -25;
      const innerWidth = width - MARGIN.left - MARGIN.right;
      const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

      const svg = d3.select(svgEl);
      svg.selectAll("*").remove();
      svg.attr("width", width).attr("height", HEIGHT).attr("viewBox", `0 0 ${width} ${HEIGHT}`);

      const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

      if (data.length === 0) {
        g.append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight / 2)
          .attr("text-anchor", "middle")
          .attr("fill", "#8c8c8c")
          .text("No sales in this date range.");
        return;
      }

      const sorted = [...data].sort((a, b) => b[metric] - a[metric]);

      const x = d3
        .scaleBand()
        .domain(sorted.map((d) => d.productName))
        .range([0, innerWidth])
        .padding(0.3);

      const y = d3
        .scaleLinear()
        .domain([0, d3.max(sorted, (d) => d[metric]) ?? 0])
        .nice()
        .range([innerHeight, 0]);

      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", `rotate(${labelRotation})`)
        .style("text-anchor", "end")
        .style("font-size", fontSize);

      g.append("g")
        .call(
          d3
            .axisLeft(y)
            .ticks(isNarrow ? 4 : 5)
            .tickFormat((v) => (metric === "revenue" ? `₹${v}` : `${v}`))
        )
        .style("font-size", fontSize);

      g.selectAll(".bar")
        .data(sorted)
        .join("rect")
        .attr("class", "bar")
        .attr("x", (d) => x(d.productName) ?? 0)
        .attr("y", (d) => y(d[metric]))
        .attr("width", x.bandwidth())
        .attr("height", (d) => innerHeight - y(d[metric]))
        .attr("fill", "#1677ff")
        .attr("rx", 3);

      g.selectAll(".bar-label")
        .data(sorted)
        .join("text")
        .attr("class", "bar-label")
        .attr("x", (d) => (x(d.productName) ?? 0) + x.bandwidth() / 2)
        .attr("y", (d) => y(d[metric]) - 6)
        .attr("text-anchor", "middle")
        .style("font-size", fontSize)
        .text((d) => (metric === "revenue" ? `₹${d[metric].toFixed(0)}` : `${d[metric]}`));
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [data, metric]);

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg ref={svgRef} />
    </div>
  );
}
