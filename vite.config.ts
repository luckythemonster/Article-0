import { defineConfig } from "vite";

// Article Zero runs as a static Phaser game. Assets (the edplay map + the three
// spritesheets) live in `public/assets` and are served verbatim.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 2000,
  },
});
