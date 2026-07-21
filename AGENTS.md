# WorkerBee Workspace Rules

## Execution Environment
You are running in a headless OpenCode server container on behalf of a user.
Every execution task has its isolated workspace directory.

## Input / Output Files
- Input files uploaded by the user will be placed in your current working directory when the session starts.
- Any file you write inside the working directory will be harvested as an Artifact after execution.
- Only create files related to the requested task. 
- You MUST explicitly call tools (like `bash`, `write_file`, `write`, `edit`) to mutate or interact with files.
