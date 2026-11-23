FROM debian:bookworm-slim AS llama-builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl cmake ninja-build g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN curl -Lf https://github.com/ggml-org/llama.cpp/archive/7fe450e19305b828c199d602c23a8337aaa1f03b.tar.gz | tar xz --strip-components=1
RUN cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF && cmake --build build --target llama-server -j4

FROM python:3.11-slim-bookworm
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 OCR_MODEL_ROOT=/opt/ocr-models
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 nginx tini antiword && rm -rf /var/lib/apt/lists/*
WORKDIR /app/ocr-service
COPY ocr-service/requirements.txt .
RUN pip install -r requirements.txt
COPY ocr-service/ .
COPY --from=llama-builder /src/build/bin/llama-server /usr/local/bin/llama-server
RUN python bundle_language_model.py
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
