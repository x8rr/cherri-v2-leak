module.exports = {
	apps: [
		{
			name: "cherri",
			script: "src/index.ts",
			interpreter: "bun",
			env: {
				NODE_ENV: "production",
				PORT: 2000,
			},
			instances: 1,
			exec_mode: "fork",
			watch: false,
			max_memory_restart: "500M",
			error_file: "./logs/error.log",
			out_file: "./logs/out.log",
			log_date_format: "YYYY-MM-DD HH:mm:ss Z",
			merge_logs: true,
			autorestart: true,
			restart_delay: 4000,
			max_restarts: 1000000,
			min_uptime: "10s",
			exp_backoff_restart_delay: 2000,
		},
	],
};
