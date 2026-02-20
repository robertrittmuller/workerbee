# WorkerBee

WorkerBee is a visual AI agent platform that enables non-technical users to accomplish real-world work tasks. Users can create visual workflows by connecting input data (files) to AI agents, which process the data and produce outputs.

## Features

- **Visual Workflow Builder**: Drag-and-drop interface using ReactFlow for creating workflows
- **Multi-format Input Support**: Upload PDFs, Word documents, Excel spreadsheets, PowerPoint presentations, CSV files, and images
- **AI Agent Integration**: Powered by LangGraph and liteLLM for multi-provider LLM access
- **Sandboxed Code Execution**: Secure Python code execution in isolated Docker containers
- **Multiple Output Formats**: Generate Word documents, Excel files, PDFs, CSV, and more
- **Real-time Execution Monitoring**: Watch agents work with live log streaming

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Dashboard  │  │  Workflow   │  │     Settings/Profile    │  │
│  │             │  │  Editor     │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                           │                                      │
│                    ReactFlow + Zustand                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Auth API   │  │  Workflow   │  │    Execution Engine     │  │
│  │             │  │  API        │  │    (LangGraph)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                           │                                      │
│                    liteLLM + SQLAlchemy                         │
└─────────────────────────────────────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    ┌───────────┐    ┌───────────┐    ┌───────────┐
    │ PostgreSQL│    │   MinIO   │    │   Redis   │
    │ (Database)│    │ (Storage) │    │  (Cache)  │
    └───────────┘    └───────────┘    └───────────┘
```

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development
- **TailwindCSS** for styling
- **ReactFlow** for visual workflow builder
- **Zustand** for state management
- **TanStack Query** for data fetching

### Backend
- **FastAPI** with Python 3.11
- **SQLAlchemy** async with PostgreSQL
- **LangGraph** for agent orchestration
- **liteLLM** for multi-provider LLM access
- **MinIO** for object storage
- **Redis** for caching and task queues

### Infrastructure
- **Docker Compose** for local development
- **Kubernetes/Helm** for production deployment

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Quick Start with Docker

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/workerbee.git
   cd workerbee
   ```

2. Create environment file:
   ```bash
   cp .env.example .env
   # Edit .env and add your API keys
   ```

3. Start the services:
   ```bash
   docker-compose up -d
   ```

4. Access the application:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - MinIO Console: http://localhost:9001

### Local Development

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

#### Backend

```bash
cd backend
pip install poetry
poetry install
poetry run uvicorn app.main:app --reload
```

## Project Structure

```
workerbee/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page components
│   │   ├── store/            # Zustand stores
│   │   ├── lib/              # API client and utilities
│   │   └── hooks/            # Custom React hooks
│   ├── public/
│   └── package.json
│
├── backend/                  # FastAPI backend application
│   ├── app/
│   │   ├── routers/          # API route handlers
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── auth.py           # Authentication utilities
│   │   ├── database.py       # Database configuration
│   │   ├── config.py         # Application settings
│   │   └── agent/            # LangGraph agent implementation
│   └── pyproject.toml
│
├── sandbox/                  # Sandbox container for code execution
│   └── Dockerfile
│
├── docker-compose.yml        # Local development setup
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/me` - Get current user

### Workflows
- `GET /api/v1/workflows` - List workflows
- `POST /api/v1/workflows` - Create workflow
- `GET /api/v1/workflows/{id}` - Get workflow
- `PUT /api/v1/workflows/{id}` - Update workflow
- `DELETE /api/v1/workflows/{id}` - Delete workflow

### Agents
- `GET /api/v1/agents` - List agents
- `POST /api/v1/agents` - Create agent
- `GET /api/v1/agents/models` - List available LLM models

### Tasks
- `GET /api/v1/tasks` - List tasks
- `POST /api/v1/tasks` - Create task
- `GET /api/v1/tasks/templates` - List task templates

### Files
- `GET /api/v1/files` - List files
- `POST /api/v1/files/upload` - Upload file
- `GET /api/v1/files/{id}/download` - Download file

### Executions
- `GET /api/v1/executions` - List executions
- `POST /api/v1/executions` - Create execution
- `GET /api/v1/executions/{id}/stream` - Stream execution logs (SSE)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection URL | Required |
| `SECRET_KEY` | JWT secret key | Required |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `ANTHROPIC_API_KEY` | Anthropic API key | Optional |
| `MINIO_ENDPOINT` | MinIO endpoint | `minio:9000` |
| `MINIO_ACCESS_KEY` | MinIO access key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO secret key | `minioadmin_secret` |

## License

MIT License - see LICENSE file for details.