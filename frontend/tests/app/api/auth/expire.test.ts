// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/auth/expire/route";

function expire(query: string) {
  return GET(new NextRequest(`http://localhost:3000/api/auth/expire${query}`));
}

describe("GET /api/auth/expire", () => {
  it("supprime les deux cookies et redirige vers /login?expired=1 avec next", () => {
    const response = expire("?next=%2Ftrips%2F3");

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/login?expired=1&next=%2Ftrips%2F3",
    );
    const setCookie = response.headers.getSetCookie();
    expect(setCookie).toHaveLength(2);
    for (const name of ["th_access", "th_refresh"]) {
      const header = setCookie.find((value) => value.startsWith(`${name}=;`));
      expect(header).toContain("Path=/");
      expect(header).toContain("Expires=Thu, 01 Jan 1970");
    }
  });

  it("remplace un next dangereux par /dashboard", () => {
    const response = expire("?next=//evil.com");

    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/login?expired=1&next=%2Fdashboard",
    );
  });
});
