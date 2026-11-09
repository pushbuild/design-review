# ghcr.io/pushbuild/design-review: the code behind the design-review Claude Code plugin.
# Headless Chromium + Playwright (ui-audit, pagemetrics) and python3 (mockup.py, standard library only).
FROM mcr.microsoft.com/playwright:v1.62.0-noble
ARG VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/pushbuild/design-review" \
      org.opencontainers.image.description="design-review for Claude Code: viewport-sweep layout audit, page metrics and optional redesign mockups" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
WORKDIR /app
RUN npm init -y >/dev/null && npm i --silent --no-audit --no-fund playwright@1.62.0 && npm cache clean --force \
 && python3 --version
COPY uiaudit.mjs uiaudit.js pagemetrics.mjs mockup.py fixture.html /app/
COPY entrypoint.sh /usr/local/bin/design-review
RUN chmod 0755 /usr/local/bin/design-review && chmod -R a+rX /app
ENV HOME=/tmp
WORKDIR /work
ENTRYPOINT ["design-review"]
CMD ["help"]
