FROM python:3.11-slim

WORKDIR /srv

# Install system dependencies for Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    jq \
    unzip \
    zip \
    file \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install common Python packages for agent tasks
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    pandas \
    numpy \
    openpyxl \
    python-docx \
    python-pptx \
    PyPDF2 \
    pdfplumber \
    Pillow \
    requests \
    httpx \
    beautifulsoup4 \
    lxml \
    markdown \
    jinja2 \
    matplotlib \
    seaborn \
    pyyaml \
    tabulate \
    reportlab \
    scikit-learn \
    scipy

# Create non-root user for security
RUN useradd -m -u 1000 agent && \
    mkdir -p /workspace && \
    chown -R agent:agent /workspace /srv

USER agent

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV SANDBOX_WORKSPACE_ROOT=/workspace

COPY app /srv/app

EXPOSE 9000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
