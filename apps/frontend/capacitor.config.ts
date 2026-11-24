import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.facturacionsis.app",
  appName: "Facturacion SIS",
  webDir: "out",
  server: {
    url: "http://192.168.1.125:3000",
    cleartext: true,
    androidScheme: "https"
  }
};

export default config;
