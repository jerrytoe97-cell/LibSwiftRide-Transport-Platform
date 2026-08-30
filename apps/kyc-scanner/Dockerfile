FROM clamav/clamav-debian:1.4.6@sha256:f6da737f9399d6a1851c463b2f88d02021a67f969ec42dd6e1751fecf7c3de4f

USER root
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./package.json
COPY src ./src
COPY docker/entrypoint.sh /usr/local/bin/kyc-scanner-entrypoint

RUN chmod 0555 /usr/local/bin/kyc-scanner-entrypoint \
    && mkdir -p /run/clamav /var/log/clamav \
    && chown -R clamav:clamav /run/clamav /var/log/clamav /var/lib/clamav \
    && sed -i -E 's/^(LocalSocket|TCPSocket|TCPAddr|Foreground|StreamMaxLength)[[:space:]].*/# &/' /etc/clamav/clamd.conf \
    && printf '\nTCPSocket 3310\nTCPAddr 127.0.0.1\nForeground true\nStreamMaxLength 10M\nLogTime true\n' >> /etc/clamav/clamd.conf

ENV NODE_ENV=production PORT=10000 CLAMD_HOST=127.0.0.1 CLAMD_PORT=3310
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=10s --start-period=14m --retries=3 CMD node -e "fetch('http://127.0.0.1:10000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["kyc-scanner-entrypoint"]
