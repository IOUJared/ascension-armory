import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const pagesBasePath = process.env.PAGES_BASE_PATH
  ?? (process.env.GITHUB_ACTIONS === "true" && repositoryName && !repositoryName.endsWith(".github.io") ? `/${repositoryName}` : "");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: pagesBasePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: pagesBasePath,
  },
  typedRoutes: true,
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "db.ascension.gg",
        pathname: "/static/images/wow/icons/**",
      },
    ],
  },
};

export default nextConfig;
