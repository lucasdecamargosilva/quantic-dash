import type { NextConfig } from "next";

// Em produção dentro do quantic-dash, o Express faz proxy de /fotos/* pra cá.
// Setando NEXT_PUBLIC_BASE_PATH=/fotos no build, o Next serve assets sob esse
// prefixo E o valor fica disponível no client (process.env.NEXT_PUBLIC_*).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  allowedDevOrigins: ["192.168.15.4", "192.168.15.*"],
};

export default nextConfig;
