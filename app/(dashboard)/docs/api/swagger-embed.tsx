"use client";

import { useEffect, useRef } from "react";

// Hosts swagger-ui-dist from the CDN inside an iframe-free div. Avoids
// pulling swagger-ui-react as a dependency (~3MB at runtime) while
// still giving the full "Try it out" experience.
export function SwaggerEmbed() {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    if (document.getElementById("swagger-ui-style")) return; // already mounted

    const style = document.createElement("link");
    style.id = "swagger-ui-style";
    style.rel = "stylesheet";
    style.href = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(style);

    const script = document.createElement("script");
    script.id = "swagger-ui-bundle";
    script.src =
      "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      const w = window as unknown as {
        SwaggerUIBundle: (opts: Record<string, unknown>) => unknown;
      };
      w.SwaggerUIBundle({
        url: "/api/v1/openapi.json",
        dom_id: "#xyra-swagger",
        deepLinking: true,
        layout: "BaseLayout",
      });
    };
    document.body.appendChild(script);
  }, []);

  return <div id="xyra-swagger" ref={containerRef} />;
}
