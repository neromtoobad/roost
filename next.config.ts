import type { NextConfig } from "next";

// The pets became managers. Old links still land somewhere that makes sense.
const nextConfig: NextConfig = {
  redirects() {
    return [
      { source: '/adopt', destination: '/managers', permanent: false },
      { source: '/shelf', destination: '/managers', permanent: false },
      { source: '/nest', destination: '/', permanent: false },
      { source: '/litter', destination: '/mandate', permanent: false },
      { source: '/duels', destination: '/league', permanent: false },
      { source: '/diary', destination: '/letters', permanent: false },
    ];
  },
};

export default nextConfig;
