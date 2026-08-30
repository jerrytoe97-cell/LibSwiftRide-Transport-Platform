FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates clamav clamav-daemon \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./package.json
COPY src ./src
COPY docker/entrypoint.sh /usr/local/bin/kyc-scanner-entrypoint

RUN chmod 0555 /usr/local/bin/kyc-scanner-entrypoint \
    && mkdir -p /run/clamav /var/log/clamav \
    && chown -R clamav:clamav /run/clamav /var/log/clamav /var/lib/clamav \
    && sed -i 's/^LocalSocket /#LocalSocket /' /etc/clamav/clamd.conf \
    && printf '\nTCPSocket 3310\nTCPAddr 127.0.0.1\nForeground true\nStreamMaxLength 10M\nLogTime true\n' >> /etc/clamav/clamd.conf

ENV NODE_ENV=production PORT=10000 CLAMD_HOST=127.0.0.1 CLAMD_PORT=3310
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:10000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["kyc-scanner-entrypoint"]
