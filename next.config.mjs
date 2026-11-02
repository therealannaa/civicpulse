/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Native / heavy server packages are loaded with Node's require at runtime
    // instead of being bundled by webpack.
    serverComponentsExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp', 'pg'],
  },
};

export default nextConfig;
