FROM node:22-bookworm-slim
WORKDIR /app
COPY backend ./backend
COPY public/emergency-guides ./public/emergency-guides
WORKDIR /app/backend
ENV APP_ENV=production HOST=0.0.0.0 PORT=8787 DATABASE_PATH=/app/backend/data/nuresq.sqlite
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--env-file-if-exists=.env", "server.mjs"]
