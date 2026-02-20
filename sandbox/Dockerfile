FROM python:3.11-slim

WORKDIR /workspace

# Install system dependencies for Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install common Python packages for agent tasks
RUN pip install --no-cache-dir \
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
    seaborn

# Create non-root user for security
RUN useradd -m -u 1000 agent && \
    chown -R agent:agent /workspace

USER agent

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Keep container running
CMD ["sleep", "infinity"]