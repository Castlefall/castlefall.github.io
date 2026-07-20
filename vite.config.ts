import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import { config } from "./shared/src/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function getBasePath(): string {
	const rawBase = process.env.VITE_BASE_PATH?.trim() || "/";
	if (/^https?:\/\//.test(rawBase)) {
		return rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
	}

	const withLeadingSlash = rawBase.startsWith("/") ? rawBase : `/${rawBase}`;
	return withLeadingSlash.endsWith("/")
		? withLeadingSlash
		: `${withLeadingSlash}/`;
}

export default defineConfig({
	appType: "spa",
	base: getBasePath(),
	root: "public",
	publicDir: false,

	resolve: {
		alias: {
			"@shared": path.resolve(rootDir, "shared/src"),
		},
	},

	build: {
		outDir: "../dist/public",
		emptyOutDir: true,
	},

	server: {
		host: "0.0.0.0",
		port: config.clientPort,
		allowedHosts: true,
		fs: {
			allow: [rootDir],
		},
		proxy: {
			"/socket.io": {
				target: `http://localhost:${config.serverPort}`,
				ws: true,
				changeOrigin: true,
			},
		},
	},
	preview: {
		host: "0.0.0.0",
		port: config.clientPort,
		strictPort: true,
	},
});
