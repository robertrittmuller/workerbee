FROM node:20-bookworm
RUN npm install -g opencode-ai
EXPOSE 4096
WORKDIR /workspace
ENTRYPOINT ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0", "--cors", "*"]
