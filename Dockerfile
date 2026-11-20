FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 OCR_MODEL_ROOT=/opt/ocr-models
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 nginx tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app/ocr-service
COPY ocr-service/requirements.txt .
RUN pip install -r requirements.txt
COPY ocr-service/ .
RUN python bundle_models.py && rm -rf /root/.paddlex /root/.cache
WORKDIR /app
COPY index.html styles.css script.js welcome.js welcome.css compare-browser.js image-proofreader.js ocr-word-locator.js ocr-word-locator-v2.js /app/site/
COPY assets /app/site/assets
COPY vendor /app/site/vendor
COPY ocr-service/nginx.conf /etc/nginx/nginx.conf
RUN chmod +x /app/ocr-service/start.sh && chown -R www-data:www-data /app /opt/ocr-models /var/lib/nginx /var/log/nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/ocr/health', timeout=4)"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/ocr-service/start.sh"]
