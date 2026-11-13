import "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
var vite_config_default = defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		host: true,
		proxy: {
			"/api": "http://localhost:5001",
			"/socket.io": {
				target: "http://localhost:5001",
				ws: true
			}
		}
	}
});
export { vite_config_default as default };

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidml0ZS5jb25maWcuanMiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiL3Nlc3Npb25zL3Jjdy0wMTh4amNnamRwa3U1ZWF5aHlrN25xYnovbW50L0FiZCBDYWxsIENlbnRlci9jbGllbnQvdml0ZS5jb25maWcuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBob3N0OiB0cnVlLFxyXG4gICAgcHJveHk6IHtcclxuICAgICAgJy9hcGknOiAnaHR0cDovL2xvY2FsaG9zdDo1MDAxJyxcclxuICAgICAgJy9zb2NrZXQuaW8nOiB7IHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NTAwMScsIHdzOiB0cnVlIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiI7OztBQUdBLElBQUEsc0JBQWUsYUFBYTtDQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0NBQ2pCLFFBQVE7RUFDTixNQUFNO0VBQ04sTUFBTTtFQUNOLE9BQU87R0FDTCxRQUFRO0dBQ1IsY0FBYztJQUFFLFFBQVE7SUFBeUIsSUFBSTtHQUFLO0VBQzVEO0NBQ0Y7QUFDRixDQUFDIn0=