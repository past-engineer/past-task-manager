import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // ホームディレクトリ等の別 lockfile を誤検出する警告を防ぐため、
  // このプロジェクトを明示的にルートとして指定
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
