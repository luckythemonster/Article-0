import { defineConfig } from "vite";

// Article Zero runs as a static Phaser game. Assets (the edplay map + the three
// spritesheets) live in `public/assets` and are served verbatim.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // Multi-page: the game itself plus the standalone Doctrinal Compliance
      // minigame demo (playable in isolation at /compliance-demo.html).
      input: {
        main: "index.html",
        demo: "compliance-demo.html",
      },
    },
  },
});
