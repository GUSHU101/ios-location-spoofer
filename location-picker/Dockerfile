FROM node:22-alpine

LABEL org.opencontainers.image.title="iOS Location Picker" \
      org.opencontainers.image.description="Authenticated location picker for iOS location-spoofer modules" \
      org.opencontainers.image.source="https://github.com/GUSHU101/ios-location-spoofer"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_FILE=/data/loc.json

WORKDIR /app

COPY --chown=node:node package.json package-lock.json server.js ./

RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
